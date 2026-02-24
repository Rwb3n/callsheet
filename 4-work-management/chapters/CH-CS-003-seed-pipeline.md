---
id: CH-CS-003
title: Seed Pipeline
arc: infrastructure
epoch: CS-E1
status: Active
depends: CH-CS-002
work_items: [CS-WORK-021, CS-WORK-022, CS-WORK-024]
---

# Chapter: Seed Pipeline

## Problem

CALLSHEET launches with ~4,700 listings seeded from 4rfv.co.uk. The seed pipeline imports, normalises, deduplicates, and creates zero-initialised rows across all entity tables. Taxonomy seed data (7 sectors, 64 service areas, 269 specialisations) is already implemented in CS-WORK-007 (CH-CS-002). This chapter covers the 4rfv listing import pipeline (5 phases) and Article 14 GDPR compliance — both distinct from the taxonomy seed and from user-initiated onboarding flows (CH-CS-004).

## Requirements

Source: `3-requirements/slices/slice-02-onboarding.md` (v2) — §6 (4rfv Import), §11 (Article 14 On-Page Notice), §12 (Deferred Actions), §14 (AC table: 4rfv Import + Article 14 Compliance sections).

17 acceptance criteria across 3 work items:
- **CS-WORK-024** (8 AC): SQLite extraction — data profiling, taxonomy mapping, ImportRecord[] production
- **CS-WORK-021** (7 AC): Import pipeline Phases 1-4 — cleaning, CH verification, dedup, commit
- **CS-WORK-022** (2 AC): Article 14 GDPR compliance — Phase 5 email + on-page notices

Note: S1 taxonomy seed (CS-WORK-007) is in CH-CS-002, not this chapter.

## Work Items

| ID | Title | ACs | Effort | Priority | Blocked By |
|---|---|---|---|---|---|
| CS-WORK-024 | 4rfv SQLite extraction + cleaning | 8 (AC-01..AC-08) | high | high | — |
| CS-WORK-021 | 4rfv import pipeline | 7 (AC-22..AC-26, AC-46, AC-47) | medium | high | — |
| CS-WORK-022 | Article 14 GDPR compliance | 2 (AC-27, AC-28) | small | high | CS-WORK-021 |

**Dependencies:** CS-WORK-024 produces `ImportRecord[]` that CS-WORK-021's pipeline consumes (`enables` relationship — pipeline code is already built, extraction feeds it). CS-WORK-022 depends on CS-WORK-021 because Phase 5 (Article 14 notices) runs after Phases 1-4 commit listings to the database.

## Success Criteria

- [ ] ~4,700 listings imported with correct entity types, `source = "4rfv_import"`, `claimStatus = "unclaimed"`
- [ ] All child table rows (verification, quality_scores, quality_score_explanations, engagements) zero-initialised per two-phase pattern
- [ ] Intra-batch deduplication eliminates near-duplicate records (name similarity >0.9 + CH number match)
- [ ] No `listing_created` events emitted, no `listing_live` emails sent for seed imports
- [ ] Article 14 email sent to all imported listings with contact email within 30-day compliance window
- [ ] On-page Article 14 notice set for imported listings without contact email
- [ ] All 9 AC verified (7 integration tests for pipeline, 2 integration tests for Article 14)
