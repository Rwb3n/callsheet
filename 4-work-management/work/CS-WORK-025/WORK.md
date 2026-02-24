---
template: work_item
id: CS-WORK-025
title: "Correspondence log schema and migration"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-013
arc: infrastructure
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: small
traces_to:
  - REQ-CS-COMMS-001
source_files:
  - D:/PROJECTS/callsheet/1-investigation/communications-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-01: correspondence_log table with all columns, enums, 6 indexes, self-ref FK"
  - "AC-02: account_profiles has suppressedAt and suppressionReason columns"
  - "AC-03: suppressed_emails table with email PK, reason, FK to correspondence_log"
  - "AC-04: DeferredActionParamsMap includes retry_bounced_email"
blocked_by: []
blocks: [CS-WORK-026, CS-WORK-027, CS-WORK-028]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/db/schema/correspondence.ts
  - drizzle/0004_overrated_sunspot.sql
  - src/lib/scheduler/types.ts
  - src/db/test-utils.ts
  - src/db/index.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  spec_sections: "Investigation §3.2, §3.3, §3.6; SI §2.1"
version: "1.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-025: Correspondence log schema and migration

## Context

Adds the `correspondence_log` table (17 columns, 6 indexes, 2 enums), `suppressed_emails` table (4 columns), `suppressedAt`/`suppressionReason` on `account_profiles`, and `retry_bounced_email` to `DeferredActionParamsMap`. Migration `0004_overrated_sunspot.sql` applied. Test utilities updated.

## Deliverables

- [x] `src/db/schema/correspondence.ts` — correspondence_log + suppressed_emails tables
- [x] `drizzle/0004_overrated_sunspot.sql` — migration + self-referencing FK
- [x] `src/lib/scheduler/types.ts` — +retry_bounced_email
- [x] `src/db/test-utils.ts` — +correspondence_log, +suppressed_emails to resetDb()
- [x] `src/db/index.ts` — +correspondenceSchema import

## References

- `1-investigation/communications-infrastructure.md` §3.2, §3.3, §3.6
- `3-requirements/interfaces/shared-infrastructure.md` §2.1
- `src/db/schema/accounts.ts` (suppressedAt/suppressionReason added)
