---
template: work_item
id: CS-WORK-090
title: "Algorithm versioning and controlled rollout"
type: feature
status: done
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: 2026-03-29
priority: medium
effort: medium
traces_to:
  - REQ-CS-HARDEN-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-65: selectAlgorithmVersion(listingId, 10) returns 2 for listing whose crc32(listingId) % 100 is 7, returns 1 for listing whose bucket is 15"
  - "AC-66: selectAlgorithmVersion is deterministic: same listingId and rolloutPercentage always returns same version"
  - "AC-67: During rollout, scoreListingDuringRollout for V2-cohort listing writes algorithmVersion = 2 to quality_scores AND logs algorithm_comparison in decision_logs with both V1 and V2 scores"
  - "AC-68: handleRolloutPercentageChange(10, 25) schedules quality_score_recalculation only for listings in buckets 10-24 (crossing boundary), not 0-9 or 25-99"
  - "AC-69: checkAlgorithmRollbackTrigger returns shouldRollback: true when declassification rate exceeds 10% and logs graduation_evaluation decision with graduated: false and reason containing 'quality regression'"
  - "AC-70: logDecision('graduation_evaluation', ...) called on every handleRolloutPercentageChange invocation, capturing previousPercentage, newPercentage, affectedListings"
  - "AC-71: Rollback (setting rollout to 0%) schedules quality_score_recalculation for all listings with algorithmVersion = 2, and after re-scoring all have algorithmVersion = 1"
  - "AC-72: evaluateAlgorithmRolloutGraduation returns graduated: true when V2 stable at 100% for 4 weeks with declassification rate <5%"
blocked_by: [CS-WORK-089]
blocks: []
enables: []
queue_position: null
cycle_phase: null
node_history: []
artifacts:
  - src/domains/intelligence/graduation/algorithm-rollout.ts
  - src/server/routers/admin/graduation.ts
  - src/domains/intelligence/graduation/__tests__/algorithm-rollout.test.ts
  - src/domains/intelligence/graduation/__tests__/algorithm-rollout.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S10
  spec_sections: "S10 §8 (algorithm versioning and controlled rollout), S10 §7 (autonomy graduation — algorithm rollout capability)"
  io_profile: "db-read-write, decision-log, deferred-action-schedule"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-090: Algorithm versioning and controlled rollout

## Context

Implements quality score algorithm A/B testing infrastructure. `selectAlgorithmVersion` uses `crc32(listingId) % 100` for deterministic, percentage-based traffic split. `scoreListingDuringRollout` computes both V1 and V2 scores for the rollout cohort, writes the assigned version's score to `quality_scores`, and logs an `algorithm_comparison` decision for monitoring. `handleRolloutPercentageChange` identifies listings crossing the threshold boundary and schedules `quality_score_recalculation` only for those. `checkAlgorithmRollbackTrigger` monitors declassification rate (V2 listings scoring lower than V1 equivalent). Full rollback re-scores all V2 listings back to V1. Graduation: V2 stable at 100% for 4 weeks with <5% declassification.

Adds the remaining 2 admin graduation routes (`algorithmRollout`, `algorithmComparison`) to the router created in CS-WORK-089.

**Type alignment notes:**
- `algorithmVersion` column already exists on `quality_scores` table — aligned.
- `quality_score_recalculation` deferred action already registered with `{ listingId: UUID }` — aligned.
- `graduation_evaluation` decision type registered in CS-WORK-089 — consumed here for rollback logging.
- CRC32: use `pg_catalog.hashtext()` or implement in TypeScript. Spec says `crc32` — verify available approach.

## Deliverables

- [x] `src/domains/intelligence/graduation/algorithm-rollout.ts` — `selectAlgorithmVersion`, `scoreListingDuringRollout`, `handleRolloutPercentageChange`, `checkAlgorithmRollbackTrigger`, `evaluateAlgorithmRolloutGraduation`
- [x] `src/server/routers/admin/graduation.ts` — Add `algorithmRollout` and `algorithmComparison` routes
- [x] `src/domains/intelligence/graduation/__tests__/algorithm-rollout.test.ts` — Unit tests for AC-65, AC-66
- [x] `src/domains/intelligence/graduation/__tests__/algorithm-rollout.integration.test.ts` — Integration tests for AC-67, AC-68, AC-69, AC-70, AC-71, AC-72

## References

- `3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md` — §8 full spec
- `3-requirements/slices/slice-10-hardening/00-router-plan.md` — §2 graduation routes (algorithmRollout, algorithmComparison)
- `3-requirements/interfaces/shared-infrastructure.md` §9.2 — Decision logging
