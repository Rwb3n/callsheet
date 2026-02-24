---
template: work_item
id: CS-WORK-004
title: "Orchestrated flow engine"
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
effort: large
traces_to:
  - REQ-CS-INFRA-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-13: Steps execute sequentially: pending → in_progress → completed"
  - "AC-14: Step failure halts flow; status = failed; subsequent steps pending"
  - "AC-15: Resume from failed step; completed steps not re-executed"
  - "AC-16: Shared context passes between steps"
  - "AC-17: Context persisted to DB, restored on resume"
  - "AC-18: Non-skippable step skip attempt throws error"
  - "AC-19: Skippable step skip logs reason + admin ID"
  - "AC-20: 3 consecutive failures → auto-escalation"
blocked_by: [CS-WORK-002]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-16T00:00:00
    exited: null
artifacts:
  - src/lib/flows/types.ts
  - src/lib/flows/engine.ts
  - src/lib/flows/index.ts
  - src/lib/flows/__tests__/engine.test.ts
  - src/db/schema/shared.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §3, §13"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-16T00:00:00
---

# CS-WORK-004: Orchestrated flow engine

## Context

Generic orchestrated flow engine implementing SI §3. Step definitions are data (FlowStepDefinition[]). Context serialised as JSON with the flow record. Skip constraints enforced per SI §3.5 matrix. Auto-escalation after 3 consecutive failures. Used by S10 for erasure (6 steps) and closure (6 steps) flows.

## Deliverables

- [ ] `src/lib/flows/engine.ts` — executeOrchestratedFlow(), resumeFlow(), skipStep()
- [ ] `src/lib/flows/types.ts` — FlowStepDefinition, OrchestratedFlowProgress, FlowContext
- [ ] `src/db/schema/shared.ts` — orchestrated_flows table (Drizzle)
- [ ] `src/lib/flows/__tests__/engine.test.ts` — All 8 AC

## References

- `3-requirements/slices/slice-00-infrastructure.md` §4 Orchestrated Flow Engine
- `3-requirements/interfaces/shared-infrastructure.md` §3, §13
