---
template: work_item
id: CS-WORK-076
title: "Quality scoring engine"
type: feature
status: done
owner: null
created: 2026-03-06
spawned_by: null
spawned_children: []
chapter: CH-CS-011
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-07
priority: critical
effort: large
traces_to:
  - REQ-CS-INTEL-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/01-quality-scoring.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-1: computeQualityScore returns a QualityScore with all 5 dimensions summing to composite (0-100)"
  - "AC-2: Completeness dimension scores 0 when listing has no name, no description, no location, no taxonomy tag, and no credit"
  - "AC-3: Completeness dimension scores 25 (maximum) when all mandatory, important, and enriching fields are populated"
  - "AC-4: Freshness dimension returns 25 for edits within 30 days, 13 at 90 days, and 2 at 180+ days"
  - "AC-5: Accuracy dimension returns verification tier base minus 3 per active decay signal, floor 0"
  - "AC-6: Richness dimension applies diminishing returns (min() cap) per category and returns max 15"
  - "AC-7: Verification dimension maps directly from verification tier: unclaimed=0, claimed=5, verified=10, premium_verified=15"
  - "AC-8: Band boundary crossing from Fair to Good (composite rises from 59 to 60) triggers evaluateQualityScoreBand with direction improved"
  - "AC-9: Band boundary crossing from Good to Fair (composite drops from 60 to 59) triggers evaluateQualityScoreBand with direction declined and notification includes top 3 improvement suggestions"
  - "AC-10: quality_score_changed event payload includes listingId, previousComposite, newComposite, changedDimensions per D&L §1.8 QualityScoreChangedEvent"
  - "AC-11: profile_viewed deduplication: same viewerAccountId + same listingId within 1 hour increments counter only once"
  - "AC-12: claim_abandonment_check reverts listings with claimStatus pending_review older than 90 days to claimStatus unclaimed"
  - "AC-13: claim_abandonment_check schedules pre_claim_snapshot_cleanup for each reverted listing"
  - "AC-14: Profile strength meter returns quality_score_explanations-driven recommendations when calculatedBy is calibrated, falls back to S2 field-presence check when calculatedBy is zero_init"
  - "AC-15: computeTopImprovements returns factors from the dimension with the largest gap (maxScore - currentScore) first"
  - "AC-16: logDecision quality_score_band_evaluation creates a decision_logs entry with listingId, previousBand, newBand, direction, and algorithmVersion on every band crossing"
  - "AC-17: Nightly batch schedules quality_score_recalculation for every listing with lifecycleStatus active"
  - "AC-18: calculatedBy transitions from zero_init to calibrated on first recalculation and never reverts"
  - "AC-19: Unclaimed listing with complete seed data and fresh liveness check scores band fair (composite 40-59); band good is unreachable without claiming"
  - "AC-20: quality_score_changed event is NOT emitted when score changes within the same band"
  - "AC-21: claim_abandonment_check self-perpetuates by scheduling its next run 24 hours after completion"
blocked_by: [CS-WORK-075]
blocks: [CS-WORK-078, CS-WORK-079]
enables: [CS-WORK-081]
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-03-06T00:00:00
    exited: 2026-03-07T00:00:00
  - node: done
    entered: 2026-03-07T00:00:00
    exited: null
artifacts:
  - src/domains/data-and-listings/quality/scoring.ts
  - src/domains/data-and-listings/quality/dedup.ts
  - src/lib/scheduler/handlers/quality-score-recalculation.ts
  - src/lib/scheduler/handlers/claim-abandonment-check.ts
  - src/server/routers/admin/intelligence.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §1 (quality scoring), D&L §1.8 (QualityScoreChangedEvent), D&L §4 (quality scoring contract), SI §9.2 (quality_score_band_evaluation decision type)"
  io_profile: "db-read-write, event-emit"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-076: Quality scoring engine

## Context

Implements calibrated quality scoring replacing S1's zero-initialised stubs. `computeQualityScore` is a pure function over 5 additive dimensions (Completeness 0-25, Freshness 0-25, Accuracy 0-20, Richness 0-15, Verification 0-15) producing composite 0-100. Band boundaries: Poor 0-19, Below Average 20-39, Fair 40-59, Good 60-79, Excellent 80-100. Band crossing triggers `quality_score_changed` event emission + `quality_score_band_evaluation` decision log. `profile_viewed` P2 deduplication (1-hour time window). `claim_abandonment_check` daily batch (>90 days pending_review → revert to unclaimed). Profile strength meter upgrade from S2 field-presence fallback to quality-score-explanation-driven recommendations. Two deferred action handlers: `quality_score_recalculation` (event-driven + nightly batch) and `claim_abandonment_check` (daily, self-perpetuating).

**Type alignment notes:**
- `QualityScoreChangedEvent` already populated in `src/lib/events/types.ts` with correct fields (`listingId`, `previousComposite`, `newComposite`, `changedDimensions`).
- `quality_score_recalculation` and `claim_abandonment_check` already in `DeferredActionParamsMap`.
- `pre_claim_snapshot_cleanup` already in `DeferredActionParamsMap` (from S3).
- Existing `computeQualityScore` stub (if any) in `src/lib/search/ranking.ts` — grep before implementing.

Also creates the admin intelligence router shell at `src/server/routers/admin/intelligence.ts` with the `qualityDistribution` route (quality score histogram + band counts). CS-WORK-077, 079, and 080 append their routes to this file.

## Deliverables

- [x] `src/domains/data-and-listings/quality/scoring.ts` — `computeQualityScore`, dimension functions, band evaluation, `computeTopImprovements`
- [x] `src/domains/data-and-listings/quality/dedup.ts` — `deduplicateProfileView` (1-hour time-window check)
- [x] `src/domains/data-and-listings/quality/__tests__/scoring.test.ts` — Unit tests for AC-1 through AC-7, AC-15, AC-19
- [x] `src/lib/scheduler/handlers/quality-score-recalculation.ts` — Deferred action handler (event-driven + nightly batch)
- [x] `src/lib/scheduler/handlers/claim-abandonment-check.ts` — Daily batch handler (self-perpetuating)
- [x] `src/lib/scheduler/handlers/__tests__/quality-score-recalculation.integration.test.ts` — Integration tests for AC-8, AC-9, AC-10, AC-16, AC-17, AC-18, AC-20
- [x] `src/lib/scheduler/handlers/__tests__/claim-abandonment-check.integration.test.ts` — Integration tests for AC-12, AC-13, AC-21
- [x] `src/domains/data-and-listings/quality/__tests__/dedup.integration.test.ts` — Integration test for AC-11
- [x] `src/domains/data-and-listings/quality/__tests__/profile-strength.integration.test.ts` — Integration test for AC-14
- [x] `src/server/routers/admin/intelligence.ts` — Create admin intelligence router with `qualityDistribution` route

## References

- `3-requirements/slices/slice-09-entity-intelligence/01-quality-scoring.md` — Full §1 spec
- `3-requirements/interfaces/data-and-listings.md` §1.8 — `QualityScoreChangedEvent` payload
- `3-requirements/interfaces/data-and-listings.md` §4 — Quality scoring contract
- `3-requirements/interfaces/shared-infrastructure.md` §9.2 — `quality_score_band_evaluation` decision type
