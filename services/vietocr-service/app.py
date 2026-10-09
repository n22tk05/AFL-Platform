import base64
import io
import logging
import os
import time
import math
import tempfile
import threading
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
import torch

from vietocr.tool.config import Cfg
from vietocr.tool.predictor import Predictor, process_input
from vietocr.tool.translate import translate as upstream_translate
from decoding import translate as cached_translate, supports_cached_decoder
from model_optimization import fuse_cnn_batch_norm
from segmentation import segment_page

def bounded_setting(name, default, maximum):
    value = int(os.getenv(name, str(default)))
    if not 1 <= value <= maximum:
        raise ValueError(f'{name} must be between 1 and {maximum}')
    return value


INFERENCE_WORKERS = bounded_setting('VIETOCR_INFERENCE_WORKERS', 2, 2)
DECODER_MODE = os.getenv('VIETOCR_DECODER', 'cached')
if DECODER_MODE not in ('cached', 'original'):
    raise ValueError('VIETOCR_DECODER must be cached or original')
FUSE_CNN = os.getenv('VIETOCR_FUSE_CNN', '1')
if FUSE_CNN not in ('0', '1'):
    raise ValueError('VIETOCR_FUSE_CNN must be 0 or 1')
translate = cached_translate if DECODER_MODE == 'cached' else upstream_translate

# Limit oversubscription when two exact-width CPU batches execute concurrently.
cpu_cores = os.cpu_count() or 4
torch.set_num_threads(bounded_setting('VIETOCR_THREADS', max(1, min(3, cpu_cores // INFERENCE_WORKERS)), 64))
if hasattr(torch, "set_num_interop_threads"):
    try:
        torch.set_num_interop_threads(2)
    except Exception:
        pass
torch.set_grad_enabled(False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("vietocr-service")

SERVICE_DIR = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_LINES = 1000
DETECTION_WIDTH = 2400
BATCH_SIZE = 8
inference_lock = threading.Lock()

app = FastAPI(
    title="VietOCR Microservice (High Performance)",
    description="High-throughput Vietnamese line OCR service with batch inference and OpenCV line segmentation",
    version="1.4.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global predictor instance
predictor: Optional[Predictor] = None
device: str = "cuda:0" if torch.cuda.is_available() else "cpu"

@app.on_event("startup")
def load_model():
    global predictor, device
    predictor = None
    config_path = Path(os.getenv("VIETOCR_CONFIG_PATH", str(SERVICE_DIR / "inference.yml")))
    if os.getenv("VIETOCR_MODEL", "vgg_transformer") != "vgg_transformer" and not os.getenv("VIETOCR_CONFIG_PATH"):
        raise RuntimeError("A different VIETOCR_MODEL requires its matching local VIETOCR_CONFIG_PATH")
    config = Cfg.load_config_from_file(str(config_path))
    configured_weights = os.getenv("VIETOCR_WEIGHTS_PATH")
    weights_name = Path(config["weights"]).name
    candidates = [Path(configured_weights)] if configured_weights else [
        SERVICE_DIR / ".cache" / weights_name,
        Path(tempfile.gettempdir()) / weights_name,
    ]
    weights = next((candidate for candidate in candidates if candidate.is_file()), None)
    if weights is None:
        raise RuntimeError("VietOCR weights missing. Run services/vietocr-service/setup.ps1 or set VIETOCR_WEIGHTS_PATH to trusted local weights.")
    config["weights"] = str(weights.resolve())
    config["cnn"]["pretrained"] = False
    config["device"] = device
    logger.info("Loading local VietOCR model on %s (threads: %s)", device, torch.get_num_threads())
    loaded_predictor = Predictor(config)
    loaded_predictor.model.eval()
    if FUSE_CNN == '1':
        logger.info('Fused %s CNN Conv/BatchNorm pairs', fuse_cnn_batch_norm(loaded_predictor.model))

    # Warmup inference to eliminate first-request latency
    try:
        dummy = Image.new("RGB", (100, 32), color=(255, 255, 255))
        with torch.inference_mode():
            loaded_predictor.predict_batch([dummy], return_prob=True)
            fast_predict_batch(loaded_predictor, [dummy])
        predictor = loaded_predictor
        logger.info("VietOCR model initialized; no startup configuration/weights download")
        logger.info("VietOCR model warmup completed successfully.")
    except Exception as warmup_err:
        predictor = None
        raise RuntimeError("VietOCR model warmup failed; service is not ready") from warmup_err
    finally:
        dummy.close()

# Request / Response Schemas matching AFL-Platform VietOcrAdapter
class Dimensions(BaseModel):
    width: Optional[int] = 100
    height: Optional[int] = 32

class LineItem(BaseModel):
    lineId: Optional[str] = None
    image: str = Field(..., description="Base64 encoded string or Data URL of the line or document image")
    dimensions: Optional[Dimensions] = None
    coordinates: Optional[List[float]] = None

class PredictRequest(BaseModel):
    lines: Optional[List[LineItem]] = None
    image: Optional[str] = None

class PredictionResult(BaseModel):
    lineId: Optional[str] = None
    text: str
    confidence: Optional[float] = None
    coordinates: Optional[List[float]] = None

class TableCellLayout(BaseModel):
    lineIds: List[str]
    coordinates: List[float]


class TableLayout(BaseModel):
    id: str
    headerRowCount: int = 0
    rows: List[List[TableCellLayout]]


class PredictResponse(BaseModel):
    predictions: List[PredictionResult]
    processingTimeMs: Optional[float] = None
    tables: List[TableLayout] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    skewDegrees: float = 0

def sort_line_boxes_geometrically(boxes: List[Tuple[int, int, int, int]]):
    from segmentation import ordered_boxes
    return ordered_boxes(boxes)

def segment_document_lines(pil_img: Image.Image, target_width: int = DETECTION_WIDTH):
    try:
        return segment_page(pil_img, target_width, MAX_LINES).regions
    except ValueError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error

def fast_predict_batch(pred: Predictor, pil_images: List[Image.Image], batch_size: int = BATCH_SIZE, workers: int = INFERENCE_WORKERS):
    """Bounded batches; split wide lines at safe gaps and flag unresolved limits."""
    from recognition import split_wide_line
    if not pil_images:
        return [], []
    if batch_size < 1:
        raise ValueError("Invalid OCR batch size")
    if workers not in (1, 2):
        raise ValueError('Invalid OCR worker count')
    dataset = pred.config['dataset']
    target_h, min_w, max_w = (dataset[key] for key in ('image_height', 'image_min_width', 'image_max_width'))
    pieces, owners, owned = [], [], []
    try:
        for index, image in enumerate(pil_images):
            fragments = split_wide_line(image, target_h, max_w)
            pieces.extend(fragments)
            owners.extend([index] * len(fragments))
            owned.extend(fragment for fragment in fragments if fragment is not image)
        # Prepare only one batch at a time; don't retain all page tensors in RAM.
        by_width = {}
        for index, image in enumerate(pieces):
            # Match VietOCR's integer truncation before rounding to multiples of 10.
            natural_width = max(min_w, min(max_w, math.ceil(int(target_h*float(image.width)/float(image.height))/10)*10))
            by_width.setdefault(natural_width, []).append(index)
        texts, scores = ['']*len(pieces), [None]*len(pieces)
        chunks = [indices[start:start+batch_size] for indices in by_width.values()
                  for start in range(0, len(indices), batch_size)]
        def infer_chunk(chunk):
            tensors = [process_input(pieces[i], target_h, min_w, max_w) for i in chunk]
            batch = torch.cat(tensors, 0).to(pred.device)
            with torch.inference_mode():
                sentences, probabilities = translate(batch, pred.model)
            decoded = pred.vocab.batch_decode(sentences.tolist())
            probabilities = probabilities.tolist()
            if len(decoded) != len(chunk) or len(probabilities) != len(chunk):
                raise RuntimeError("Model result count differs from batch count")
            return list(zip(chunk, decoded, probabilities))

        def collect(outputs):
            for output in outputs:
                for index, text, score in output:
                    texts[index], scores[index] = text, confidence_value(score)

        if workers > 1 and str(pred.device) == 'cpu' and len(chunks) > 1:
            from concurrent.futures import ThreadPoolExecutor
            # Fixed-width batches stay exact. At most two batches allocate tensors.
            with ThreadPoolExecutor(max_workers=min(2, workers), initializer=torch.set_num_threads,
                                    initargs=(torch.get_num_threads(),)) as pool:
                collect(pool.map(infer_chunk, chunks))
        else:
            collect(map(infer_chunk, chunks))
        output_texts, output_scores = [], []
        for owner in range(len(pil_images)):
            indices = [i for i, original in enumerate(owners) if original == owner]
            output_texts.append(' '.join(texts[i].strip() for i in indices).strip())
            # A weak fragment must not be hidden by averaging confident fragments.
            values = [scores[i] for i in indices]
            width_limited = any(pieces[i].width*target_h/pieces[i].height > max_w for i in indices)
            length_limited = any(len(texts[i]) >= 128 for i in indices)
            output_scores.append(min(values) if not width_limited and not length_limited and all(v is not None for v in values) else None)
        return output_texts, output_scores
    finally:
        for fragment in owned:
            fragment.close()

@app.get("/")
def root():
    return {
        "service": "VietOCR Microservice (Optimized)",
        "status": "ready" if predictor is not None else "loading",
        "device": device,
        "threads": torch.get_num_threads(),
        "inferenceWorkers": INFERENCE_WORKERS if device == 'cpu' else 1,
        "decoder": 'cached' if predictor is not None and DECODER_MODE == 'cached' and supports_cached_decoder(predictor.model) else 'original',
    }

@app.get("/health")
def health():
    return {
        "status": "ok" if predictor is not None else "degraded",
        "ready": predictor is not None,
        "device": device,
        "threads": torch.get_num_threads(),
        "inferenceWorkers": INFERENCE_WORKERS if device == 'cpu' else 1,
        "decoder": 'cached' if predictor is not None and DECODER_MODE == 'cached' and supports_cached_decoder(predictor.model) else 'original',
    }

def confidence_value(value) -> Optional[float]:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    return score if math.isfinite(score) and 0 <= score <= 1 else None


def decode_base64_image(image_str: str) -> Image.Image:
    raw_str = image_str.strip()
    if len(raw_str) > ((MAX_IMAGE_BYTES + 2) // 3) * 4 + 128:
        raise HTTPException(status_code=413, detail="Image exceeds byte limit")
    if "," in raw_str:
        raw_str = raw_str.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw_str, validate=True)
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds byte limit")
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
            if image.format not in ("JPEG", "PNG"):
                raise HTTPException(status_code=400, detail="Only PNG and JPEG are supported")
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image exceeds pixel limit")
            image.load()
            oriented = ImageOps.exif_transpose(image)
            try:
                if oriented.mode in ("RGBA", "LA") or "transparency" in oriented.info:
                    rgba = oriented.convert("RGBA")
                    try:
                        background = Image.new("RGB", rgba.size, "white")
                        background.paste(rgba, mask=rgba.getchannel("A"))
                        return background
                    finally:
                        rgba.close()
                return oriented.convert("RGB")
            finally:
                oriented.close()
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid or undecodable image") from error


def validated_coordinates(coords):
    if coords is None:
        return None
    if len(coords) != 4 or not all(math.isfinite(value) and 0 <= value <= 1 for value in coords):
        raise HTTPException(status_code=400, detail="Invalid normalized coordinates")
    if coords[0] >= coords[2] or coords[1] >= coords[3]:
        raise HTTPException(status_code=400, detail="Degenerate normalized coordinates")
    return coords


def is_flat_image(image: Image.Image) -> bool:
    gray = image.convert("L")
    try:
        # Only virtually uniform crops are skipped; low contrast is not a gate.
        pixels = np.asarray(gray)
        return int(pixels.max()) - int(pixels.min()) <= 1
    finally:
        gray.close()


@app.post("/predict", response_model=PredictResponse)
def predict_lines(request: PredictRequest):
    if predictor is None:
        raise HTTPException(status_code=503, detail="VietOCR model is not loaded yet")
    if request.image and request.lines:
        raise HTTPException(status_code=400, detail="Provide an image or cropped lines, not both")
    if len(request.lines or []) > MAX_LINES:
        raise HTTPException(status_code=413, detail="Too many text regions")
    ids = [line.lineId or f"line_{idx+1:03d}" for idx, line in enumerate(request.lines or [])]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate input line IDs")
    if not inference_lock.acquire(blocking=True, timeout=1.0):
        raise HTTPException(status_code=429, detail="VietOCR is busy; try again after the current request")

    started_at = time.perf_counter()
    owned_images = []
    try:
        regions = []
        tables, warnings, skew = [], [], 0.0
        crop_groups = {}
        def page_regions(image):
            nonlocal tables, warnings, skew
            try:
                layout = segment_page(image, DETECTION_WIDTH, MAX_LINES)
            except ValueError as error:
                raise HTTPException(status_code=413, detail=str(error)) from error
            tables, warnings, skew = layout.tables, layout.warnings, layout.skew_degrees
            return layout.regions
        if request.image:
            image = decode_base64_image(request.image)
            owned_images.append(image)
            regions = page_regions(image)
            owned_images.extend(region[0] for region in regions)
        elif request.lines:
            total_pixels = 0
            for idx, line in enumerate(request.lines):
                coords = validated_coordinates(line.coordinates)
                image = decode_base64_image(line.image)
                owned_images.append(image)
                total_pixels += image.width * image.height
                if total_pixels > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Cropped lines exceed total pixel limit")
                is_page = coords == [0, 0, 1, 1] or (coords is None and image.height > 60 and image.height / image.width > 0.15)
                if len(request.lines) == 1 and is_page:
                    regions = page_regions(image)
                    owned_images.extend(region[0] for region in regions)
                elif not is_flat_image(image):
                    line_id = line.lineId or f"line_{idx+1:03d}"
                    if image.height > 60 and image.height / image.width > 0.15:
                        try:
                            layout = segment_page(image, DETECTION_WIDTH, MAX_LINES)
                        except ValueError as error:
                            raise HTTPException(status_code=413, detail=str(error)) from error
                        owned_images.extend(region[0] for region in layout.regions)
                        group_ids = []
                        for sub_idx, (crop, _, _) in enumerate(layout.regions):
                            sub_id = f"crop_{idx}_{sub_idx}"
                            while sub_id in ids:
                                sub_id += '_'
                            regions.append((crop, coords, sub_id)); group_ids.append(sub_id)
                        crop_groups[line_id] = (coords, group_ids)
                    else:
                        regions.append((image, coords, line_id))
                if len(regions) > MAX_LINES:
                    raise HTTPException(status_code=413, detail="Too many text regions")

        # A page with no detected text has no recognized content. Never feed
        # an unsegmented page or blank sheet to the line-only model as fallback.
        if not regions:
            return PredictResponse(predictions=[], tables=tables, warnings=warnings, skewDegrees=skew,
                                   processingTimeMs=(time.perf_counter() - started_at) * 1000)
        # Empty pixel-backed table slots remain in layout, without model hallucinations.
        active = [i for i, region in enumerate(regions) if not is_flat_image(region[0])]
        crops = [regions[i][0] for i in active]
        texts, scores = fast_predict_batch(predictor, crops)
        if len(texts) != len(active) or len(scores) != len(active):
            raise RuntimeError("Model result count differs from input region count")
        sents, probs = [''] * len(regions), [None] * len(regions)
        for i, text, score in zip(active, texts, scores):
            sents[i], probs[i] = text, score
        if len(sents) != len(regions) or len(probs) != len(regions):
            raise RuntimeError("Model result count differs from input region count")
        results = []
        for (_, coords, line_id), text, score in zip(regions, sents, probs):
            results.append(PredictionResult(
                lineId=line_id,
                text=str(text).strip() if text is not None else "",
                confidence=confidence_value(score),
                coordinates=coords,
            ))
        if crop_groups:
            by_id = {result.lineId: result for result in results}
            grouped = []
            for idx, line in enumerate(request.lines):
                line_id = line.lineId or f"line_{idx+1:03d}"
                if line_id in crop_groups:
                    coords, ids = crop_groups[line_id]
                    parts = [by_id[i] for i in ids if by_id[i].text]
                    scores = [part.confidence for part in parts]
                    grouped.append(PredictionResult(lineId=line_id, text='\n'.join(part.text for part in parts), coordinates=coords,
                        confidence=min(scores) if scores and all(score is not None for score in scores) else None))
                elif line_id in by_id:
                    grouped.append(by_id[line_id])
            results = grouped
        return PredictResponse(predictions=results, tables=tables, warnings=warnings, skewDegrees=skew,
                               processingTimeMs=(time.perf_counter() - started_at) * 1000)
    except HTTPException:
        raise
    except Exception as error:
        logger.error("VietOCR inference failed (%s)", type(error).__name__)
        raise HTTPException(status_code=500, detail="VietOCR inference failed") from error
    finally:
        for image in owned_images:
            image.close()
        inference_lock.release()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    uvicorn.run("app:app", host=host, port=port, reload=False)
