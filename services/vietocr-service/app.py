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

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field
import torch

from vietocr.tool.config import Cfg
from vietocr.tool.predictor import Predictor, process_input
from vietocr.tool.translate import translate

# 1. Optimize PyTorch thread pool for high-throughput CPU inference
cpu_cores = os.cpu_count() or 4
torch.set_num_threads(min(8, cpu_cores))
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
MAX_LINES = 120
DETECTION_WIDTH = 1200
BATCH_SIZE = 8
inference_lock = threading.Lock()

app = FastAPI(
    title="VietOCR Microservice (High Performance)",
    description="High-throughput Vietnamese line OCR service with batch inference and OpenCV line segmentation",
    version="1.2.0"
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

    # Warmup inference to eliminate first-request latency
    try:
        dummy = Image.new("RGB", (100, 32), color=(255, 255, 255))
        with torch.inference_mode():
            loaded_predictor.predict_batch([dummy], return_prob=True)
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

class PredictResponse(BaseModel):
    predictions: List[PredictionResult]
    processingTimeMs: Optional[float] = None

def sort_line_boxes_geometrically(boxes: List[Tuple[int, int, int, int]]) -> List[Tuple[int, int, int, int]]:
    """Groups boxes into horizontal rows and sorts rows top-to-bottom, boxes left-to-right."""
    if not boxes:
        return []
    pending = sorted(boxes, key=lambda b: (b[1] + b[3] / 2, b[0]))
    rows: List[dict] = []
    for box in pending:
        bx, by, bw, bh = box
        matched = False
        for row in rows:
            overlap = max(0, min(by + bh, row['bottom']) - max(by, row['top']))
            min_h = min(bh, row['bottom'] - row['top'])
            if overlap / max(min_h, 1) >= 0.4:
                row['boxes'].append(box)
                row['top'] = min(row['top'], by)
                row['bottom'] = max(row['bottom'], by + bh)
                row['center_y'] = sum(b[1] + b[3] / 2 for b in row['boxes']) / len(row['boxes'])
                matched = True
                break
        if not matched:
            rows.append({
                'boxes': [box],
                'top': by,
                'bottom': by + bh,
                'center_y': by + bh / 2
            })
    rows.sort(key=lambda r: (r['center_y'], r['top']))
    sorted_boxes: List[Tuple[int, int, int, int]] = []
    for row in rows:
        row['boxes'].sort(key=lambda b: (b[0], b[1]))
        sorted_boxes.extend(row['boxes'])
    return sorted_boxes

def segment_document_lines(pil_img: Image.Image, target_width: int = DETECTION_WIDTH) -> List[Tuple[Image.Image, List[float], str]]:
    """
    Detect on a smaller copy; crop OCR lines from the original pixels.
    """
    orig_w, orig_h = pil_img.size
    
    # Scale down if large for 10x faster morphological operations
    if orig_w > target_width:
        scale = target_width / float(orig_w)
        proc_w = target_width
        proc_h = max(1, round(orig_h * scale))
        proc_img = pil_img.resize((proc_w, proc_h), Image.Resampling.BILINEAR)
    else:
        scale = 1.0
        proc_w, proc_h = orig_w, orig_h
        proc_img = pil_img

    try:
        img_np = np.array(proc_img)
    finally:
        if proc_img is not pil_img:
            proc_img.close()
    if img_np.ndim == 3:
        if img_np.shape[2] == 4:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGBA2GRAY)
        else:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_np

    # Gaussian blur (3x3) to remove noise and paper grain before thresholding
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Fast Otsu thresholding with inversion (white text on black)
    _, binary_inv = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Horizontal dilation: 25px wide x 3px high kernel to fuse characters in same line
    kw = max(15, int(25 * (proc_w / 1200.0)))
    kh = max(2, int(3 * (proc_h / 1600.0)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh))
    dilated = cv2.dilate(binary_inv, kernel, iterations=1)

    # Find external contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    max_height = max(64, int(proc_h * 0.25))
    min_height = max(8, int(10 * scale))
    min_width = max(20, int(24 * scale))
    min_area = max(160, int(200 * scale * scale))

    raw_boxes: List[Tuple[int, int, int, int]] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        # Filter out horizontal separator lines (e.g. table borders)
        if h < 8 or (w / max(h, 1) > 30 and h < 10):
            continue
        if min_height <= h <= max_height and w >= min_width and (w * h) >= min_area:
            raw_boxes.append((x, y, w, h))

    if not raw_boxes:
        return []

    # Never silently discard smaller regions (they may contain essential fields).
    if len(raw_boxes) > MAX_LINES:
        raise HTTPException(status_code=413, detail="Too many text regions; split the document into smaller pages")

    sorted_boxes = sort_line_boxes_geometrically(raw_boxes)

    padding_x = int(4 * scale)
    padding_y = int(3 * scale)
    segmented: List[Tuple[Image.Image, List[float], str]] = []

    for idx, (x, y, w, h) in enumerate(sorted_boxes):
        x1 = max(0, x - padding_x)
        y1 = max(0, y - padding_y)
        x2 = min(proc_w, x + w + padding_x)
        y2 = min(proc_h, y + h + padding_y)

        # Rounded resize dimensions have independent X/Y scales.
        source_x1 = max(0, math.floor(x1 * orig_w / proc_w))
        source_y1 = max(0, math.floor(y1 * orig_h / proc_h))
        source_x2 = min(orig_w, math.ceil(x2 * orig_w / proc_w))
        source_y2 = min(orig_h, math.ceil(y2 * orig_h / proc_h))
        line_crop = pil_img.crop((source_x1, source_y1, source_x2, source_y2))
        coords = [
            source_y1 / orig_h,
            source_x1 / orig_w,
            source_y2 / orig_h,
            source_x2 / orig_w,
        ]
        line_id = f"line_{idx+1:03d}"
        segmented.append((line_crop, coords, line_id))

    return segmented

def fast_predict_batch(
    pred: Predictor,
    pil_images: List[Image.Image],
    batch_size: int = BATCH_SIZE
) -> Tuple[List[str], List[Optional[float]]]:
    """
    High-throughput binned batch inference for VietOCR.
    Quantizes line widths into bins with right-padding to maximize true parallel batching.
    Confidence remains the model score, not a calibrated accuracy measure.
    """
    if not pil_images:
        return [], []

    dataset_cfg = pred.config['dataset']
    target_h = dataset_cfg['image_height']
    min_w = dataset_cfg['image_min_width']
    max_w = dataset_cfg['image_max_width']

    bins = [128, 256, 384, 512, 640, 768, 896, 1024]
    bucket = {}
    bucket_idx = {}

    for i, img in enumerate(pil_images):
        try:
            t = process_input(img, target_h, min_w, max_w)
            w = t.shape[-1]
            target_bin = max_w
            for b in bins:
                if w <= b <= max_w:
                    target_bin = b
                    break

            if w < target_bin:
                padded = torch.nn.functional.pad(t, (0, target_bin - w), mode='constant', value=1.0)
            else:
                padded = t

            bucket.setdefault(target_bin, []).append(padded)
            bucket_idx.setdefault(target_bin, []).append(i)
        except Exception as err:
            raise RuntimeError("Could not prepare a text region for OCR") from err

    sents = [''] * len(pil_images)
    probs = [None] * len(pil_images)

    for bin_w, batch_list in bucket.items():
        indices_list = bucket_idx[bin_w]
        for chunk_start in range(0, len(batch_list), batch_size):
            chunk_tensors = batch_list[chunk_start:chunk_start + batch_size]
            chunk_indices = indices_list[chunk_start:chunk_start + batch_size]

            batch = torch.cat(chunk_tensors, 0).to(pred.device)
            with torch.inference_mode():
                s, prob = translate(batch, pred.model)
            prob_list = prob.tolist()
            s_decoded = pred.vocab.batch_decode(s.tolist())

            for idx, text, p in zip(chunk_indices, s_decoded, prob_list):
                sents[idx] = text
                probs[idx] = p

    return sents, probs

@app.get("/")
def root():
    return {
        "service": "VietOCR Microservice (Optimized)",
        "status": "ready" if predictor is not None else "loading",
        "device": device,
        "threads": torch.get_num_threads()
    }

@app.get("/health")
def health():
    return {
        "status": "ok" if predictor is not None else "degraded",
        "ready": predictor is not None,
        "device": device,
        "threads": torch.get_num_threads()
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
            return image.convert("RGB")
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
    if not inference_lock.acquire(blocking=True, timeout=120.0):
        raise HTTPException(status_code=429, detail="VietOCR is busy; try again after the current request")

    started_at = time.perf_counter()
    owned_images = []
    try:
        regions = []
        if request.image:
            image = decode_base64_image(request.image)
            owned_images.append(image)
            regions = segment_document_lines(image)
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
                    regions = segment_document_lines(image)
                    owned_images.extend(region[0] for region in regions)
                elif not is_flat_image(image):
                    regions.append((image, coords, line.lineId or f"line_{idx+1:03d}"))

        # A page with no detected text has no recognized content. Never feed
        # an unsegmented page or blank sheet to the line-only model as fallback.
        if not regions:
            return PredictResponse(predictions=[], processingTimeMs=(time.perf_counter() - started_at) * 1000)
        crops = [region[0] for region in regions]
        sents, probs = fast_predict_batch(predictor, crops)
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
        return PredictResponse(predictions=results, processingTimeMs=(time.perf_counter() - started_at) * 1000)
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
