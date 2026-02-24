---
template: work_item
id: CS-WORK-015
title: "Company listing creation and CH lookup"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-004
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: medium
traces_to:
  - REQ-CS-ONBOARD-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-11: Company listing created with correct entity type and taxonomy tags (min 1)"
  - "AC-12: Companies House lookup returns company data for auto-population"
  - "AC-13: CH number for dissolved company shows warning in UI"
  - "AC-14: Full integrity pipeline runs: duplicate check, identity verification, CH uniqueness"
  - "AC-15: Flagged company listing created with lifecycleStatus = suspended, claimStatus = pending_review; provider receives being reviewed response [S2-ST-13]"
blocked_by: [CS-WORK-013]
blocks: [CS-WORK-018]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "PP §4.3, D&L §3.1, SI §2, S2 §4"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-015: Company listing creation and CH lookup

## Context

Implements `createCompany` and `lookupCompaniesHouse` on the `listingCreationRouter`. Company creation runs the full integrity pipeline (duplicate, identity verification via CH, CH uniqueness). Flagged companies are created with `lifecycleStatus = "suspended"` and `claimStatus = "pending_review"` rather than being blocked entirely (S2-ST-13). The CH lookup query enables auto-population of company name, registered address, and director names. AC-13 (dissolved company warning) is E2E but the server response shape is integration-testable. Shares the `scheduleProgressiveDisclosure` function from CS-WORK-014.

## Deliverables

- [ ] `src/server/routers/listing-creation.ts` -- `createCompany` mutation, `lookupCompaniesHouse` query
- [ ] `src/lib/onboarding/companies-house-lookup.ts` -- CH lookup wrapper with rate limiting
- [ ] `src/lib/onboarding/__tests__/company-creation.integration.test.ts` -- AC-11, AC-12, AC-14, AC-15 integration; AC-13 E2E

## References

- `3-requirements/slices/slice-02-onboarding.md` S4 Path B, S4.2 CH Auto-Population
- `3-requirements/interfaces/platform-and-product.md` S4.3
- `3-requirements/interfaces/data-and-listings.md` S3.1 (integrity rules)
