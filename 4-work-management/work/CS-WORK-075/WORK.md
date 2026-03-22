---
template: work_item
id: CS-WORK-075
title: "Intelligence schema, migration, and seed data"
type: feature
status: done
owner: null
created: 2026-03-06
spawned_by: null
spawned_children: []
chapter: CH-CS-011
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-06
priority: critical
effort: medium
traces_to:
  - REQ-CS-INTEL-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/00-schema.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria: []
blocked_by: []
blocks: [CS-WORK-076, CS-WORK-077, CS-WORK-078, CS-WORK-079, CS-WORK-080, CS-WORK-081, CS-WORK-082]
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-03-06T00:00:00
    exited: 2026-03-06T23:15:00
  - node: done
    entered: 2026-03-06T23:15:00
    exited: null
artifacts:
  - src/db/schema/intelligence.ts
  - src/db/schema/data-and-listings.ts
  - drizzle/0014_shocking_martin_li.sql
  - src/db/seed/custom-sql.ts
  - src/db/test-utils.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §11 (schema), 00-schema.md (6 tables, 4 enums, 2 amendments, seed data)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-075: Intelligence schema, migration, and seed data

## Context

Foundation work item for S9. Creates 6 new tables (`enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`), 4 new pgEnums (`decay_signal_type`, `decay_signal_severity`, `enrichment_check_type`, `ceremony_type`), and 2 column amendments to `quality_scores` (`calculatedBy`, `algorithmVersion`). Seeds 7 static `learning_hypotheses` rows (L1–L7) via `db:custom-sql`. No AC — schema correctness is verified by dependent work items' integration tests.

**Type alignment notes:**
- All 17 S9 `DeferredActionParamsMap` entries already exist in `src/lib/scheduler/types.ts` (lines 30–46). No additions needed.
- `SearchPerformedEvent` has `resultCount` field (not `resultIds`) — §3 analytics pipeline writes per-listing aggregates from search term data, not result listings.
- `decision_type` is `text` column in `decision_logs` — no enum extension needed for 7 new decision types.
- `buyer.ts` schema file does NOT exist yet (S9 spec references it). `search_history` is in `data-and-listings.ts`. New schema file: `intelligence.ts`.

**Migration coordination:** This work item runs `drizzle-kit generate` first. All subsequent S9 work items use the tables it creates.

## Deliverables

- [x] `src/db/schema/intelligence.ts` — 4 pgEnums, 6 tables with indexes and composite unique constraints per `00-schema.md` §2
- [x] `src/db/schema/data-and-listings.ts` — Add `calculatedBy` (text, default `"zero_init"`) and `algorithmVersion` (integer, default 1) to `qualityScores` table
- [x] `drizzle/0014_shocking_martin_li.sql` — Migration for 6 new tables + 2 column amendments
- [x] `src/db/seed/custom-sql.ts` — Add L1–L7 `learning_hypotheses` seed rows (idempotent INSERT ON CONFLICT DO NOTHING)
- [x] `src/db/test-utils.ts` — Add 6 new tables to `TRUNCATE_ALL_TABLES_SQL` and `DELETE_ALL_TABLES_SQL`

## References

- `3-requirements/slices/slice-09-entity-intelligence/00-schema.md` — Full schema spec (6 tables, 4 enums, amendments, seed data)
- `3-requirements/interfaces/shared-infrastructure.md` — SI §2.1 (deferred actions), §9.2 (decision types)
