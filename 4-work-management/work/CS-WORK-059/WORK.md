---
template: work_item
id: CS-WORK-059
title: "Billing reconciliation"
type: feature
status: todo
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: null
priority: critical
effort: large
traces_to:
  - REQ-CS-OPS-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/04-billing-reconciliation.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-4.1: billing_reconciliation handler fetches active subscriptions via PaymentService.listSubscriptions and compares with local listings"
  - "AC-4.2: If mismatch >= 10%, handler sets status = failed, creates billing_anomaly notification (critical), does NOT create holds or emit events"
  - "AC-4.3: For each mismatch below threshold: if no existing hold, creates one with expiresAt = now() + 48h and schedules billing_hold_expiry"
  - "AC-4.4: For expired hold with no pending_cancellations record: emits subscription_ended with reason paddle_reconciliation and all Ops §1.2 fields"
  - "AC-4.5: Handler upserts billing_reconciliation_status on every run"
  - "AC-4.6: Handler self-perpetuates by scheduling next run at now() + 24h"
  - "AC-4.7: billing_hold_expiry handler deletes expired hold; does NOT emit subscription_ended"
  - "AC-4.8: admin.billing.getStatus returns current status from single-row table; <100ms p95"
  - "AC-4.9: admin.billing.triggerReconciliation schedules immediate deferred action and logs decision"
  - "AC-4.10: admin.billing.releaseHold deletes hold, cancels billing_hold_expiry, logs decision with admin identity"
  - "AC-4.11: admin.billing.listHolds returns paginated holds with listing name and computed remainingHours"
  - "AC-4.12: Every reconciliation run, hold creation, and hold release produces a decision_logs entry"
  - "AC-4.13: checkComplianceHold does NOT query billing_holds — separate queries, separate purposes"
blocked_by: [CS-WORK-057]
blocks: [CS-WORK-062]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §4, Ops §3.5 (getBillingReconciliationStatus), Ops §1.2 (subscription_ended fields), SI §2.1 (billing_reconciliation, billing_hold_expiry), SI §10.1 (PaymentService)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-059: Billing reconciliation

## Context

Implements the daily billing reconciliation handler — a self-perpetuating deferred action that compares Paddle subscription state (via `PaymentService.listSubscriptions`) against local `listings` table. Mismatches above 10% trigger anomaly notification and abort. Below threshold, each mismatch creates a `billing_hold` with 48-hour expiry. Expired holds with no `pending_cancellations` record emit `subscription_ended` with `reason: "paddle_reconciliation"`. Implements `getBillingReconciliationStatus()` query (Ops §3.5) backed by single-row `billing_reconciliation_status` table. Admin routes: status view, manual trigger, hold list, hold release.

**Type alignment notes:**
- `billing_reconciliation` and `billing_hold_expiry` action types already exist in `DeferredActionParamsMap`. Handler implementations land here.
- `SubscriptionEndedEvent.reason` union extended with `"paddle_reconciliation"` in CS-WORK-057.
- `PaymentService.listSubscriptions` may need to be defined — check `src/lib/services/types.ts` for existing `PaymentService` interface.

## Deliverables

- [ ] `src/domains/operations/billing/reconciliation.ts` — `billing_reconciliation` handler: fetch, compare, hold/emit logic
- [ ] `src/domains/operations/billing/hold-expiry.ts` — `billing_hold_expiry` handler: delete expired hold
- [ ] `src/domains/operations/billing/queries.ts` — `getBillingReconciliationStatus(db)` query implementation
- [ ] `src/domains/operations/billing/__tests__/reconciliation.integration.test.ts` — Integration tests (AC-4.1 through AC-4.7, AC-4.12)
- [ ] `src/server/routers/admin-billing.ts` — `createAdminBillingRouter(deps)` with `getStatus`, `triggerReconciliation`, `releaseHold`, `listHolds`
- [ ] `src/server/routers/__tests__/admin-billing.integration.test.ts` — Integration tests (AC-4.8 through AC-4.13)
- [ ] `src/lib/scheduler/handlers/billing-reconciliation.ts` — Handler registration
- [ ] `src/lib/scheduler/handlers/billing-hold-expiry.ts` — Handler registration
- [ ] `src/server/root.ts` — Wire admin billing router under `admin.billing` namespace

## References

- `3-requirements/slices/slice-07-operations/04-billing-reconciliation.md` §4
- `3-requirements/interfaces/operations.md` §1.2 (`subscription_ended` fields), §3.5 (`getBillingReconciliationStatus`)
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 (`billing_reconciliation`, `billing_hold_expiry`), §10.1 (`PaymentService`)
