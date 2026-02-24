---
template: work_item
id: CS-WORK-027
title: "Outbound event webhook and status lifecycle"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-013
arc: infrastructure
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: medium
traces_to:
  - REQ-CS-COMMS-003
source_files:
  - D:/PROJECTS/callsheet/1-investigation/communications-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-09: email.delivered updates sent→delivered, sets updatedAt"
  - "AC-10: opened, clicked, bounced, complained transitions work correctly"
  - "AC-11: same-state no-op (200), invalid transitions logged to event_consumer_errors (200)"
  - "AC-12: invalid signature returns 401, no DB writes"
  - "AC-13: email.bounced delegates to bounce handler with bounceType"
blocked_by: [CS-WORK-025, CS-WORK-026]
blocks: [CS-WORK-028]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/app/api/webhooks/email/events/route.ts
  - src/lib/email/webhook-handler.ts
  - src/lib/email/webhook-types.ts
  - src/lib/email/webhook-verifier.ts
  - src/lib/email/__tests__/webhook-verifier.test.ts
  - src/lib/email/__tests__/webhook.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  spec_sections: "Investigation §3.6, §6.7; SI §5.1"
version: "1.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-027: Outbound event webhook and status lifecycle

## Context

First `src/app/api/` route in the project. Receives Resend outbound event webhooks at `POST /api/webhooks/email/events`. HMAC signature verification via `ResendWebhookVerifier` (inject-don't-patch — tests use `NoOpWebhookVerifier`). Status transitions: sent→delivered→opened→clicked, sent→bounced, sent→failed. `email.complained` treated as hard bounce from any state. Same-state transitions are no-ops. Invalid transitions logged to `event_consumer_errors`. Unknown `providerMessageId` returns 200 (Resend retries on non-2xx). `RESEND_WEBHOOK_SECRET` env var required for production.

## Deliverables

- [x] `src/app/api/webhooks/email/events/route.ts` — POST handler
- [x] `src/lib/email/webhook-handler.ts` — handleResendEvent with transition validation
- [x] `src/lib/email/webhook-types.ts` — Resend webhook payload types
- [x] `src/lib/email/webhook-verifier.ts` — HMAC verifier + NoOp verifier
- [x] `src/lib/email/__tests__/webhook-verifier.test.ts` — 5 unit tests
- [x] `src/lib/email/__tests__/webhook.integration.test.ts` — 9 integration tests
