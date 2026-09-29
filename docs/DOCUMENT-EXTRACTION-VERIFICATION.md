# Verification record — grounded document extraction

Date: 2026-09-27. No real documents, personal data or paid OCR/Gemini calls were used.

## Results

| Check | Result |
| --- | --- |
| `npm run test:opencv` | 41/41 pass; existing suite unchanged |
| `npx tsx --test src/modules/documents/tests/*.test.ts` | 40/40 pass in this workspace: 36 feature tests and 4 tests in another process's untracked supervision-guard.test.ts |
| `npm run test:local` | Pass: 6/6 fixture/contract checks plus API-integrity suite |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Exit 0; one existing dependency warning in voice-ai/hooks/use-voice-assistant.ts:93 |
| `npm run build` | Production build passes, including types and lint; same existing Voice AI warning |
| `npx playwright test --config playwright.documents.config.ts` | 4/4 pass against production server in Chrome headless |
| `git diff --check` | Pass |
| Real-data benchmark | Not run; no labeled real dataset or cloud credentials |

The initial lint command opened a setup prompt because ESLint configuration/dependencies were absent. Minimal Next 14 lint tooling was added. The remaining Voice AI hook warning was confirmed in `git show HEAD:src/modules/voice-ai/hooks/use-voice-assistant.ts`; that module is unchanged by this feature.

Windows sandbox initially blocked test/build workers with `spawn EPERM`. Those commands were rerun with approved escalation. Browser tests initially detected guide hydration mismatch and a glare sampling gap; both were fixed. A subsequent dev-server run timed out while assets were being rebuilt. The complete browser suite then passed against a production server. Failed/interrupted attempts are not counted as passes.

## Browser coverage and limits

Synthetic clean scan is processed with actual OpenCV WASM; request PNG dimensions match the processed canvas. A slanted camera page runs detection/warp and sends a smaller cropped PNG, repeated three times. Blur, off-grid glare and non-document images are blocked before OCR. Extraction HTTP responses are intercepted with fictional fields. Tests verify evidence position, editing, confirmation, blocked save before review, explicit guide mapping, disappearance after reload, stale-result clearing on image/type changes, no page/console errors, and release of all object URLs after reset.

Mock ownership tests cover transform/point/output Mats on warp success and failure, and kernel/MatVector cleanup on failed detection. These and URL counts are regression checks, **not** a complete long-duration WASM heap leak measurement or device-camera evaluation.

No Google project/location/processor, credential path or Gemini key was configured when checked (only presence flags were inspected). IAM, regional processor availability, real Vietnamese OCR, handwriting, confidence calibration and real-photo gate recall remain unverified. Benchmark metrics have no reported real-data values.

## Feature files

Modified:

- `.env.example`, `.gitignore`, `package.json`, `package-lock.json`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/WORKFLOW-PIPELINE.md`
- `src/shared/document-extraction.types.ts`
- `src/app/api/documents/extract/route.ts`
- `src/app/scan-document/page.tsx`
- `src/app/(citizen)/guide/page.tsx`, `src/app/(citizen)/layout.tsx`
- `src/modules/documents/services/document-extraction.service.ts`
- `src/modules/documents/tests/document-extraction.test.ts`, `src/modules/documents/tests/prerequisite-flow.test.ts`

Created:

- `.eslintrc.json`, `playwright.documents.config.ts`
- `docs/DOCUMENT-EXTRACTION.md`, `docs/DOCUMENT-EXTRACTION-VERIFICATION.md`
- `src/modules/documents/api.ts`, `config.ts`, `errors.ts`, `evaluation.ts`
- `src/modules/documents/schema.ts`, `validation.ts`, `server.ts`, `session.ts`
- `src/modules/documents/image-quality.ts`, `prepare-image.ts`
- `src/modules/documents/providers/google-document-ai.ts`, `gemini-structured.ts`
- `src/modules/documents/tests/google-mapping.test.ts`, `grounded-validation.test.ts`, `image-quality.test.ts`, `opencv-ownership.test.ts`
- `scripts/evaluate-document-extraction.ts`
- `tests/browser/document-extraction.spec.ts`
- `tests/fixtures/documents/README.md`, `samples.example.json`

All `src/modules/opencv/**` implementations and existing tests are reused without edits. Initial Git status was clean, but another process changed files during implementation. The user authorized reconciling overlapping document contracts/service/tests to grounded OCR. The unrelated `src/components/admin/FormUploadModal.tsx` modification and untracked `src/modules/documents/tests/supervision-guard.test.ts` are preserved outside this feature commit.
