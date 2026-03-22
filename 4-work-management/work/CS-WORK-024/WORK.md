---
template: work_item
id: CS-WORK-024
title: "4rfv SQLite extraction + cleaning"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-003
arc: infrastructure
epoch: CS-E1
closed: 2026-02-24
priority: high
effort: high
traces_to:
  - REQ-CS-SEED-001
source_files:
  - D:/PROJECTS/callsheet/4-work-management/4rfv_directory.db
  - D:/PROJECTS/callsheet/src/scripts/import/types.ts
  - D:/PROJECTS/callsheet/src/scripts/import/pipeline.ts
  - D:/PROJECTS/callsheet/src/db/seed/taxonomy-data.json
acceptance_criteria:
  - "AC-01: Data profiling report catalogues field-level quality issues across all columns in the 4rfv SQLite `companies` table (nulls, misplaced data, encoding, format inconsistencies)"
  - "AC-02: Extraction script reads 4rfv SQLite DB and produces ImportRecord[] conforming to src/scripts/import/types.ts"
  - "AC-03: Entity type inference: rows with Companies House number → 'company', rows without → 'freelancer' (with override list for known exceptions)"
  - "AC-04: Taxonomy mapping: 4rfv subcategories mapped to CALLSHEET taxonomy (7 sectors, 64 service areas, 269 specialisations). Unmapped subcategories logged. Coverage ≥ 90% of listings."
  - "AC-05: Field extraction handles known data quality issues identified in profiling (postcodes in wrong columns, OCR artefacts, HTML entities, encoding corruption)"
  - "AC-06: Services array populated from taxonomy mapping — each listing gets specialisation slugs matching its 4rfv subcategory"
  - "AC-07: Extraction produces deterministic output — same DB input → same ImportRecord[] output (no random IDs, stable sort)"
  - "AC-08: Integration test: extraction → pipeline round-trip — ImportRecord[] from extraction passes through runImportPipeline without type errors and commits listings to DB"
blocked_by: []
blocks: []
enables: [CS-WORK-021]
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: 2026-02-24T00:00:00
  - node: done
    entered: 2026-02-24T00:00:00
    exited: null
artifacts:
  - 4-work-management/work/CS-WORK-024/reports/data-profile.md
  - src/scripts/import/extract-4rfv.ts
  - src/scripts/import/taxonomy-map.ts
  - src/scripts/import/profile-4rfv.ts
  - src/scripts/import/__tests__/extract-4rfv.test.ts
  - src/scripts/import/__tests__/extract-4rfv.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "S2 §6, Ops §6"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-24T00:00:00
---

# CS-WORK-024: 4rfv SQLite extraction + cleaning

## Context

The 4rfv source database (`4-work-management/4rfv_directory.db`, ~25MB, 4,657 `companies` rows) is a SQLite dump from 4rfv.co.uk. CS-WORK-021's import pipeline consumes `ImportRecord[]` and handles normalisation (Phase 1), CH verification (Phase 2), dedup (Phase 3), and commit (Phase 4). This work item bridges the gap: read the raw SQLite, profile data quality, map 4rfv's ~790 subcategories to CALLSHEET's 3-level taxonomy (7/64/269), handle known data quality issues (postcodes in description fields, OCR artefacts from PDF scraping, HTML entities, encoding corruption), and produce clean `ImportRecord[]` that the existing pipeline consumes.

**Step 1 is data profiling** — before writing extraction code, systematically catalogue every column's actual content distribution, null rates, format inconsistencies, and edge cases. The profiling report drives the extraction logic.

## Deliverables

- [x] `4-work-management/work/CS-WORK-024/reports/data-profile.md` — Field-level quality report: column types, null rates, value distributions, anomalies, misplaced data patterns
- [x] `src/scripts/import/extract-4rfv.ts` — Extraction script: reads SQLite DB, applies field mapping + cleaning, produces `ImportRecord[]`
- [x] `src/scripts/import/taxonomy-map.ts` — 4rfv subcategory → CALLSHEET specialisation slug mapping. Exports `map4rfvSubcategory(subcategory: string): string[]`
- [x] `src/scripts/import/__tests__/extract-4rfv.test.ts` — Unit tests: field extraction, entity type inference, taxonomy mapping coverage (16 tests)
- [x] `src/scripts/import/__tests__/extract-4rfv.integration.test.ts` — Integration test: full extraction → pipeline round-trip against DB (5 tests)

## Approach

1. **Profile.** Install `better-sqlite3` as dev dependency. Script reads every column, reports nulls, value distributions, regex match rates for postcodes/emails/URLs/phones, encoding anomalies. Output: `data-profile.md`.
2. **Map taxonomy.** Export distinct subcategories from 4rfv. Manual + heuristic mapping to `taxonomy-data.json` slugs. Log unmapped subcategories with row counts. Target: ≥90% listing coverage.
3. **Extract.** Row-by-row extraction into `ImportRecord`. Entity type from CH number presence. Services from taxonomy map. Field-level cleaning for issues found in profiling.
4. **Validate.** Integration test passes `ImportRecord[]` through `runImportPipeline()` and asserts listings committed to Postgres.

## References

- `4-work-management/4rfv_directory.db` — Source SQLite database
- `src/scripts/import/types.ts` — `ImportRecord` type contract
- `src/scripts/import/pipeline.ts` — Downstream consumer (CS-WORK-021)
- `src/db/seed/taxonomy-data.json` — Authoritative taxonomy (7/64/269)
- `3-requirements/slices/slice-02-onboarding.md` §6 — 4rfv import specification
- `2-concept-design/operations.md` §6 — 4rfv import pipeline concept
