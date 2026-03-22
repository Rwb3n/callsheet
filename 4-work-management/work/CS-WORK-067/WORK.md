---
template: work_item
id: CS-WORK-067
title: "Conversion trigger engine and routes"
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
  - REQ-CS-CR-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/01-conversion-triggers.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-1: view_milestone fires at 50, 100, 200 profile views for free-tier listings. Each milestone fires exactly once. State records lastViewMilestoneFired with the crossed threshold"
  - "AC-2: view_milestone respects 7-day cooldown between milestone emails. A listing crossing 50 and 100 within 5 days receives the 50-milestone email immediately and the 100-milestone email after the cooldown expires"
  - "AC-3: first_enquiry fires exactly once when getEngagementCounters(listingId).enquiriesReceived === 1 for a free-tier listing. Subsequent enquiries do not re-trigger"
  - "AC-4: competitor_upgraded respects 30-day cooldown and maxFirings=3. After 3 firings, further competitor upgrades in the same sector do not trigger. Anonymity threshold (pool >= 20) is enforced"
  - "AC-5: analytics_teaser fires on 14-day cooldown for free-tier listings with profileViews > 0. social_proof fires on 30-day cooldown when sector has >= 3 paid listings. engagement_summary fires on 7-day cooldown when any engagement data exists"
  - "AC-6: Endowment CTA displays 'See who's viewing your profile' on the free-tier analytics section when profileViews >= 5. Category fallback displays aggregate data when profileViews < 5 but categoryStats.monthlySearches > 20. endowmentCtaShown is set only by the primary variant, not the fallback"
  - "AC-7: All conversion_milestone emissions match ConversionMilestoneEvent payload type (CR §1.1): type, listingId, accountId, milestone (typed ConversionMilestoneId), milestoneLabel, timestamp"
  - "AC-8: Email merge fields for conversion_view_milestone include listingName, milestoneValue, upgradeUrl. Merge fields for conversion_analytics_teaser include listingName, viewCount, searchAppearanceCount, upgradeUrl. Merge fields for conversion_social_proof include listingName, competitorName (anonymised), upgradeUrl. Merge fields for conversion_engagement_summary include listingName, viewCount, enquiryCount, upgradeUrl"
  - "AC-9: All conversion emails use category conversion_marketing. EmailService.send() returns status suppressed for unsubscribed providers. Trigger state is still updated even when email is suppressed"
  - "AC-10: evaluateUpgradeSuggestion returns the highest-priority unfired trigger as an UpgradeSuggestion for free-tier listings. Returns null for non-free-tier listings or when no triggers are eligible. Ownership check ensures ctx.session.accountId matches listings.accountId"
  - "AC-11: getConversionTriggerState returns default zero-state when no commercial_state row exists. Returns full trigger tracking fields when row exists. Ownership check enforced"
  - "AC-12: claim_approved consumer resets all conversion trigger state: all *Fired counters to 0/false, all last*At timestamps to null, endowmentCtaShown to false. Churn fields (lastChurnEventAt, lastChurnReason, effectivePriceAtSubscription) are preserved"
  - "AC-13: Every trigger evaluation is logged as conversion_trigger_evaluation decision type with inputs (triggerType, listingId, subscriptionTier) and output (fired, reason)"
blocked_by: [CS-WORK-066]
blocks: []
enables: [CS-WORK-073]
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
  slice: S8
  spec_sections: "S8 §1, CR §5.3 (trigger catalogue), CR §1.1 (ConversionMilestoneEvent), SI §9.2 (conversion_trigger_evaluation decision type)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-067: Conversion trigger engine and routes

## Context

Implements the 6-trigger conversion engine that nudges free-tier providers toward upgrade. Each trigger has a typed condition, cooldown period, lifetime firing cap, and action (emit `conversion_milestone`, send conversion email, or show in-app CTA). The engine writes firing state to `commercial_state` and logs every evaluation via `conversion_trigger_evaluation` decision type.

Two tRPC routes: `commercial.evaluateUpgradeSuggestion` (returns highest-priority unfired trigger for dashboard CTA) and `commercial.getConversionTriggerState` (reads trigger tracking fields). Both are `protectedProcedure` with ownership check. The 6 trigger evaluator functions are exported for import by consumer handlers (CS-WORK-073).

AC-12 (claim_approved reset) is tested here because it exercises the trigger state reset logic, even though the consumer handler that invokes it lives in CS-WORK-073. The pure evaluation functions for each trigger are exported; §10 consumers import and call them.

**Type alignment notes:**
- `ConversionMilestoneEvent` payload type needs to exist in `src/lib/events/types.ts`. If stub, populate: `{ type, listingId, accountId, milestone: ConversionMilestoneId, milestoneLabel, timestamp }`.
- `conversion_trigger_evaluation` decision type needs SI §9.2 registration. Add to `DECISION_TYPE` union if not present.
- `getEngagementCounters` D&L query interface (D&L §3.2) already exists. Confirm export path.

## Deliverables

- [x] `src/domains/commercial/conversion-triggers.ts` — 6 trigger evaluators, `evaluateUpgradeSuggestion`, `evaluateEndowmentCta`, `resetConversionTriggerState`, 4 email template registrations
- [x] `src/domains/commercial/__tests__/conversion-triggers.test.ts` — 20 unit tests (AC-7, AC-8)
- [x] `src/server/routers/commercial.ts` — `createCommercialRouter(deps)` with `evaluateUpgradeSuggestion` and `getConversionTriggerState` routes
- [x] `src/server/routers/__tests__/commercial.integration.test.ts` — 33 integration tests (AC-1 through AC-6, AC-9 through AC-13)
- [x] `src/server/root.ts` — Wire commercial router under `commercial` namespace (20th domain router)
- [x] `src/lib/events/types.ts` — Populated `ConversionMilestoneEvent` fields + `ConversionMilestoneId` type

## References

- `3-requirements/slices/slice-08-commercial/01-conversion-triggers.md` §1
- `3-requirements/slices/slice-08-commercial/00-router-plan.md` §2.2 — route specs
- `3-requirements/interfaces/commercial-and-revenue.md` §1.1 — `conversion_milestone` event, §5.3 — trigger catalogue
