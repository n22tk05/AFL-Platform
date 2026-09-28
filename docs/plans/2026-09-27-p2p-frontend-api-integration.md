# Plan — Wire the production frontend to workflow, voice, and admin APIs

Decision record: `docs/decisions/2026-09-27-p2p-frontend-api-integration.md`

## Baseline

`e9d61ba035a5143cf810511528659308c6256735`

## Allowed scope

```text
AGENTS.md
docs/decisions/2026-09-27-p2p-frontend-api-integration.md
docs/plans/2026-09-27-p2p-frontend-api-integration.md
docs/PROJECT-STRUCTURE.md
docs/reports/person-4-voice-qa/step-09-p2p-integration-report/**
package.json
src/config/app.config.ts
src/shared/contracts.ts
src/app/(citizen)/guide/page.tsx
src/app/(admin)/layout.tsx
src/app/(admin)/library/page.tsx
src/app/(admin)/review/[id]/page.tsx
src/app/admin/layout.tsx
src/app/admin/library/page.tsx
src/app/admin/review/[id]/page.tsx
src/app/api/admin/forms/route.ts
src/app/api/admin/forms/[formCode]/workflow/route.ts
src/app/api/admin/forms/[formCode]/approve/route.ts
src/components/mobile/VoiceAssistantPanel.tsx
src/modules/forms/client.ts
src/modules/forms/controllers/form.controller.ts
src/modules/forms/index.ts
src/modules/forms/repositories/form.repository.ts
src/modules/forms/repositories/prisma-form.repository.ts
src/modules/forms/services/form-api.client.ts
src/modules/forms/services/form-persistence.service.ts
src/modules/forms/types/form.types.ts
src/modules/forms/tests/test-form-api-client.ts
src/modules/voice-ai/client.ts
src/modules/voice-ai/hooks/use-voice-assistant.ts
src/modules/voice-ai/index.ts
src/modules/voice-ai/services/half-duplex.service.ts
src/modules/voice-ai/services/voice-playback.service.ts
src/modules/voice-ai/services/voice-qa.service.ts
src/modules/voice-ai/tests/test-voice-client.ts
src/modules/voice-ai/types/voice-ai.types.ts
tests/integration/p2p-api-integration.test.ts
```

## Forbidden scope

- `prisma/**`, migrations, Supabase schema, or production row mutation.
- Existing dirty mock assets and report index files.
- The approved source plan at `docs/reports/person-4-voice-qa/step-08-p2p-integration-plan/**`.
- `FormUploadModal` and the legacy `/api/admin/publish` implementation.
- Environment files, secrets, or credential generation.

## Execution envelope

- Branch: `feat/p2p-frontend-api-integration`, based on `a2f47b46afacd366cbc349a16c88bec349ce7cc5`.
- Target: `origin/main`; push the feature branch and open a draft pull request. Do not merge or force-push.
- Preserve all pre-existing dirty files. The `AGENTS.md` managed Dely block is explicitly adopted by the user.
- Implement harness: Codex CLI, `gpt-6-luna`, medium effort.
- Review harness: Codex CLI, `gpt-6-sol`, high effort.

## Implementation tasks

1. Add the forms client and protected admin list/read/save server APIs, with repository/service/controller coverage and deterministic API-client tests.
2. Connect the citizen guide and voice panel to live workflow, QA, STT, and audio playback through browser-safe entry points; retain validated cache and fixture fallbacks.
3. Create canonical admin routes, redirect legacy routes, and connect library/review/save/approve UI to protected APIs without persisting the secret or simulating success.
4. Reconcile the exact HEAD, add integration coverage and the technical report, update structure documentation, and run all release gates.

Each implementation task requires a fresh independent review. Architectural release also requires a fresh final integration review.

### Approved Task 2 replan (2026-09-28)

The first Task 2 remediation did not pass its scoped re-review. The user approved
replanning the remaining work as a new focused lifecycle task before Task 3:

2R. Repair microphone echo-guard cancellation and bind Web Speech callbacks to
immutable recognition sessions. Add deterministic hook-level regression tests
that drive the actual callback closures for cancellation, abort/restart, failed
restart, delayed QA responses, and media fallback. Preserve the accepted fixture,
workflow, browser-boundary, and half-duplex behavior already present at
`77f617fa3170765ce2ad4ed48c26a9a70705250f`.

Task 2R receives a fresh implementer and a fresh independent task review. Task 3
does not start until Task 2R is accepted.

## Acceptance criteria

| Risk | Required proof |
| --- | --- |
| Empty successful workflow response poisons cache | Client rejects an empty workflow and preserves fallback behavior in an automated test. |
| Stale speech transcript or speaker/microphone overlap | Voice-client tests cover finalized transcript submission and half-duplex state. |
| Cancelling playback during the echo guard permanently disables listening | A hook-level fake-clock test completes playback, cancels inside the guard, repeats cancellation, advances past the guard, and proves listening recovers exactly once. The counterexample is an implementation that clears the release timer without restoring or rescheduling the guard. |
| An aborted recognition session submits transcript into a newer turn | Hook/service callback-order tests deliver final/end callbacks from session A after session B starts (including a failed B start) and prove that neither transcript state nor QA submission accepts A. The counterexample is callback ownership looked up from the current mutable recognition id. |
| Lifecycle tests pass while bypassing real callbacks | Tests retain and invoke the actual recognition and media callback closures assigned by the hook/services, including rejected playback, `onerror`, `onended`, abort/restart, delayed fetch, and echo-guard expiry. The counterexample is a no-op callback or isolated counter that never drives production state. |
| Failed approval appears active | Admin UI preserves failure state; API/controller test covers unauthorized or unavailable approval. |
| Canonical admin route is missing | Production build route table contains `/admin/library` and `/admin/review/[id]`; legacy routes redirect. |
| Secret leaks to browser persistence or public environment | Source scan finds no admin-key local storage and no `NEXT_PUBLIC_ADMIN*`. |
| Server-only SDK enters client bundle | Type-check and production build pass with client-safe entry points. |
| Report overstates production verification | Report distinguishes automated/read-only evidence from unavailable live approval and acoustic checks. |

## Cannot be observed automatically

- Physical microphone permission, acoustic recognition accuracy, speaker quality, and real-device latency.
- A successful live approval because no `ADMIN_SECRET_KEY` or disposable pending production form is available.

## Stop conditions

- A requested change requires Prisma/schema or production-data mutation.
- An existing dirty protected file would need to be overwritten.
- A secret would need to be generated, exposed, or persisted client-side.
- The approved contract cannot be met without broadening scope.

## Closure commands

```text
npm run test:p2p
npm run test:voice-client
npm run test:stt
npm run test:voice
npm run test:local
npx tsc --noEmit
npm run build
git diff --check
```

`test:persistence` is deliberately excluded because its current script mutates the configured database. It may run only against an isolated disposable database.
