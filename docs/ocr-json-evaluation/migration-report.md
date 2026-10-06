# OCR → grounded JSON migration and independent evaluation

Date: 2026-10-06. The document export implementation is migrated to JSON only.
Source/schema tests and actual local HTTP integration pass. Browser interaction
and the migration commit remain blocked by this session's environment, as
described below. This is not a claim that all image content is read correctly.

## Audit and implementation

Before: browser adaptive OpenCV preparation → Python OpenCV segmentation/sort →
VietOCR line recognition → TypeScript fullText assembly → Markdown assembler →
Markdown normalizer/validator → human review → `.md`.

After: same image preparation/provider and bounded adaptive OCR → immutable raw
text/provider blocks → deterministic classifier → source-grounded JSON assembler
→ Ajv versioned schema + semantic/source coverage validation → structured review,
normalized-value edits, raw OCR/JSON tabs, source highlight → `.json`.

Python, not VietOCR itself, detects text regions and sorts boxes geometrically.
The adapter returns line scores/boxes, not token/table/checkbox/signature layout.
OCR receives the processed color primary or selected enhancement, not the small
preview. Missing full-document boxes no longer become a fake whole-page box;
provider text is not trimmed. Timeout/configuration errors are service errors.
Original `fullText`, line text, blank separators, IDs and attempts remain available.

Claude was right about separating classification from Markdown formatting and
reusing administrative text patterns. The draft contract was insufficient for
immutable sources, grounded fields, explicit coordinates and runtime validation;
those are now shared versioned contracts. “14 regex” was not an exact audit fact:
the old normalizer has 14 numbered handling cases, 10 named regex and additional
inline formatting/escape patterns. Neither that code nor VietOCR verifies tables,
checkbox geometry, signature identity or emblem/stamp images. Sixteen export node
types are used, including unknown/blank line; a paragraph or signer name is not
inferred just to fill a taxonomy. No LLM completes missing source content.

The existing dirty draft (`server.ts` plus JSON draft files) was backed up and
integrated with the user's explicit authorization. It was not treated as a
validated finished migration. Git was audited before edits; no destructive Git
operation, push, secret or private document commit was performed.

## Pattern decisions

| Old pattern/rule | Decision and reason |
| --- | --- |
| NATIONAL_HEADER_REGEX | Keep administrative text matching, add Unicode handling; national heading is text, not emblem detection. Raw spelling is unchanged. |
| NATIONAL_MOTTO_REGEX | Keep dash variants; match NFC while preserving source Unicode. |
| DOCUMENT_MAIN_TITLE_REGEX | Narrow: remove generic `GIẤY` and national-heading duplicate; add explicitly observed PHIẾU/BẢNG titles. Uppercase/length evidence retained. |
| SECTION_ROMAN_REGEX | Keep Roman section recognition, without adding Markdown syntax. |
| SECTION_LETTER_REGEX | Replace hand-enumerated Vietnamese character ranges with Unicode/uppercase checks. |
| SECTION_NUMBER_TITLE_REGEX | Keep uppercase numbered heading evidence; known label+colon wins first. |
| DATE_LOCATION_REGEX | Keep observed date/placeholder forms with Unicode locations; never rewrite dates. |
| FIELD_LABEL_REGEX | Replace single field match with bounded known-label multi-match; retain raw whitespace/leading zeros; support mixed NFC/NFD offsets; empty placeholders stay null. |
| SIGNATURE_TITLE_REGEX | Keep text titles, broaden observed title wording; give precedence over identical standalone field labels. Identity remains null. |
| SIGNATURE_SUBTITLE_REGEX | Keep specific signing instruction syntax; do not infer a signer. |
| Generic parenthesized subtitle | Drop broad guess; arbitrary parentheses remain unknown. |
| Kính gửi inline special case | Integrate into the known-label vocabulary, no separate formatting path. |
| Checkbox inline normalization | Replace rewriting with source symbol/state/evidence; ambiguous square or `[?]` is unknown. Missing marks create no inferred control. |
| Bullet formatting | Keep classification evidence without escaping/reformatting source. |
| Signature pairing/table formatting | Remove: consecutive text is not a verified two-column table. |
| HTML/Markdown escaping, fences, heading/list renumbering | Remove export formatting; JSON strings preserve source literally. React renders plain text. |

Added explicit document code/legal-reference/blank-input/unknown handling. Regex
confidence is not OCR confidence. Every heuristic node stays reviewable.

## Contract, consumers and migration fixes

[Contract/API guide](../DOCUMENT-JSON-EXPORT.md),
[JSON Schema](../../src/shared/document-export.schema.json),
[complete synthetic example](results/example-fixed.json).

Schema `1.0.0` has stable per-request document ID, success/partial/failed processing
status, provider/model metadata, source MIME/pages, exact raw text, source split
lines and provider blocks, grounded ordered nodes and interpreted structures.
All export boxes are normalized XYXY; old extraction/form YXYX is converted at
the boundary. Missing boxes/confidence/dimensions/model are null. Source ranges
are UTF-16/end-exclusive; table provider code-point ranges are converted explicitly.

Fields preserve raw/normalized values independently; no numeric coercion removes
leading zeros. Empty input differs from unreadable OCR. Every cell refers to exact
source ranges/IDs; empty cells require provider evidence. Row/column spans and
occupied positions are checked, including overlaps/out-of-bounds. Unknowns,
unmatched source lines and content outside sections survive. Runtime validation
rejects duplicate IDs, bad references, altered raw text, invalid boxes/scores,
nonfinite/undefined/nonplain/circular JSON and unsupported normalized changes.

Migrated `/scan-document`, `/document-test`, `/opencv-test`, home labels, launcher,
local VietOCR smoke script and document browser suites to `/api/documents/json`.
Removed the Markdown route, review component, normalizer/assembler/validator,
preview/types/service, candidate Markdown assembler and their obsolete tests.
Removed unused react-markdown/remark-gfm dependencies after checking consumers.
README, architecture, operation guide and provider documentation now describe JSON.
Admin/guide and the separate approved business-field `/extract` workflow retain
their own contracts. Export never writes Session RAM or auto-injects needs_review.

Fixes found while testing: failed exports used invalid selectedAttempt 0 (now
null), signature-title/field-label precedence, multi-field/dotted padding handling,
mixed Unicode label offsets, null geometry, merged-cell occupancy/range conversion,
source multiplicity, exact cell source references, malformed full-document OCR
IDs/items, and provider timeout mapping. Replacing images/rerunning clears output;
generation/abort guards reject stale responses. Failed source inspection is retained
with download disabled. Export can edit normalized values without touching raw OCR.

## Independent suite and ground truth mapping

Audited `git show d5846a1`: 17 additions exclusively under the assigned QA docs and
fixtures directories, 10 synthetic PNGs, no application change or private data.
The shared checkout was switched externally from the task branch to
`qa/ocr-json-evaluation`; that QA commit is already current HEAD. Its original
evaluation-plan, handoff, manifest, ground truth and generator were read. QA's
proposed schema names/thresholds are input suggestions, not evidence of a pass.

Original QA files/images are unchanged. [Visual review with SHA-256](results/visual-review.json)
records inspection of all 10 images. Vietnamese marks and checkbox glyphs are
visible; no text overlaps were observed. TC02's standalone dotted line reaches
the right edge, making exact visible dot-count transcription unsuitable for metrics.
Separate top-region inspection confirmed headers in TC02/TC03/TC06; an initial
ambiguous full-page preview assessment was corrected before final scoring.
TC07 is a 7° rotation with padding, not a projective perspective distortion.

Mapping is explicit: national_header→national_heading; national_motto→motto;
field labels use the actual shared contract; tables supplied as test provider
layout preserve null empty slots as raw empty strings with source IDs. QA's derived
numeric `so_tien_phat_number` is not copied into this string export. `emptyFields`
table position descriptions and “Toàn bộ trang” are grid/negative expectations,
not fabricated field labels. Original signature column-wise transcript tail is
compared row-wise to geometric provider order; metric-only pipe separators in
TC04 are removed because the image does not contain `|` glyphs. Product output is
never changed to improve the score. No status/retry is selected by fixture name.

Layer A supplies fixed OCR text and, only for TC04, an explicitly simulated
provider cell grid. It tests deterministic interpretation and exact source IDs,
raw values/text, references, blanks, Unicode and critical numbers. Table text
alone is independently tested to yield no inferred table. Tampered/lost/duplicated
source IDs and changed source text are rejected. All 10 fixtures pass this layer.
This is not image OCR and has no CER/WER.

Layer B ran actual ready loopback VietOCR on all 10 PNGs through the real JSON
route handler and adaptive service. No paid provider was called. Browser
preprocessing is not executed by this harness; it declares deskewApplied=false.
Every selected source block was matched by original ID and exact raw text;
schema/semantic/source checks pass for all 10, including negative blank output.

## Per-fixture actual results

CER/WER below are percentages of Unicode character/token edit distance against
manually reviewed synthetic visible transcripts, NFC + collapsed whitespace.
Case, punctuation, diacritics and leading zeros are not erased. Metrics were
rescored from saved actual OCR after correcting the header-preview assessment;
no second provider run was used for rescoring. See [full actual results](results/live-results.json)
and [fixed OCR results](results/fixed-ocr-results.json) for findings and attempt counts.

| Fixture | Layer A | Layer B CER / WER | Actual OCR finding; JSON interpretation |
| --- | --- | --- | --- |
| TC01 | PASS | 1.36 / 4.29 | National heading accent/case mistakes; field sources preserved, no signer identity guess. |
| TC02 | PASS | Not reported | Dot padding partly omitted/read as a terminal period; zeros retained. Single period remains raw/normalized pending review, not silently removed. Exact dots unverified. |
| TC03 | PASS | 1.71 / 6.59 | Case changes in name/gender; independent field regions and values are not merged by JSON. |
| TC04 | PASS with supplied grid | 87.59 / 87.10 | Provider reads title plus noise and misses grid content. Actual tables remain empty with warning. Fixed grid verifies column/empty-slot retention; this is not a live table-recognition pass. |
| TC05 | PASS with explicit OCR symbols | 3.60 / 12.24 | Some checkbox glyphs missing/misread; only observed symbols produce controls. Other source lines remain unknown, not inferred unchecked. No verified geometry. |
| TC06 | PASS | 1.83 / 5.88 | Accent/case differences; critical leading-zero IDs, money/date strings retained in actual raw source. |
| TC07 | PASS fixed transcript only | 80.05 / 100.00 | Rotated OCR has ordering/errors and repetitive text. JSON retains it and review evidence. No claim that browser deskew or perspective was tested. |
| TC08 | PASS | 2.44 / 5.66 | Name case/diacritics differences; actual primary did not trigger retry, so only one attempt. Low contrast name does not force retry. |
| TC09 | PASS | 1.26 / 4.83 | Title/accent/bullet errors; free prose, lookup code and footer source remain exported. |
| TC10 | PASS negative | Not applicable | Actual empty OCR; HTTP 422 / failed / OCR_EMPTY_TEXT after bounded attempts, no invented fields/content. |

No JSON source/structure error was found in these live exports after the fixes.
OCR omissions remain OCR omissions. All nonblank fixtures still require human
review; table/checkbox/rotation accuracy is not accepted just because JSON parses.

Separately, visually confirmed the existing public **blank 01/LPTB template** at
`public/assets/forms/01-lptb/page-1.jpg`, with no filled personal data, and ran
local image→OCR→JSON integration. One completed run returned HTTP 200 / partial,
with exact provider IDs/text and schema preserved. A subsequent run timed out:
HTTP 504 / failed / OCR_TIMEOUT, no provider output to audit. That run is BLOCKED
for source/accuracy evaluation; a valid failure schema is not an OCR pass.
[Both outcomes and source hash](results/public-blank-form-check.json).
No full manually transcribed ground truth exists for that page, so no CER/WER or
real-document accuracy is reported. No private/filled document or representative
camera benchmark was run or added to Git.

## Checks and remaining environmental blockers

| Check | Result |
| --- | --- |
| Document tests, in-process TypeScript loader | 151/151 PASS (includes 10 independent fixtures and negative source tampering). |
| VietOCR adapter tests | 15/15 PASS, including null bbox, exact whitespace, bad IDs/items and timeout. |
| OpenCV tests, all module test files, same loader | 53/53 PASS, including ownership/finally cleanup and perspective geometry. |
| Local QA fixture suite | 6/6 PASS. |
| Local API integrity suite | PASS, mock providers; no paid API calls. |
| TypeScript / ESLint | PASS; no lint warnings/errors. |
| Production build | PASS with supported `AFL_BUILD_THREADS=1`; lint/type checking retained. Default process workers are blocked by spawn EPERM in this environment. |
| Existing standard tsx test commands | BLOCKED by esbuild/Node child spawn EPERM; equivalent test files ran in-process as above. |
| Real HTTP local smoke + JSON attachment parse | PASS: UTF-8 JSON, safe filename, runtime schema, leading zeros, GET schema, old route 404 and scan page SSR. [Record](results/http-download-check.json). |
| Browser upload→preview→download/stale response/session checks | Tests migrated/typechecked; execution BLOCKED by Playwright permissions, and browser connector inventory is empty. HTTP/SSR results do not replace this browser acceptance. |
| git diff --check | PASS. |
| Migration branch/commit | BLOCKED: `.git` is read-only in the current sandbox; switch/cherry-pick failed creating index.lock. No migration commit hash exists. Nothing pushed. |

The optional in-process loader uses installed TypeScript and Node module hooks,
not downloaded tooling. Next thread workers are a supported configuration, not
ignored build checks. Original scripts are retained for normal environments.
Browser tests must be run once a browser is available; no browser PASS is asserted.

Initial task branch was `feat/documents-grounded-json`; current shared HEAD is
QA commit `d5846a14a42a6db1e9789ae9da662a8ae0e498cc`, not a migration commit. The intended
feature commit is `feat(documents): migrate document export from markdown to grounded JSON`.
The task changes remain reviewable in the workspace. [Changed files](changed-files.json)
enumerates additions/modifications/deletions, excluding temporary logs and build
output. Git writes were not bypassed, and no unrelated changes were staged.

Cleanup removes the task's temporary `.migration-*` scripts, logs and rendered
inspection crops, and the unused JSON draft type re-export shim. The shared
contract, repeatable validation/evaluation tools, independent fixtures and compact
evidence reports remain. Existing Prisma database migrations are unrelated and
were not removed.
