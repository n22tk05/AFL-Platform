# VietOCR local repair — 2026-10-04

## Cause and repair

`npm run dev:all` opening the Web did not mean OCR was ready. The previous
PyTorch 2.14.1 CPU environment failed to import `torch/lib/shm.dll` with Windows
Application Control error 4551, confirmed by local Code Integrity event 3077.
No model was loaded and no VietOCR listener was available on port 8000.

Installed the official CPU pair torch 2.6.0 / torchvision 0.21.0 in the project's
existing virtual environment. The torch wheel SHA256 was checked against the
official PyTorch index before installation. Runtime import and actual model
loading succeeded without changing Windows security policy. NumPy 1.26.4,
OpenCV 4.10.0.84 and albumentations 1.4.2 match the legacy VietOCR dependency;
`pip check` reports no broken requirements.

Google Document AI provider, SDK dependency, package lock entry, runtime config,
mapping tests and active documentation were removed. OCR now accepts only VietOCR.
Gemini remains a separate text service for classification/extraction; Google
Text-to-Speech remains separate. Markdown invokes neither service. Historical
reports preserve the state they audited.

## Implementation

- Local checked-in `inference.yml` derives from official VietOCR inference config.
  The service uses trusted local weights in its cache or existing TEMP cache;
  no configuration/weights download occurs at startup. Missing weights are an
  explicit setup error, and warmup failure never reports readiness.
- `setup.ps1` prepares pinned dependencies/model files; startup paths and endpoint
  consistently use IPv4 loopback. Only the local endpoint and obsolete Document AI
  variables were changed in ignored environment files; credentials were not logged.
- Detection may resize, but line crops use original source pixels and independent
  rounded X/Y scales. Excessive text-region counts are rejected explicitly rather
  than silently dropping the smaller regions. Input byte/pixel/format limits remain.
- Empty pages, absent-coordinate blank pages and blank line crops do not invoke
  the line model as a full-page fallback. No synthesized OCR response is returned.
- Missing/nonfinite confidence stays null; zero remains zero. Model character
  probability is not calibrated accuracy. Response regions retain source IDs and
  bounds; cropped responses map by ID with strict validation, not array position.
- Existing adaptive primary/enhanced flow, maximum two OCR attempts, raw provenance,
  manual review and explicit Session RAM confirmation remain in place.

## Verification

| Check | Result |
| --- | --- |
| Python service unit/OpenCV integration | 13/13 pass, fake predictor, no cloud |
| TypeScript VietOCR adapter | 13/13 pass, fake HTTP responses |
| Documents unit tests | 100/100 pass; four obsolete Google mapping tests removed |
| Launcher tests | 14/14 pass |
| TypeScript typecheck | Pass |
| Production build | Pass using an isolated AFL_BUILD_DIR |
| Browser regressions | 13/13 pass; API requests intercepted |
| Actual local OCR HTTP smoke | Three consecutive runs pass, one attempt each |
| Vietnamese synthetic fixture via Web API | Name/numeric markers read, one attempt |
| Actual blank fixture via Web API | Empty text, invalid Markdown draft, unreadable review, two attempts |
| Chrome with actual local OCR | Upload → OpenCV → VietOCR → Markdown review pass; download requires review |
| Scoped whitespace checks | Pass |

The first ordinary build collided with the user's running Next development
server writing `.next`; compile/lint/types passed but page collection failed.
`AFL_BUILD_DIR` permits isolated production verification without stopping that
server. Its default remains `.next`. Unrelated existing changes were preserved.

Tests generated neutral synthetic text in memory; no private documents were
submitted and no OCR text/base64/credentials were logged. These results verify
local connectivity and behavior, not accuracy on real camera documents. Low
contrast, shadow, blur and clipped text still require review; missing information
cannot be recovered. Structured extraction with a missing Gemini configuration
retains the successful OCR and returns manual review instead of hiding the text.

## Use

Keep the Web at `http://localhost:3001` and verify
`http://127.0.0.1:8000/health` reports `status: ok`, `ready: true`. Open
`/scan-document`, select an image, then choose **Chuyển ảnh sang Markdown** to
read using local VietOCR and review the result. Future startup uses `npm run dev:all`.

Local smoke: `npx tsx scripts/test-vietocr-integration.ts`.

Primary dependency/config references:
[PyTorch installation matrix](https://docs.pytorch.org/get-started/previous-versions/),
[VietOCR base config](https://github.com/pbcquoc/vietocr/blob/master/config/base.yml),
[VietOCR transformer config](https://github.com/pbcquoc/vietocr/blob/master/config/vgg-transformer.yml).
