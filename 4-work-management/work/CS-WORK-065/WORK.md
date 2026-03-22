---
template: work_item
id: CS-WORK-065
title: "Refund processing"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-26
priority: medium
effort: medium
traces_to:
  - REQ-CS-OPS-009
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/13-refund-processing.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-13.1: admin.refunds.list returns refund request tickets joined with account email, listing name, subscription tier"
  - "AC-13.2: Approve creates pending_cancellations record and calls PaymentService.cancelSubscription({ effectiveFrom: immediately })"
  - "AC-13.3: Deny resolves ticket without Paddle API call"
  - "AC-13.4: Both paths resolve ticket and cancel sla_breach_warning"
  - "AC-13.5: Every evaluation produces decision_logs entry with decision, reason, admin identity"
  - "AC-13.6: Approval does NOT emit subscription_ended directly — Paddle webhook triggers S4 path"
  - "AC-13.7: pending_cancellations record created with reason: voluntary BEFORE calling Paddle"
  - "AC-13.8: Rejects tickets not in status: open"
  - "AC-13.9: Rejects tickets with no active subscription on listing"
blocked_by: [CS-WORK-057, CS-WORK-058]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts:
  - src/server/routers/admin/refunds.ts
  - src/server/routers/__tests__/admin-refunds.integration.test.ts
  - src/server/routers/admin/index.ts
  - src/server/root.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §13, Ops §5 (pending cancellation registry), SI §10.1 (PaymentService), S4 §10 (Paddle webhook subscription.canceled)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-065: Refund processing

## Context

Admin refund evaluation queue. Lists refund request tickets (`category = 'refund_request'`) joined with account email, listing name, and subscription tier. Two paths: approve (creates `pending_cancellations` record with `reason: "voluntary"` BEFORE calling `PaymentService.cancelSubscription`, does NOT emit `subscription_ended` — Paddle's `subscription.canceled` webhook triggers S4's existing path) or deny (resolves ticket, no Paddle call). Both paths resolve the ticket and cancel any pending `sla_breach_warning`. Guards: rejects tickets not in `status: 'open'`, rejects tickets where listing has no active subscription.

**Type alignment notes:**
- `PaymentService.cancelSubscription` already exists at `src/lib/services/types.ts` (used by S4). Confirm `{ effectiveFrom: "immediately" }` param shape.
- `pending_cancellations` table already exists at `src/db/schema/operations.ts` (created in S4).
- Refund approval creates `pending_cancellations` record so Paddle webhook handler can attribute the cancellation reason correctly (same pattern as voluntary cancellation in S4).

## Deliverables

- [x] `src/server/routers/admin/refunds.ts` — `createAdminRefundsRouter(deps)` with `list`, `evaluate` (approve/deny)
- [x] `src/server/routers/__tests__/admin-refunds.integration.test.ts` — 18 integration tests (AC-13.1 through AC-13.9)
- [x] `src/server/routers/admin/index.ts` + `src/server/root.ts` — Wire admin refunds router under `admin.refunds` namespace

## References

- `3-requirements/slices/slice-07-operations/13-refund-processing.md` §13
- `3-requirements/interfaces/operations.md` §5 (pending cancellation registry)
- `3-requirements/interfaces/shared-infrastructure.md` §10.1 (`PaymentService`)
- `3-requirements/slices/slice-04-subscriptions.md` §10 (Paddle webhook `subscription.canceled`)
