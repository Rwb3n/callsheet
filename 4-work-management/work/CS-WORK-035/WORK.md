---
template: work_item
id: CS-WORK-035
title: "Subscription schema, types, and Paddle mapping"
type: feature
status: done
owner: null
created: 2026-02-23
spawned_by: null
spawned_children: []
chapter: CH-CS-006
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: critical
effort: large
traces_to:
  - REQ-CS-SUBS-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-01: Paddle webhook with valid signature returns 200"
  - "AC-02: Paddle webhook with invalid signature returns 401"
  - "AC-03: Duplicate Paddle event ID returns 200 without reprocessing"
  - "AC-09: billing_cadence_changed updates billingCadence on listing, emits no domain event"
  - "AC-10: subscription_cancelled with pending cancellation record uses stored reason (not Paddle-inferred)"
  - "AC-37: pending_cancellation_created consumer stores record in pending_cancellations table"
  - "AC-38: Webhook handler matches pending cancellation by paddleSubscriptionId and uses stored reason"
  - "AC-39: Records older than 24 hours are cleaned up during webhook processing"
  - "AC-44: Second listing checkout reuses existing paddleCustomerId from account profile"
  - "AC-45: First listing checkout stores paddleCustomerId on both account profile and listing"
  - "AC-48: processedPaddleEvents records older than 30 days are deleted during webhook processing"
blocked_by: []
blocks: [CS-WORK-037, CS-WORK-038, CS-WORK-039, CS-WORK-040, CS-WORK-041]
enables: [CS-WORK-036, CS-WORK-042]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S4
  spec_sections: "Ops §5, CR §4.4–§4.5, SI §2.1, SI §10.1"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-035: Subscription schema, types, and Paddle mapping

## Context

Foundation for all S4 subscription work. Adds 5 schema elements: subscription columns on listings (§1.1), `paddleCustomerId` on account_profiles (§1.2), `pending_cancellations` table (§1.3), `processed_paddle_events` idempotency table (§1.4), and `grace_periods` table (§1.5). Defines Paddle webhook types, `mapPaddleWebhook()` (CR-owned logic mapping raw Paddle events to internal `SubscriptionEvent`), `inferCancellationReason()`, pending cancellation registry CRUD, and the webhook endpoint skeleton (signature verification + idempotency + async dispatch). Also aligns `PaymentService.SubscriptionTier` from the S0 placeholder (`starter/professional/enterprise`) to the actual tier names (`free/standard/premium/partner`).

## Deliverables

- [ ] `drizzle/0006_*.sql` — Migration: subscription columns on listings, paddleCustomerId on account_profiles, pending_cancellations table, processed_paddle_events table, grace_periods table, media_visibility enum + visibility columns on media_items and credits
- [ ] `src/db/schema/operations.ts` — `pendingCancellations` and `processedPaddleEvents` tables
- [ ] `src/db/schema/commercial.ts` — `gracePeriods` table
- [ ] `src/db/schema/data-and-listings.ts` — Subscription columns + visibility columns on media_items and credits
- [ ] `src/db/schema/accounts.ts` — `paddleCustomerId` on account_profiles
- [ ] `src/domains/operations/paddle/types.ts` — `PaddleWebhookEvent` raw types
- [ ] `src/domains/operations/paddle/webhook-handler.ts` — Webhook endpoint logic: signature verify, idempotency, async dispatch, cleanup
- [ ] `src/domains/operations/paddle/pending-cancellations.ts` — Registry CRUD (store, lookup, cleanup)
- [ ] `src/domains/commercial/subscription/map-paddle-webhook.ts` — `mapPaddleWebhook()`, `inferCancellationReason()`
- [ ] `src/domains/commercial/subscription/types.ts` — `SubscriptionEvent`, `CancellationReason`, etc.
- [ ] `src/app/api/paddle/webhook/route.ts` — Next.js API route (POST handler)
- [ ] `src/lib/services/types.ts` — Align `SubscriptionTier` to `free/standard/premium/partner`
- [ ] `src/db/test-utils.ts` — Add new tables to `resetDb()` truncation list
- [ ] `src/domains/operations/paddle/__tests__/webhook.integration.test.ts` — All 11 AC
- [ ] `src/domains/commercial/subscription/__tests__/map-paddle-webhook.test.ts` — Unit tests for mapping logic

## References

- `3-requirements/slices/slice-04-subscriptions.md` §1 Schema Additions, §2 Paddle Webhook Handler
- `3-requirements/interfaces/operations.md` §5 Paddle Webhook Integration
- `3-requirements/interfaces/commercial-and-revenue.md` §4.4–§4.5 Paddle Mapping
- `3-requirements/interfaces/shared-infrastructure.md` §10.1 PaymentService
