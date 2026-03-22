---
template: work_item
id: CS-WORK-073
title: "Event consumer implementations"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-010
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-06
priority: critical
effort: large
traces_to:
  - REQ-CS-CR-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/06-event-consumers.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/index.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-64: The subscription_tier_changed handler upserts commercial_state and appends a churn_analysis_log entry with eventType set to conversion (free to paid), upgrade (paid to higher paid), or downgrade (paid to lower paid). The annualRevenue field reflects the revenue delta"
  - "AC-65: The subscription_tier_changed handler emits conversion_milestone with milestone first_subscription when previousTier === free. The emission payload includes all 5 fields specified in CR §1.1 (listingId, accountId, milestone, milestoneLabel, timestamp)"
  - "AC-66: The subscription_tier_changed handler sets effectivePriceAtSubscription on commercial_state only on free-to-paid conversion. Subsequent upgrades/downgrades do not overwrite this field"
  - "AC-67: The subscription_ended handler branches on origin: when origin === paddle, it calls evaluateChurnIntervention and schedules win_back_evaluation at 60 days; when origin === archival or closure, it logs churn only and does not schedule win-back"
  - "AC-68: The subscription_ended handler emits churn_risk_detected with riskFactors including payment_at_risk when reason === payment_failure and origin === paddle. The emission payload includes all 4 fields specified in CR §1.2"
  - "AC-69: The subscription_ended handler updates commercial_state.lastChurnEventAt and lastChurnReason for all origin types"
  - "AC-70: The claim_approved handler resets all conversion trigger fields on commercial_state (CR-29): all *Fired counters to 0/false, all last*At timestamps to null, endowmentCtaShown to false. Fields lastChurnEventAt, lastChurnReason, and effectivePriceAtSubscription are preserved"
  - "AC-71: The claim_approved handler cancels all pending win_back_evaluation deferred actions matching params.listingId (CR-X-17). If cancelled win-backs existed, a win_back_converted entry is appended to churn_analysis_log"
  - "AC-72: The listing_archived handler logs churn only when subscriptionTier !== free AND accountId !== null. Free-tier archival and unclaimed-listing cleanup produce no churn_analysis_log entry"
  - "AC-73: The quality_score_changed handler calls triggerLowQualityIntervention (§7) only when all three conditions hold: (a) newComposite < 40, (b) listing subscriptionTier !== free, (c) subscription age exceeds 14 days (read from listings.subscriptionStartDate via join per D1)"
  - "AC-74: The account_closed handler cancels pending win_back_evaluation deferred actions for every listing in listingsArchived. It logs a churn entry in churn_analysis_log with reason account_closed for each paid listing"
  - "AC-75: The account_closed handler skips churn logging for free-tier listings in listingsArchived"
  - "AC-76: The enquiry_submitted handler calls getEngagementCounters(listingId) (D&L §3.2) and fires the first_enquiry conversion trigger only when enquiriesReceived === 1 AND commercial_state.firstEnquiryTriggerFired === false AND subscriptionTier === free. Resolves S6-2"
  - "AC-77: The erasure_completed handler cancels pending win_back_evaluation deferred actions for all listings in listingIdsAnonymised ∪ listingIdsDeleted"
  - "AC-78: The erasure_completed handler anonymises churn_analysis_log entries by setting accountId = null and accountHash = payload.accountHash for all entries matching any listing in listingIdsAnonymised ∪ listingIdsDeleted. Matching is by listingId, not by accountId (CR-ST-15)"
  - "AC-79: The erasure_completed handler clears all conversion trigger fields on commercial_state for affected listings (same reset as CR-29 in claim_approved)"
  - "AC-80: All 8 consumer handlers satisfy P2 for commercial_state (upserts converge to the same final state regardless of replay count). churn_analysis_log is append-only with no dedup key — duplicate events produce duplicate rows. At V1 this is acceptable. Migration trigger documented"
  - "AC-81: All event emissions from §10 handlers satisfy P1 payload self-containment: every emitted event's fields match the authoritative EventPayloadMap entry in SI §1.2"
blocked_by: [CS-WORK-066, CS-WORK-067, CS-WORK-068, CS-WORK-069, CS-WORK-072]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: 2026-03-06T00:00:00
  - node: done
    entered: 2026-03-06T00:00:00
    exited: null
artifacts:
  - src/domains/commercial/consumers/subscription-tier-changed.ts
  - src/domains/commercial/consumers/subscription-ended.ts
  - src/domains/commercial/consumers/claim-approved.ts
  - src/domains/commercial/consumers/listing-archived.ts
  - src/domains/commercial/consumers/quality-score-changed.ts
  - src/domains/commercial/consumers/account-closed.ts
  - src/domains/commercial/consumers/enquiry-submitted.ts
  - src/domains/commercial/consumers/erasure-completed.ts
  - src/domains/commercial/consumers/index.ts
  - src/lib/events/types.ts
  - src/lib/events/singleton.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §10 (authoritative for handler code), S8 §11 (consumer registry), CR §2 (consumed events), SI §1.3 (EVENT_CONSUMER_MATRIX), SI §1.2 (P1 payloads)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-073: Event consumer implementations

## Context

Implements all 8 CR event consumer handlers. Per D5, §10 is authoritative for handler code — handlers import decision architectures from CS-WORK-067 (conversion triggers), CS-WORK-068 (churn intervention), CS-WORK-069 (win-back), and CS-WORK-072 (low-quality intervention) by function name. All consumers are async, all `domain: "commercial"`.

**Consumer summary:**
1. `subscription_tier_changed` → upsert `commercial_state`, log conversion/upgrade/downgrade, emit `conversion_milestone` on first subscription
2. `subscription_ended` → branch on origin (paddle: intervention + win-back schedule; archival/closure: churn log only), emit `churn_risk_detected` on payment failure
3. `claim_approved` → reset conversion trigger state (CR-29), cancel win-back schedules, log win-back attribution
4. `listing_archived` → log churn for paid listings only
5. `quality_score_changed` → trigger low-quality intervention (paid, score <40, >14 days old)
6. `account_closed` → cancel win-back schedules, log churn for paid listings
7. `enquiry_submitted` → evaluate `first_enquiry` trigger via `getEngagementCounters` query-in-handler
8. `erasure_completed` → cancel win-back schedules, anonymise churn logs, clear trigger state

The `EVENT_CONSUMER_MATRIX` already has 2 commercial entries (`subscription_tier_changed:revenueMetrics` and `subscription_ended:churnAndWinback`). This work item adds the remaining 6 entries: `claim_approved:conversionReset`, `listing_archived:archivalChurn`, `quality_score_changed:lowQualityIntervention`, `account_closed:closureChurn`, `enquiry_submitted:firstEnquiryTrigger`, `erasure_completed:erasureCleanup`.

Consumer barrel: `src/domains/commercial/consumers/index.ts` — registers all 8 handler functions, exported for `getEventBus(overrides?)` singleton wiring.

**Type alignment notes:**
- 6 new `EVENT_CONSUMER_MATRIX` entries needed. Each requires `{ consumer, domain: "commercial", mode: "async" }`.
- Existing 2 entries use consumer names `revenueMetrics` and `churnAndWinback`. New entries should follow the same naming convention (camelCase, action-descriptive).
- `getEngagementCounters` from D&L must be available as an importable function. Verify export path from `src/domains/data-and-listings/`.
- All event payload types consumed must match `EventPayloadMap` in `src/lib/events/types.ts`. Some may be stubs — populate during implementation.

## Deliverables

- [x] `src/domains/commercial/consumers/subscription-tier-changed.ts` — handler for `subscription_tier_changed`
- [x] `src/domains/commercial/consumers/subscription-ended.ts` — handler for `subscription_ended`
- [x] `src/domains/commercial/consumers/claim-approved.ts` — handler for `claim_approved`
- [x] `src/domains/commercial/consumers/listing-archived.ts` — handler for `listing_archived`
- [x] `src/domains/commercial/consumers/quality-score-changed.ts` — handler for `quality_score_changed`
- [x] `src/domains/commercial/consumers/account-closed.ts` — handler for `account_closed`
- [x] `src/domains/commercial/consumers/enquiry-submitted.ts` — handler for `enquiry_submitted`
- [x] `src/domains/commercial/consumers/erasure-completed.ts` — handler for `erasure_completed`
- [x] `src/domains/commercial/consumers/index.ts` — consumer barrel: `registerCommercialConsumers(bus, deps)`
- [x] `src/lib/events/types.ts` — Add 6 `EVENT_CONSUMER_MATRIX` entries for commercial consumers + `accountId` on `SubscriptionTierChangedEvent` + `subscriptionTier` on `ListingArchivedEvent`
- [x] `src/domains/commercial/consumers/__tests__/consumers.integration.test.ts` — Integration tests for AC-64 through AC-80
- [ ] `src/domains/commercial/consumers/__tests__/consumers.test.ts` — AC-81 structurally satisfied by branded types + `satisfies` in handler code; no separate unit test file needed
- [x] `src/lib/events/singleton.ts` — Wire commercial consumer registration in `getEventBus`

## References

- `3-requirements/slices/slice-08-commercial/06-event-consumers.md` §10 — authoritative handler implementations
- `3-requirements/slices/slice-08-commercial/index.md` §11 — consumer registry (8 consumers)
- `3-requirements/interfaces/commercial-and-revenue.md` §2 — consumed events
- `3-requirements/interfaces/shared-infrastructure.md` §1.2 — P1 payload types, §1.3 — EVENT_CONSUMER_MATRIX
