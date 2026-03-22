---
template: work_item
id: CS-WORK-070
title: "Sponsored placement selection"
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
priority: high
effort: large
traces_to:
  - REQ-CS-CR-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/03-sponsored-placement.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-29: commercial.getSponsoredListings returns SponsoredListingResult[] with 0-3 entries. Each entry has listingId: UUID, position: number (0-indexed), isSponsored: true"
  - "AC-30: Only listings with subscriptionTier in [premium, partner], lifecycleStatus === active, accountId !== null, and taxonomy overlap with the query's sectorId/serviceAreaIds appear as candidates"
  - "AC-31: Candidates with qualityScores.composite < 50 are excluded"
  - "AC-32: Slot count follows the progression: 0 slots if < 3 qualified candidates, 1 if 3-5, 2 if 6-10, 3 if > 10"
  - "AC-33: Rotation offset is deterministic: same listing ID + same UTC date produces the same offset. Different dates produce different offsets"
  - "AC-34: Listings exceeding 3x mean impressions for the queried service area in the 30-day window are excluded from selection"
  - "AC-35: Each sponsored listing served produces one sponsored_impressions row per relevant service area with correct listingId, serviceAreaId, and impressionDate"
  - "AC-36: sponsored_impressions rows older than 90 days are deleted during fairness cap evaluation"
  - "AC-37: Anonymous users (no ctx.session) do not receive sponsored listings — PP conditionally skips the call"
  - "AC-38: Every invocation logs a sponsored_placement_selection decision with candidateCount, qualifiedCount, fairnessCappedCount, selectedListingIds, and slotCount"
blocked_by: [CS-WORK-066]
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
  - src/domains/commercial/sponsored-placement.ts
  - src/domains/commercial/__tests__/sponsored-placement.test.ts
  - src/server/routers/commercial.ts
  - src/server/routers/__tests__/sponsored-placement.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §4, CR §4.4 (sponsored placement), SI §9.2 (sponsored_placement_selection decision type)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-070: Sponsored placement selection

## Context

Implements `selectSponsoredListings` — the algorithm that injects 0–3 paid listings into search results as a distinct sponsored section. Called server-side by PP's search page via `commercial.getSponsoredListings` tRPC route (`protectedProcedure`).

The selection pipeline: (1) candidate pool — Premium/Partner tier + query taxonomy overlap + active lifecycle, (2) quality floor — composite >= 50, (3) slot count — 0/1/2/3 based on qualified count, (4) fairness cap — exclude listings exceeding 3x mean impressions per service area in 30-day window, (5) deterministic rotation — same listing + same UTC date = same offset, (6) impression recording — one `sponsored_impressions` row per service area per selected listing.

Probabilistic cleanup (5% per invocation, per S8-ST-12) deletes `sponsored_impressions` rows older than 90 days during fairness cap evaluation.

AC-37 (anonymous user gating) is actually enforced by PP's search page — it conditionally skips the tRPC call when no session exists. The route itself is `protectedProcedure` and returns 401 for unauthenticated calls.

**Type alignment notes:**
- `sponsored_placement_selection` decision type needs SI §9.2 registration.
- `computeTaxonomyOverlap` D&L export referenced in S8-ST-3 resolution: resolve listing IDs to tag arrays via `getListingTaxonomyTags()` before calling the export. For sponsored placement, the simpler approach is direct `listingTaxonomyTags` join (no external function call needed — the taxonomy filter is a SQL WHERE clause, not the D&L export function).

## Deliverables

- [x] `src/domains/commercial/sponsored-placement.ts` — `selectSponsoredListings`, `computeSlotCount`, `dailyRotationOffset`, `applyFairnessCap`, `recordImpressions`, `cleanupOldImpressions`
- [x] `src/domains/commercial/__tests__/sponsored-placement.test.ts` — Unit tests for AC-32, AC-33
- [x] `src/server/routers/commercial.ts` — Add `getSponsoredListings` route to commercial router
- [x] `src/server/routers/__tests__/sponsored-placement.integration.test.ts` — Integration tests for AC-29, AC-30, AC-31, AC-34, AC-35, AC-36, AC-37, AC-38

## References

- `3-requirements/slices/slice-08-commercial/03-sponsored-placement.md` §4
- `3-requirements/interfaces/commercial-and-revenue.md` §4.4 — selection algorithm
- `3-requirements/slices/slice-08-commercial/00-router-plan.md` §2.2 — `getSponsoredListings` route spec
