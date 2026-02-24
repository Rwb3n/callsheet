---
template: work_item
id: CS-WORK-040
title: "Checkout initiation and subscription router"
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
  - REQ-CS-SUBS-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-11: createCheckout returns Paddle checkout URL for claimed listing"
  - "AC-12: createCheckout on unclaimed listing returns BAD_REQUEST"
  - "AC-13: createCheckout on listing with active subscription returns BAD_REQUEST"
  - "AC-14: upgrade on free listing returns BAD_REQUEST (must use createCheckout)"
  - "AC-15: upgrade to lower tier returns BAD_REQUEST"
blocked_by: [CS-WORK-035, CS-WORK-036]
blocks: []
enables: [CS-WORK-042]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-23T00:00:00
    exited: null
artifacts:
  - src/server/routers/subscription.ts
  - src/server/routers/__tests__/subscription.integration.test.ts
  - src/lib/services/types.ts
  - src/lib/services/mocks.ts
  - src/db/test-fixtures.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S4
  spec_sections: "SI §10.1, S4 §3"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-040: Checkout initiation and subscription router

## Context

tRPC `subscriptionRouter` with 3 routes: `createCheckout` (new subscription for claimed listing at free tier), `upgrade` (existing subscription to higher tier via Paddle subscription update), `getSubscriptionStatus` (current tier, billing cadence, grace period, feature access). All use `protectedProcedure` with ownership guards. `createCheckout` enforces CR-X-1 (listing must be claimed) and reuses existing `paddleCustomerId` from account profile when available. `upgrade` validates tier rank ordering and delegates to `PaymentService.createCheckoutSession` with `existingSubscriptionId`. Uses `computeFeatureAccess` from CS-WORK-036.

## Deliverables

- [x] `src/server/routers/subscription.ts` — `createSubscriptionRouter(deps)` with createCheckout, upgrade, getSubscriptionStatus
- [x] `src/server/routers/__tests__/subscription.integration.test.ts` — All 5 AC (16 tests)

## References

- `3-requirements/slices/slice-04-subscriptions.md` §3 Checkout Initiation
- `3-requirements/interfaces/shared-infrastructure.md` §10.1 PaymentService
