"""Measure warmed local inference; never sends fixtures outside this process."""
import base64
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/vietocr-service'))
os.environ.update(VIETOCR_DECODER='original', VIETOCR_FUSE_CNN='0', VIETOCR_THREADS='8', VIETOCR_INFERENCE_WORKERS='1')
import app
from vietocr.tool.translate import translate as upstream_translate
from decoding import translate as cached_translate
from model_optimization import fuse_cnn_batch_norm

app.load_model()
if '--fused' in sys.argv:
    app.predictor.model.eval()
    fuse_cnn_batch_norm(app.predictor.model)
real_batch = app.fast_predict_batch
elapsed = []


def timed_batch(*args, **kwargs):
    start = time.perf_counter()
    output = real_batch(*args, **kwargs, workers=2 if '--parallel' in sys.argv else 1)
    elapsed.append((time.perf_counter() - start) * 1000)
    return output


results = []
decoder = cached_translate if '--cached' in sys.argv else upstream_translate
for threads in ((4, 3, 2) if '--parallel' in sys.argv else (8,) if '--fused' in sys.argv else (8, 4, 2, 1)):
    app.torch.set_num_threads(threads)
    for filename in ('tc01_clean_accents.png', 'tc04_table_empty_cells.png'):
        request = app.PredictRequest(image=base64.b64encode((ROOT / 'tests/fixtures/ocr-json' / filename).read_bytes()).decode('ascii'))
        with patch.object(app, 'fast_predict_batch', timed_batch), patch.object(app, 'translate', decoder):
            response = app.predict_lines(request)
        result = {'filename': filename, 'threads': threads, 'totalMs': response.processingTimeMs,
                  'recognitionMs': elapsed[-1], 'regions': len(response.predictions)}
        results.append(result)
        print(json.dumps(result), flush=True)
label = 'latency-profile-cached' if '--cached' in sys.argv else 'latency-profile'
if '--fused' in sys.argv: label += '-fused'
if '--parallel' in sys.argv: label += '-parallel'
(ROOT / f'docs/ocr-optimization/{label}.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
