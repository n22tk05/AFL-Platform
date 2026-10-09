"""Three paired warm runs per synthetic page; preserve both model paths' evidence."""
import base64
import copy
import json
import os
import statistics
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/vietocr-service'))
os.environ.update(VIETOCR_DECODER='original', VIETOCR_FUSE_CNN='0', VIETOCR_THREADS='8', VIETOCR_INFERENCE_WORKERS='1')
import app
from decoding import translate as cached_translate
from model_optimization import fuse_cnn_batch_norm
from vietocr.tool.translate import translate as original_translate

app.load_model()
original_cnn = app.predictor.model.cnn
app.predictor.model.cnn = copy.deepcopy(original_cnn)
fused_pairs = fuse_cnn_batch_norm(app.predictor.model)
optimized_cnn = app.predictor.model.cnn
real_batch = app.fast_predict_batch
workers = 1


def run_batch(*args, **kwargs):
    return real_batch(*args, **kwargs, workers=workers)


results = []
for fixture in json.loads((ROOT / 'tests/fixtures/ocr-json/manifest.json').read_text(encoding='utf-8')):
    request = app.PredictRequest(image=base64.b64encode((ROOT / 'tests/fixtures/ocr-json' / fixture['filename']).read_bytes()).decode('ascii'))
    samples = {'before': [], 'after': []}
    output = {}
    for repeat in range(3):
        for variant in (('before', 'after') if repeat % 2 == 0 else ('after', 'before')):
            workers = 1 if variant == 'before' else 2
            app.torch.set_num_threads(8 if variant == 'before' else 3)
            app.predictor.model.cnn = original_cnn if variant == 'before' else optimized_cnn
            decoder = original_translate if variant == 'before' else cached_translate
            with patch.object(app, 'translate', decoder), patch.object(app, 'fast_predict_batch', run_batch):
                response = app.predict_lines(request)
            samples[variant].append(response.processingTimeMs)
            payload = response.model_dump(exclude={'processingTimeMs'})
            if variant in output:
                assert [p['text'] for p in output[variant]['predictions']] == [p['text'] for p in payload['predictions']], 'Nondeterministic OCR'
            output[variant] = payload
        print(f"{fixture['id']} run {repeat+1}: before={samples['before'][-1]:.0f}ms after={samples['after'][-1]:.0f}ms", file=sys.stderr, flush=True)
    before, after = output['before'], output['after']
    assert [p['text'] for p in before['predictions']] == [p['text'] for p in after['predictions']], 'OCR text regression'
    assert before['tables'] == after['tables'] and before['warnings'] == after['warnings'], 'Layout regression'
    assert [p['coordinates'] for p in before['predictions']] == [p['coordinates'] for p in after['predictions']], 'Geometry regression'
    deltas = [abs(a['confidence']-b['confidence']) for a, b in zip(before['predictions'], after['predictions'])
              if a['confidence'] is not None and b['confidence'] is not None]
    results.append({'fixture': fixture['id'], 'beforeMs': samples['before'], 'afterMs': samples['after'],
                    'beforeMedianMs': statistics.median(samples['before']), 'afterMedianMs': statistics.median(samples['after']),
                    'afterMaxMs': max(samples['after']), 'sameText': True, 'sameLayoutAndCoordinates': True,
                    'maxConfidenceDelta': max(deltas, default=0), 'predictions': after['predictions']})

report = {'syntheticOnly': True, 'device': app.device, 'repeats': 3, 'scope': 'Warm service processing only; no HTTP, browser, adaptive retry or competing benchmark jobs',
          'before': {'decoder': 'original', 'threads': 8, 'workers': 1, 'fusedPairs': 0},
          'after': {'decoder': 'cached', 'threads': 3, 'workers': 2, 'fusedPairs': fused_pairs}, 'results': results}
(ROOT / 'docs/ocr-optimization/latency-paired.json').write_text(json.dumps(report, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
