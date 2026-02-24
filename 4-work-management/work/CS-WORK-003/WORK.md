---
template: work_item
id: CS-WORK-003
title: "Decision logging framework"
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
priority: high
effort: small
traces_to:
  - REQ-CS-INFRA-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-40: logDecision persists; queryable by domain + type"
blocked_by: [CS-WORK-001]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-16T00:00:00
    exited: null
artifacts:
  - src/lib/decisions/logger.ts
  - src/lib/decisions/index.ts
  - src/lib/decisions/__tests__/logger.test.ts
  - src/db/schema/shared.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §9"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-16T00:00:00
---

# CS-WORK-003: Decision logging framework

## Context

Centralised decision logging per SI §9. 27 decision types (flat string enum). Logs: decisionType, domain, inputs, outputs, confidence, outcome, timestamp. Queryable by domain + type for graduation evaluation and admin dashboards.

## Deliverables

- [ ] `src/lib/decisions/logger.ts` — logDecision()
- [ ] `src/db/schema/shared.ts` — decision_logs table (Drizzle)
- [ ] `src/lib/decisions/__tests__/logger.test.ts` — AC-40

## References

- `3-requirements/slices/slice-00-infrastructure.md` §9 Decision Logging
- `3-requirements/interfaces/shared-infrastructure.md` §9
