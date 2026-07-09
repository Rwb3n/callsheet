---
template: work_item
id: CS-WORK-085
title: "Account closure flow wiring"
type: feature
status: todo
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: null
priority: high
effort: medium
traces_to:
  - REQ-CS-HARDEN-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/03-closure-flow.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
acceptance_criteria:
  - "AC-23: CLOSURE_FLOW_STEPS registers 6 steps in order: archive_listings, cancel_paddle_subscriptions, anonymise_enquiry_data, delete_defer_buyer_data, deactivate_account, emit_account_closed"
  - "AC-24: executeOrchestratedFlow('closure', accountId, CLOSURE_FLOW_STEPS, initialContext) creates orchestrated_flows record with flowType = 'closure' and status = 'initiated'"
  - "AC-25: Step 1 archives all active listings — each emits listing_archived (sync: search index removal) — accumulates archived IDs in context.listingsArchived"
  - "AC-26: Step 2 creates pending_cancellation record with reason: 'account_closed' BEFORE calling PaymentService.cancelSubscription for each paid listing"
  - "AC-27: Step 2 failure (Paddle API throws) halts flow at step 2 with status: 'failed' and preserves context showing which subscriptions succeeded/failed"
  - "AC-28: Step 2 retry after partial completion skips already-cancelled subscriptions (idempotent: pending_cancellation record exists)"
  - "AC-29: Step 5 sets account.lifecycleStatus = 'closed' — admin skip attempt rejected (step 5 NOT skippable per SI §3.5)"
  - "AC-30: Step 6 emits account_closed with payload matching PP §1.9 AccountClosedEvent: accountId, listingsArchived, buyerDataDeleted, complianceHoldActive, paddleCancellationsPending, timestamp"
blocked_by: []
blocks: [CS-WORK-086, CS-WORK-087, CS-WORK-088]
enables: []
queue_position: null
cycle_phase: null
node_history: []
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S10
  spec_sections: "S10 §3 (account closure flow wiring), SI §3 (orchestrated flow engine), SI §13.2 (closure flow specification)"
  io_profile: "db-read-write, event-emit, flow-orchestration, external-api"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-085: Account closure flow wiring

## Context

Wires the 6-step account closure flow into the orchestrated flow engine. Defines `CLOSURE_FLOW_STEPS` as `FlowStepDefinition<ClosureContext>[]`. Step 1 archives all active listings (emitting `listing_archived` per listing for sync search index removal). Step 2 cancels Paddle subscriptions via `PaymentService.cancelSubscription` with idempotent retry (pending_cancellation record gates). Step 5 deactivates the account. Step 6 emits `account_closed`. Steps 3-4 (data operations) are implemented in CS-WORK-086.

**Type alignment notes:**
- `FlowType` already includes `"closure"` — aligned.
- **`AccountClosedEvent` payload incomplete (audit finding):** Current type has `accountId`, `listingsArchived`, `complianceHoldActive?`. AC-30 requires `buyerDataDeleted: boolean`, `paddleCancellationsPending: boolean`, `timestamp: string`, and `complianceHoldActive` must be required (not optional). Amend type before step 6 can emit correct payload.
- `PaymentService.cancelSubscription` in `src/domains/commercial/subscription/` — verify exists and accepts listingId.
- `pending_cancellation` table and `lifecycleStatus` column exist in schema — verify.
- **SKIP_CONSTRAINTS key mismatches (audit finding):** `admin/flows.ts` has `cancel_subscriptions` (spec: `cancel_paddle_subscriptions`) and `anonymise_buyer_data` (spec: `anonymise_enquiry_data`). Must rename keys to match `FlowStepDefinition.name` values.
- Step 1 emits `listing_archived` — existing event with sync consumers (search index). Verify `listing_archived` event type exists.

## Deliverables

- [ ] `src/lib/flows/closure.ts` — `CLOSURE_FLOW_STEPS` definition, `ClosureContext` type, step executors (1, 2, 5, 6). Steps 3-4 placeholder delegates to CS-WORK-086.
- [ ] `src/lib/flows/closure.ts` — Step 2 Paddle cancellation with pending_cancellation gate and idempotent retry
- [ ] `src/lib/flows/closure.ts` — Step 6 `account_closed` event emission
- [ ] `src/lib/events/types.ts` — Amend `AccountClosedEvent`: add `buyerDataDeleted: boolean`, `paddleCancellationsPending: boolean`, `timestamp: string`; make `complianceHoldActive` required
- [ ] `src/server/routers/admin/flows.ts` — Rename SKIP_CONSTRAINTS closure keys: `cancel_subscriptions` → `cancel_paddle_subscriptions`, `anonymise_buyer_data` → `anonymise_enquiry_data`
- [ ] `src/lib/flows/__tests__/closure.test.ts` — Unit tests for AC-23
- [ ] `src/lib/flows/__tests__/closure.integration.test.ts` — Integration tests for AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30

## References

- `3-requirements/slices/slice-10-hardening/03-closure-flow.md` — §3 full spec
- `3-requirements/interfaces/shared-infrastructure.md` §3 — Orchestrated flow engine
- `3-requirements/interfaces/shared-infrastructure.md` §13.2 — Closure flow specification
- `3-requirements/interfaces/platform-and-product.md` §1.9 — `AccountClosedEvent` payload
