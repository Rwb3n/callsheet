---
template: work_item
id: CS-WORK-038
title: "Grace period management"
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
priority: high
effort: medium
traces_to:
  - REQ-CS-SUBS-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-26: Payment failure creates grace period (14 days) and notifies provider"
  - "AC-27: Voluntary cancellation creates grace period (14 days)"
  - "AC-28: Grace period expiry with no payment recovery finalises cancellation (emits subscription_ended)"
  - "AC-29: Payment recovery during grace period resolves grace as payment_recovered"
  - "AC-30: account_closed/listing_archived cancellation is immediate (no grace period)"
blocked_by: [CS-WORK-035]
blocks: [CS-WORK-039]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - src/domains/commercial/subscription/grace-period.ts
  - src/lib/scheduler/handlers/grace-period-expiry.ts
  - src/lib/scheduler/handlers/checkout-precondition-retry.ts
  - src/domains/commercial/subscription/__tests__/grace-period.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S4
  spec_sections: "SI §2.1, S4 §8"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-038: Grace period management

## Context

14-day grace period for voluntary cancellation and payment failure. `createGracePeriod` inserts into `grace_periods` table (CS-WORK-035 schema), schedules `grace_period_expiry` deferred action, notifies provider, and sets `subscriptionEndDate` on listing. `grace_period_expiry` handler checks if payment recovered during the period — if so, resolves as `payment_recovered`; if not, calls `finaliseSubscriptionEnd` which emits `subscription_ended`. `checkout_precondition_retry` handler retries checkout for listings not yet claimed at webhook time, refunding after 12 failed attempts (1 hour). `DeferredActionParamsMap` extended with both action types. Immediate cancellation (account_closed, listing_archived) bypasses grace period entirely.

## Deliverables

- [x] `src/domains/commercial/subscription/grace-period.ts` — `createGracePeriod()`, `finaliseSubscriptionEnd()`, `findActiveGracePeriod()`, `resolveGracePeriod()`
- [x] `src/lib/scheduler/handlers/grace-period-expiry.ts` — `registerGracePeriodExpiryHandler()`
- [x] `src/lib/scheduler/handlers/checkout-precondition-retry.ts` — `registerCheckoutPreconditionRetryHandler()`
- [x] `src/lib/scheduler/types.ts` — `grace_period_expiry` and `checkout_precondition_retry` already in DeferredActionParamsMap (CS-WORK-035)
- [x] `src/lib/events/types.ts` — `SubscriptionEndedEvent` expanded with `origin` and `timestamp` fields
- [x] `src/domains/commercial/subscription/__tests__/grace-period.integration.test.ts` — 7 tests (5 AC + 2 edge cases)

## References

- `3-requirements/slices/slice-04-subscriptions.md` §8 Grace Period Management
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 DeferredActionParamsMap
