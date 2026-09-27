# Frontend uses server APIs as the source of truth with explicit offline and admin-security boundaries

Date: 2026-09-27  
Status: Accepted

## Context

The citizen guide, voice panel, admin library, and admin review screens still rely on fixtures or browser storage even though workflow, QA, TTS, and approval APIs already exist. A read-only production-data probe found one active form with nine workflow steps and one draft form without a workflow. The database workflow does not include the optional page-display metadata used by the current UI, and common frontend aliases do not equal the stored form code. The application also has no configured `ADMIN_SECRET_KEY`, and the current admin links point at `/admin/...` while the route group exposes `/library` and `/review/...`.

## Decision

- The citizen guide loads a validated, non-empty workflow from the server first, stores it under a canonical cache key, and falls back to browser cache and then a bundled fixture when the server is unavailable.
- Bundled fixture data may enrich missing presentation-only fields. It must not replace live workflow steps or other server-owned values.
- Forms expose a browser-safe client entry point. Voice code used by the browser is separated from Prisma and Gemini server dependencies.
- Voice playback prefers the TTS audio URL, falls back to browser speech only when media playback fails, and uses half-duplex coordination so playback and microphone capture do not overlap. A finalized transcript is sent to QA with the actual form code and one-based step index; the answer is displayed and spoken.
- Admin list, workflow review/save, and approval flow through protected server APIs. The admin key is held only in in-memory UI state and sent as a request header. It is never stored in local storage or exposed through a `NEXT_PUBLIC_*` variable.
- `/admin/library` and `/admin/review/[id]` are the canonical admin routes. Legacy routes redirect to them.
- No Prisma schema, migration, Supabase table, or production row is changed by this delivery.

## Alternatives considered

- Direct Supabase access from the browser was rejected because it would duplicate server policy and risk exposing privileged credentials.
- Continuing local-only admin publication was rejected because it reports success without changing the shared source of truth.
- Generating TTS for every citizen response on the server was rejected because the existing citizen QA response already includes a browser-playable answer path and protected TTS requires an admin secret.
- Persisting UI page metadata in the database was rejected because this delivery is an integration refactor, not a schema change.

## Consequences

- The citizen experience keeps a deterministic offline path while preferring live data.
- Admin actions require an operator-provided secret and cannot silently mark a failed approval as active.
- An already active workflow remains view-only until a separate version-cloning workflow exists.
- Browser bundles have explicit client-safe module boundaries.

## Non-goals

- Image or PDF ingestion for `FormUploadModal`.
- Prisma schema or migration changes.
- Automatically creating or rotating an admin secret.
- Cloning active records into editable draft versions.

## Deferred work

- Replace the shared admin secret with identity-based authorization.
- Persist display-page metadata as an explicit backend contract if it becomes business data.
- Add a real upload-to-manifest backend pipeline.
