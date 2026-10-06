# Grounded document JSON export — schema 1.0.0

JSON is the only document scan/export format. `/api/documents/markdown`, its
assembler/normalizer/validator, `.md` download controls and export-only Markdown
rendering dependencies have been removed. Repository Markdown documentation is
unaffected. No export-format feature flag or parallel export pipeline remains.

## Actual pipeline

Browser OpenCV adaptive image preparation → processed color primary image (deskew
only with trustworthy geometry) → local Python OpenCV text region segmentation
and geometric reading order → VietOCR line recognition → bounded adaptive attempt
selection → immutable OCR source + deterministic classification → JSON assembly →
Ajv schema and semantic/source validation → human review → UTF-8 `.json`.

VietOCR is a line recognizer, not a table/layout/checkbox/signature detector.
Python provides normalized line boxes and model line scores; scores are not
calibrated OCR accuracy. The TypeScript adapter constructs `fullText` from these
lines, adding paragraph separators from vertical gaps. Export preserves that
`fullText` verbatim, every returned block and all attempt text. Missing geometry
and confidence remain `null`. Model is `null` until reported by the provider API;
the deployment's Python configuration selects the actual model.

Adaptive OpenCV preprocessing, whole-image fallback, sequential bounded retry,
pixel limits and `cv.Mat` ownership remain in place. Preview downsampling does not
cap the OCR image. Camera fallback still requires an explicit whole-image action.
Weak image quality is a warning, not an upload rejection.

## Contract and provenance

Shared types: `src/shared/document-export.types.ts`. Versioned draft-07 schema:
`src/shared/document-export.schema.json`, also served by GET `/api/documents/json`.
Generate it with `node scripts/generate-document-json-schema.mjs` after changing
the contract; consumers must check `schemaVersion` before interpreting results.

`documentId` is created once per processing request and retained across adaptive
attempts, review, copy and download. Source IDs/order are deterministic for the
same provider result. Reprocessing creates a new document ID.

The source layer contains `rawText`, `lines` (exact text, original newline,
UTF-16 start/end offsets, explicit `text-splitting` provenance), `blocks` (original
provider IDs, page/order/text/bbox/confidence), and page metadata. Source and
reading order are never silently corrected. If only full text is supplied, page
assignment is known only for a single page; otherwise unmatched split lines use
`page:null` with a warning. Provider reading order wins; the local service declares
`geometric-heuristic`. Page width/height are null unless provided or obtained from
the decoded single-page processed image.

Every content node references source line/block IDs. The interpreted layer uses
node references for headers, titles, dates, sections, signatures, free text and
unclassified content. Fields/cells keep `rawValue` separate from `normalizedValue`.
Human edits change only normalized values and record `USER_EDIT`; source remains
untouched. Empty field placeholders produce null values with `valueState:blank`;
replacement-character OCR is `unreadable`, not a legitimate empty input. Dotted
padding is removed only from a separate normalized field value with explicit
`DOTTED_PADDING_REMOVED` evidence. Names, numbers, dates and diacritics are never
automatically corrected. IDs such as `000000000007` remain strings.

All export boxes are **normalized `[xMin,yMin,xMax,yMax]` in `[0,1]`**, relative to
the processed primary image. Null means unavailable. The older extraction/form
contract uses YXYX: conversion occurs at the export boundary and at the legacy UI
overlay boundary. No pixel XYWH array is placed in this contract. Source ranges
are end-exclusive UTF-16 offsets; provider table code-point ranges are explicitly
converted, including astral Unicode characters.

Regex evidence has `verified:false`; it is distinct from OCR confidence. Unknown
text is exported, not forced into a paragraph/field category. A checkbox symbol
is textual evidence only: explicit marks can be checked/unchecked, ambiguous
symbols remain unknown. No missing mark is assumed unchecked. Candidate debug
pixel heuristics are also unverified. Tables are assembled only from explicit
provider cell layout/ranges, retaining empty positions and row/column spans. The
current local provider supplies no tables: `tables:[]` and a warning are honest.
Signature titles are text evidence; `identity:null`. No emblem, stamp, handwritten
signature identity or image region is invented from text.

`success` describes processing, **not accurate transcription**. `partial` records
readable output with failed pages/retry warnings; failed pages and their errors
stay in `pages`. `failed` includes empty/unavailable OCR. `requiresReview` and
`needs_review` are independent of processing success. Schema validity, source
coverage and accuracy against the image are different measurements.

## API and UI

POST `/api/documents/json` accepts multipart `file` (JPEG/PNG), optional processed
enhancement files and geometry metadata, or the existing JSON `imageBase64`
request. Limits: 8 MB/image, 26 MB body, 12 million pixels, 120,000 OCR characters,
4,000 lines. The API currently accepts one image/page; PDF/multipage upload is not
implemented, although the assembler supports page-aware provider results.

Preview response: `{success:true,data:DocumentJsonExport}`. Failed processing is
an error response, optionally including a contract-valid `data.status:"failed"`
for source inspection. Invalid image/body is 4xx; configuration/unavailable is
503, provider busy 429, timeout 504, empty OCR 422, invalid provider output 502.
Service/configuration failures are not described as bad image quality.

POST `/api/documents/json?download=1` returns the contract directly with
`application/json; charset=utf-8`, safe `Content-Disposition`, `nosniff`, `no-store`.
An API client must implement its own review process; the download query does not
certify review or correctness. Failed processing never returns an attachment.

At `/scan-document`, choose an image then **Chuyển ảnh sang JSON**. Inspect the
structured view, Unknown/warnings, Raw OCR, and JSON raw. Select a field/line to
highlight its real source box when available. Edit/confirm interpreted fields or
checkboxes, confirm image comparison, then **Copy JSON** or **Tải .json**. Edits
invalidate download confirmation. `/document-test` and `/opencv-test` use the
same JSON review; the candidate path explicitly warns that it is not full-page
coverage. Replacing the image, rerunning, failure or expiry clears the prior
download; request generations and cancellation prevent stale responses.

Export does not send text to Gemini or write `/guide`/Session RAM. The separate
`/api/documents/extract` business-field workflow retains explicit text consent,
evidence validation and human approval before saving its own session data. That
existing schema is not replaced by the document export schema.

## Verification and limits

`npm run test:documents`, `test:opencv`, `test:local`, `typecheck`, `lint`, `build`
and `test:documents:browser` remain available. In restricted Node environments,
Node 22.15+/24 supports the optional in-process TypeScript test loader:
`npm run test:documents:inprocess`. `AFL_BUILD_THREADS=1` selects supported Next
thread workers without disabling lint/type checks. `AFL_BUILD_DIR` isolates output.
`npm run test:documents:server` uses Next's public custom-server API on loopback
port 3100 (or `PORT`); it is a local test server, not the production launcher.

`npm run evaluate:documents` executes fixed OCR→JSON fixtures, without a provider.
`npm run evaluate:documents:local` additionally requires a ready local VietOCR and
runs synthetic images through the real route handler. It rejects non-loopback
endpoints, never calls paid OCR, and writes synthetic-only evaluation artifacts.
`--rescore` recalculates metrics from saved actual OCR with no provider invocation.

See [the independent evaluation and migration report](ocr-json-evaluation/migration-report.md)
for per-fixture findings and exact checks. These fixtures and source coverage do
not demonstrate perfect OCR, representative camera accuracy, handwriting support,
table recognition or perspective correction. No real personal document is included
in the migration fixtures or results.
