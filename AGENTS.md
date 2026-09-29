<!-- dely:begin -->
## Dely

Bounded or Architectural work invokes `dely:delivery`; Spike starts no
delivery run.

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| `implement` | Codex CLI | gpt-6-luna | low |
| `review` | Codex CLI | gpt-6-sol | medium |
<!-- dely:end -->

## Dely Control continuation

In Dely Control sessions, after every successful dispatch run `dely wait-bg` from that same Control terminal as the last tool command, then end the turn. When an injected orchestration message starts a turn, immediately consume the Run mailbox, process every message, perform completion accounting, acknowledge the delivery, and continue the workflow without waiting for a human `wake`. A heartbeat-only batch must be acknowledged and followed by re-arming `wait-bg`; a heartbeat is not completion. If `wait-bg` reports `ALREADY_WAITING`, do not start another waiter: end the turn and let the existing waiter notify Control. Allow the notify retry interval (30 seconds) to elapse before declaring wake failure; manual user input is not part of the normal protocol.

Automatic continuation preserves Dely human gates, including design approval and human merge or publish approval. It never authorizes merge, force-push, destructive cleanup, scope expansion, or mutation of `main`. This rule applies only to Control sessions; dispatched implementers and reviewers continue to follow their injected lifecycle preamble.
