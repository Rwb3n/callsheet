---
template: work_item
id: CS-WORK-039
title: "Paddle webhook handler functions"
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
  - REQ-CS-SUBS-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-04-subscriptions.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-04: checkout_completed sets subscriptionTier, paddleSubscriptionId, billingCadence, subscriptionStartDate on listing"
  - "AC-05: checkout_completed for unclaimed listing defers to retry queue (does not process immediately)"
  - "AC-06: Retry queue refunds after 12 failed attempts (1 hour)"
  - "AC-07: subscription_upgraded emits subscription_tier_changed with correct previousTier and newTier"
  - "AC-08: subscription_downgraded triggers applyDowngrade with data preservation"
  - "AC-46: subscription_ended for listing_archived cancellation has reason: 'cancellation' and origin: 'archival'"
  - "AC-47: subscription_ended for paddle_reconciliation cancellation has reason: 'cancellation' and origin: 'paddle'"
  - "AC-49: Paddle webhook for archival-path cancellation uses pending_cancellation reason: 'listing_archived' and emits subscription_ended with origin: 'archival'"
  - "AC-50: Grace period expiry produces both subscription_tier_changed and subscription_ended but only one provider notification (not two)"
blocked_by: [CS-WORK-035, CS-WORK-037, CS-WORK-038]
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
  spec_sections: "Ops §5, CR §4.5, SI §1.1, SI §1.2"
version: "2.0"
generated: 2026-02-23
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-039: Paddle webhook handler functions

## Context

The 6 handler functions inside `processPaddleWebhook`: `handleCheckoutCompleted` (listing update + paddleCustomerId storage + `subscription_tier_changed` emission + decision log), `handleSubscriptionUpgraded` (tier update + event), `handleSubscriptionDowngraded` (delegates to `applyDowngrade` from CS-WORK-037), `handleBillingCadenceChanged` (listing update only), `handleSubscriptionCancelled` (pending cancellation lookup + grace period or immediate finalisation), `handleRenewalFailed` (notification on first attempt). Uses `createGracePeriod` and `finaliseSubscriptionEnd` from CS-WORK-038. Uses `applyDowngrade` and `restoreHiddenItems` from CS-WORK-037. Ops is sole emitter of `subscription_tier_changed` and `subscription_ended` [Ops interface spec §1.1, §1.2]. `suppressNotification: true` on `applyDowngrade` inside `finaliseSubscriptionEnd` prevents double notification [S4-ST-8].

## Deliverables

- [x] `src/domains/operations/paddle/webhook-handler.ts` — 6 handler functions + `processPaddleWebhook` dispatcher
- [x] `src/lib/events/types.ts` — `SubscriptionTierChangedEvent` and `SubscriptionEndedEvent` payload types populated (done in CS-WORK-035/038)
- [x] `src/domains/operations/paddle/__tests__/handlers.integration.test.ts` — All 9 AC

## References

- `3-requirements/slices/slice-04-subscriptions.md` §2.3–§2.8 Webhook Processing
- `3-requirements/interfaces/operations.md` §5 Paddle Webhook, §1.1–§1.2 Emitted Events
- `3-requirements/interfaces/commercial-and-revenue.md` §4.5 SubscriptionEvent→Domain Event Mapping
