---
template: work_item
id: CS-WORK-041
title: "Archival path and event consumers"
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
  - REQ-CS-SUBS-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-31: listing.archive for paid listing emits pending_cancellation_created with reason: 'listing_archived'"
  - "AC-32: listing.archive for paid listing does NOT emit subscription_ended directly — emitted by Ops after Paddle webhook, with origin: 'archival' via pending_cancellation attribution"
  - "AC-33: listing.archive for free listing emits no subscription events"
  - "AC-41: D&L subscription_tier_changed consumer calls restoreHiddenItems on upgrade"
  - "AC-42: PP subscription_ended consumer skips re-subscribe CTA when origin === 'closure'"
  - "AC-43: CR subscription_ended consumer schedules win_back_evaluation only when origin === 'paddle'"
blocked_by: [CS-WORK-035, CS-WORK-037]
blocks: []
enables: []
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
  spec_sections: "D&L §1.10, Ops §5, PP §2, CR §2, SI §1.5"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-041: Archival path and event consumers

## Context

Two concerns: (1) S1 archive route amendment — `listing.archive` for paid listings emits `pending_cancellation_created` with `reason: "listing_archived"` [D&L §1.10, resolves S1-9]. D&L does NOT emit `subscription_ended` directly — Ops emits it after Paddle webhook confirmation [S4-ST-7]. Free listings emit no subscription events. (2) S4 event consumer registrations for `subscription_tier_changed` (D&L upgrade path calls `restoreHiddenItems`; PP feature access update + notification; CR revenue metrics), `subscription_ended` (PP downgrade + re-subscribe CTA with closure skip; CR churn log + win-back scheduling for paddle-origin only), and `pending_cancellation_created` (Ops stores record + calls `PaymentService.cancelSubscription`). `EVENT_CONSUMER_MATRIX` updated with all new entries [S4-ST-10]. Existing D&L `subscription_tier_changed` consumer at `src/domains/data-and-listings/consumers/tier-update.ts` is extended to call `restoreHiddenItems`.

## Deliverables

- [ ] `src/server/routers/listing.ts` — Amend `listing.archive` mutation with `pending_cancellation_created` emission for paid listings
- [ ] `src/domains/data-and-listings/consumers/tier-update.ts` — Extend existing consumer to call `restoreHiddenItems` on upgrade
- [ ] `src/domains/operations/paddle/consumers.ts` — `pending_cancellation_created` consumer (store + cancel)
- [ ] `src/domains/platform/consumers/subscription.ts` — PP consumers for `subscription_tier_changed` and `subscription_ended`
- [ ] `src/domains/commercial/consumers/subscription.ts` — CR consumers for `subscription_tier_changed` and `subscription_ended`
- [ ] `src/lib/events/types.ts` — `PendingCancellationCreatedEvent` payload type, `EVENT_CONSUMER_MATRIX` S4 entries
- [ ] `src/lib/email/types.ts` — `subscription_confirmed` template ID
- [ ] `src/domains/operations/paddle/__tests__/consumers.integration.test.ts` — AC-31, AC-32, AC-33, AC-37 (Ops consumer)
- [ ] `src/domains/commercial/consumers/__tests__/subscription.integration.test.ts` — AC-43
- [ ] `src/domains/platform/consumers/__tests__/subscription.integration.test.ts` — AC-42
- [ ] `src/domains/data-and-listings/consumers/__tests__/tier-update-s4.integration.test.ts` — AC-41

## References

- `3-requirements/slices/slice-04-subscriptions.md` §7 Archival Path, §10 Event Consumers
- `3-requirements/interfaces/data-and-listings.md` §1.10 Archival Emission
- `3-requirements/interfaces/operations.md` §5 Pending Cancellation Consumer
- `3-requirements/interfaces/platform-and-product.md` §2 Consumed Events
- `3-requirements/interfaces/commercial-and-revenue.md` §2 Consumed Events
- `3-requirements/interfaces/shared-infrastructure.md` §1.5 EVENT_CONSUMER_MATRIX
