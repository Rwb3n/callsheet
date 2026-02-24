---
template: work_item
id: CS-WORK-011
title: "Listing integrity rules"
type: feature
status: done
owner: null
created: 2026-02-20
spawned_by: null
spawned_children: []
chapter: CH-CS-002
arc: infrastructure
epoch: CS-E1
closed: null
priority: high
effort: medium
traces_to:
  - REQ-CS-DATA-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-27: Rule 1: Listing with >80% taxonomy overlap to same-account listing flagged"
  - "AC-28: Rule 2: Listing with CH number not matching account holder flagged"
  - "AC-29: Rule 3: Listing with CH number already used by different account flagged"
  - "AC-30: Rule 2: Listing with dissolved CH number rejected"
  - "AC-31: Integrity pipeline short-circuits on first non-allow result"
  - "AC-40: computeTaxonomyOverlap returns 1.0 for identical tag sets, 0.0 for disjoint, correct Jaccard for partial"
blocked_by: [CS-WORK-007]
blocks: [CS-WORK-009]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-20T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S1
  spec_sections: "D&L §4, D&L §3.1"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-011: Listing integrity rules

## Context

Three entity-enforced rules at listing creation: (1) duplicate detection via >80% taxonomy overlap with same-account listings, (2) identity verification via Companies House API — director check + name similarity + dissolved status rejection, (3) CH number uniqueness — same CH number on different accounts flagged. Sequential pipeline (`runIntegrityChecks`) that short-circuits on first non-allow result. Uses `CompaniesHouseService` from S0 service abstraction. Includes `computeTaxonomyOverlap` (Jaccard similarity at service area level) — the cross-domain query interface consumed by PP and CR.

## Deliverables

- [x] `src/domains/data-and-listings/integrity/duplicate-detection.ts` — Rule 1
- [x] `src/domains/data-and-listings/integrity/identity-verification.ts` — Rule 2
- [x] `src/domains/data-and-listings/integrity/ch-uniqueness.ts` — Rule 3
- [x] `src/domains/data-and-listings/integrity/index.ts` — `runIntegrityChecks()` pipeline
- [x] `src/domains/data-and-listings/integrity/types.ts` — IntegrityResult + TaxonomyTag types
- [x] `src/domains/data-and-listings/taxonomy/overlap.ts` — `computeTaxonomyOverlap()`
- [x] Tests: 9 unit (6 overlap + 3 pipeline) + 11 integration (3 duplicate + 5 identity + 3 CH)

## References

- `3-requirements/slices/slice-01-data-model.md` §6 Listing Integrity Rules
- `3-requirements/interfaces/data-and-listings.md` §3.1 (computeTaxonomyOverlap), §4
