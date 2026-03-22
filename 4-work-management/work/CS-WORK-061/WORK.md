---
template: work_item
id: CS-WORK-061
title: "Orchestrated flow and failed event admin"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-009
arc: buyer-and-operations
epoch: CS-E1
closed: 2026-02-25
priority: high
effort: large
traces_to:
  - REQ-CS-OPS-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/06-orchestrated-flows.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/07-failed-events.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/decisions/sq-2.md
acceptance_criteria:
  - "AC-6.1: Flow list filtered by flowType and status, sorted by deadline/started_at/updated_at, cursor-based pagination"
  - "AC-6.2: Erasure flows display 30-day deadline countdown (green >7d, amber 3-7d, red <3d). Closure flows: no deadline."
  - "AC-6.3: Flow detail displays each step with status, attempt count, completion time, error message"
  - "AC-6.4: Retry increments attempt, sets step to in_progress, resumes execution. Decision log created."
  - "AC-6.5: Skip on skippable step records skipReason and skippedBy, advances flow. Decision log created."
  - "AC-6.6: Skip on non-skippable step rejected with FORBIDDEN. Client UI disables skip button."
  - "AC-6.7: Skip requires non-empty reason; empty rejected with BAD_REQUEST"
  - "AC-6.8: Escalate sets flow to escalated, records reason and timestamp, creates notification"
  - "AC-6.9: orchestrated_flows.updatedAt updated on every step state change. Null for pre-migration rows."
  - "AC-6.10: All recovery actions require adminProcedure and produce decision_logs entries"
  - "AC-7.1: Errors grouped by consumerId, showing error count and latest error detail per group"
  - "AC-7.2: Filterable by date range, consumerId, resolved status; default shows unresolved only"
  - "AC-7.3: Resolve marks error as resolved; hidden from default view"
  - "AC-7.4: Retry re-emits stored payload through event bus; original error marked resolved"
  - "AC-7.5: Re-emission triggers all consumers (not directed); P2 idempotency prevents duplication"
  - "AC-7.6: totalUnresolved count returned for health monitoring"
blocked_by: [CS-WORK-057]
blocks: [CS-WORK-062]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S7
  spec_sections: "S7 §6, §7, SI §3.5 (skip constraint matrix), SQ-2 R3 (failed events), R11 (skip constraints)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-061: Orchestrated flow and failed event admin

## Context

Two closely related admin views over existing S0 infrastructure tables. Orchestrated flow admin provides step-level visibility into erasure/closure flows with recovery actions (retry/skip/escalate). Skip constraint matrix enforcement: server-side FORBIDDEN for non-skippable steps (SI §3.5), skip requires non-empty reason + admin `accountId`. Failed event admin groups `event_consumer_errors` by `consumerId`, supports resolve (mark resolved) and retry (re-emit stored payload through event bus). Both views depend on schema amendments from CS-WORK-057: `orchestrated_flows.updatedAt` and `event_consumer_errors.resolved`/`resolvedAt`.

The `orchestrated_flows` and `event_consumer_errors` tables already exist in `src/db/schema/shared.ts`. This work item builds admin routes over them with recovery actions — it does not modify the flow engine or event bus core.

**Type alignment notes:**
- `FlowDb` interface at `src/lib/flows` — check if `retryStep`, `skipStep`, `escalateFlow` methods exist or need to be added.
- `event_consumer_errors` `resolved`/`resolvedAt` columns added by CS-WORK-057 migration. Partial index `WHERE resolved = false` for default unresolved view.

## Deliverables

- [ ] `src/server/routers/admin-flows.ts` — `createAdminFlowsRouter(deps)` with `list`, `getDetail`, `retryStep`, `skipStep`, `escalateFlow`
- [ ] `src/server/routers/__tests__/admin-flows.integration.test.ts` — Integration tests (AC-6.1 through AC-6.10)
- [ ] `src/server/routers/admin-events.ts` — `createAdminEventsRouter(deps)` with `listGrouped`, `resolve`, `retry`, `getUnresolvedCount`
- [ ] `src/server/routers/__tests__/admin-events.integration.test.ts` — Integration tests (AC-7.1 through AC-7.6)
- [ ] `src/lib/flows/index.ts` — Add `retryStep`, `skipStep`, `escalateFlow` if not present (extend FlowDb interface)
- [ ] `src/server/root.ts` — Wire admin flow and event routers under `admin.flows` and `admin.events` namespaces

## References

- `3-requirements/slices/slice-07-operations/06-orchestrated-flows.md` §6
- `3-requirements/slices/slice-07-operations/07-failed-events.md` §7
- `3-requirements/interfaces/shared-infrastructure.md` §3.5 (skip constraint matrix)
- `3-requirements/decisions/sq-2.md` R3 (failed event admin), R11 (skip constraints)
