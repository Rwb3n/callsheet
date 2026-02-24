---
template: work_item
id: CS-WORK-002
title: "Deferred action scheduler"
type: feature
status: done
owner: null
created: 2026-02-16
spawned_by: null
spawned_children: []
chapter: CH-CS-001
arc: infrastructure
epoch: CS-E1
closed: 2026-02-19
priority: critical
effort: medium
traces_to:
  - REQ-CS-INFRA-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-07: Action executes within 120s of executeAt"
  - "AC-08: retry_3 retries 3x with backoff, then marks exhausted"
  - "AC-09: once marks exhausted after single failure"
  - "AC-10: alert_principal on exhaustion triggers principal notification"
  - "AC-11: Cancelled action skipped during poll"
  - "AC-12: scheduleDeferredAction returns ID; DB row has pending status"
  - "AC-48: Recurring action handler schedules successor; startup seeds if no pending exists"
  - "AC-49: notification_cleanup respects batch LIMIT 10000"
blocked_by: [CS-WORK-001]
blocks: [CS-WORK-004]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-16T00:00:00
    exited: null
artifacts:
  - src/lib/scheduler/types.ts
  - src/lib/scheduler/registry.ts
  - src/lib/scheduler/api.ts
  - src/lib/scheduler/poll.ts
  - src/lib/scheduler/index.ts
  - src/lib/scheduler/__tests__/scheduler.test.ts
  - src/db/schema/shared.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §2.1-§2.2"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-16T00:00:00
---

# CS-WORK-002: Deferred action scheduler

## Context

Cron-polled deferred action scheduler implementing SI §2.1-§2.2. DeferredActionParamsMap is a typed discriminated union (34 action types by S10). Retry policies: retry_3 (exponential backoff), once (single attempt). Recurring actions self-schedule successors.

## Deliverables

- [x] `src/lib/scheduler/types.ts` — DeferredActionParamsMap (34 types), RetryPolicy, ActionHandler, DeferredActionRow
- [x] `src/lib/scheduler/registry.ts` — ActionHandlerRegistry (type-erased branded pattern)
- [x] `src/lib/scheduler/api.ts` — scheduleDeferredAction(), cancelDeferredAction() + SchedulerDb interface
- [x] `src/lib/scheduler/poll.ts` — pollAndExecute() + PollDb interface, exponential backoff
- [x] `src/lib/scheduler/index.ts` — barrel exports
- [x] `src/db/schema/shared.ts` — deferred_actions table + 3 pgEnums (Drizzle)
- [x] `src/lib/scheduler/__tests__/scheduler.test.ts` — 15 tests (all 8 AC)

## References

- `3-requirements/slices/slice-00-infrastructure.md` §3 Deferred Action Scheduler
- `3-requirements/interfaces/shared-infrastructure.md` §2
