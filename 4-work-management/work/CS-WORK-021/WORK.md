---
template: work_item
id: CS-WORK-021
title: "4rfv import pipeline"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-003
arc: infrastructure
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: medium
traces_to:
  - REQ-CS-SEED-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-22: Phase 1 automated cleaning normalises postcodes, emails, URLs; flags invalid records"
  - "AC-23: Phase 2 CH batch verification identifies dissolved companies"
  - "AC-24: Batch integrity: intra-batch deduplication clusters by name similarity (>0.9) and CH number"
  - "AC-25: Non-flagged records committed with claimStatus = 'unclaimed', source = '4rfv_import'"
  - "AC-26: listing_live email NOT sent for seed import listings"
  - "AC-46: Import pipeline creates one-to-one rows (verification, quality_scores, quality_score_explanations, engagements) per listing"
  - "AC-47: Import pipeline does NOT emit listing_created events (accountId is null, violates type)"
blocked_by: []
blocks: [CS-WORK-022]
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
  spec_sections: "S2 §6.1-§6.4, §6.6-§6.8, D&L §4 (batch integrity)"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-021: 4rfv import pipeline

## Context

CLI-based 5-phase import pipeline for ~4,700 seed listings from 4rfv.co.uk. Phases 1-4 cover automated cleaning (postcode/email/URL normalisation), Companies House batch verification (dissolved company detection with 600 req/5min rate limit), intra-batch deduplication (sorted-neighbour sliding window, pg_trgm similarity >0.9 + CH number exact match), and commit of non-flagged records. Each committed listing creates the full set of one-to-one rows (verification, quality_scores, quality_score_explanations, engagements) following the S1 two-phase pattern. The pipeline does NOT emit `listing_created` events (accountId is null, violating the typed contract) and does NOT send `listing_live` emails. Search indexing relies on the tsvector trigger firing on INSERT. Adds `source` column to listings table (`text`, nullable, "4rfv_import" for seed data). Phase 5 (Article 14) is handled by CS-WORK-022.

## Deliverables

- [x] Migration: `source` column on `listings` table
- [x] `src/scripts/import/pipeline.ts` — Orchestrates phases 1-4 sequentially (Phase 5 delegated to CS-WORK-022)
- [x] `src/scripts/import/phase-1-clean.ts` — Postcode, email, URL, phone normalisation; flags invalid records
- [x] `src/scripts/import/phase-2-ch-verify.ts` — Companies House batch lookup with 500ms rate-limit delay; dissolved company detection
- [x] `src/scripts/import/phase-3-export.ts` — Export flagged records for manual cleaning (stub for S7)
- [x] `src/scripts/import/phase-4-removal.ts` — Archive flagged records
- [x] `src/scripts/import/integrity.ts` — `batchImportIntegrity()`: sorted-neighbour dedup (window 10, similarity >0.9) + CH number clustering
- [x] `src/scripts/import/__tests__/phase-1-clean.test.ts` — Unit tests: postcode normalisation, email validation, URL normalisation, flagging
- [x] `src/scripts/import/__tests__/phase-2-ch-verify.test.ts` — Unit tests: dissolved detection, rate limiting, missing CH number passthrough
- [x] `src/scripts/import/__tests__/integrity.test.ts` — Unit tests: name similarity clustering, CH number clustering, merge + best-record selection
- [x] `src/scripts/import/__tests__/pipeline.integration.test.ts` — Integration tests: end-to-end import with DB assertions (AC-25, AC-46, AC-47, AC-26)

## References

- `3-requirements/slices/slice-02-onboarding.md` §6.1 Import Pipeline, §6.2 Phase 1, §6.3 Phase 2, §6.4 Batch Import Integrity, §6.6 Import Record Schema, §6.7 Listing Import Commit, §6.8 Schema Addition (source column)
- `3-requirements/interfaces/data-and-listings.md` §4 (batch integrity rules)
- `3-requirements/slices/slice-01-data-model.md` §10 (two-phase creation pattern)
