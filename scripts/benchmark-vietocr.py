"""Run the local model once over public synthetic fixtures; never call a cloud API."""
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "vietocr-service"))
import app

app.load_model()
results = []
for fixture in json.loads((ROOT / "tests/fixtures/ocr-json/manifest.json").read_text(encoding="utf-8")):
    image = ROOT / "tests/fixtures/ocr-json" / fixture["filename"]
    response = app.predict_lines(app.PredictRequest(image=base64.b64encode(image.read_bytes()).decode("ascii")))
    results.append({"fixture": fixture["id"], **response.model_dump()})
    print(f'{fixture["id"]}: {len(response.predictions)} regions, {response.processingTimeMs:.0f}ms', file=sys.stderr)
print(json.dumps({"syntheticOnly": True, "device": app.device, "results": results}, ensure_ascii=True))
