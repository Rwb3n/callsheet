---
template: work_item
id: CS-WORK-008
title: "Full-text search infrastructure"
type: feature
status: done
owner: null
created: 2026-02-20
spawned_by: null
spawned_children: []
chapter: CH-CS-002
arc: infrastructure
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: medium
traces_to:
  - REQ-CS-DATA-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-11: Search vector auto-updates on name/headline/bio/region change (trigger)"
  - "AC-12: Full-text search returns results ranked by ts_rank_cd * quality/paid boost"
  - "AC-13: Trigram index: similarity(name, query) > 0.3 returns fuzzy matches"
  - "AC-14: Taxonomy tag filtering: search with sector/serviceArea filter returns only matching listings"
  - "AC-15: Empty search query returns all active listings sorted by composite quality score"
blocked_by: [CS-WORK-007]
blocks: []
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
  spec_sections: "SI §7, D&L §5"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-008: Full-text search infrastructure

## Context

PostgreSQL full-text search via `tsvector` + `pg_trgm`. Trigger-based search vector maintenance on listing name/headline/bio/region. GIN index for tsvector, GiST trigram index for fuzzy name matching. Search ranking formula combines `ts_rank_cd` with quality score boost and paid boost (imported from CR `TIER_LIMITS` via P4). Synonym expansion table for query-time term widening. All search is SSR (SI §7).

## Deliverables

- [ ] SQL migration: `pg_trgm` extension, search vector trigger, GIN index, GiST trigram index
- [ ] `src/lib/search/ranking.ts` — `buildSearchQuery()` with ts_rank_cd * quality/paid boost formula
- [ ] `src/lib/search/synonyms.ts` — Synonym expansion lookup
- [ ] Tests for all 5 AC (integration tests against local Supabase)

## References

- `3-requirements/slices/slice-01-data-model.md` §3 Full-Text Search
- `3-requirements/interfaces/shared-infrastructure.md` §7
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TIER_LIMITS ranking boost)
