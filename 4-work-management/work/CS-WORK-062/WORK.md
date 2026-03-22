---
template: work_item
id: CS-WORK-062
title: "Platform health monitoring"
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
effort: medium
traces_to:
  - REQ-CS-OPS-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/index.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/08-health-monitoring.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-07-operations/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-8.1: admin.health.getStatus returns 5 health signals with correct severity mapping"
  - "AC-8.2: Overall status: unhealthy if any critical, degraded if any warning, healthy otherwise"
  - "AC-8.3: Billing signal reads from single-row table; defaults to warning if no row"
  - "AC-8.4: Event errors signal: >10 unresolved in 24h = critical, >0 = warning"
  - "AC-8.5: Deferred action signal: >0 exhausted in 24h = warning"
  - "AC-8.6: Orchestrated flow signal: >0 failed/escalated = critical"
  - "AC-8.7: Paddle webhook silence: >48h since last reconciliation = warning"
  - "AC-8.8: 5 queries execute in parallel; <500ms p95"
  - "AC-8.9: Health page includes friction tracking summary (§12) as sub-section"
  - "AC-8.10: No persistent health history at V1"
blocked_by: [CS-WORK-057, CS-WORK-058, CS-WORK-059, CS-WORK-061]
blocks: []
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
  spec_sections: "S7 §8, Ops concept design §8 (platform health)"
  io_profile: "db-read"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-062: Platform health monitoring

## Context

Aggregation layer that computes overall platform health from 5 signal sources: billing reconciliation status (single-row table), event consumer errors (24h window), deferred action exhaustions (24h window), orchestrated flow failures, and Paddle webhook silence (last reconciliation timestamp). Three severity levels: healthy, degraded (any warning), unhealthy (any critical). All 5 queries execute in parallel via `Promise.all`. Health page also includes the friction tracking summary (§12) as a sub-section — AC-8.9 references CS-WORK-064's output but can stub until that item completes.

No persistent health history at V1 (AC-8.10) — this is a real-time aggregation, not a time-series store.

## Deliverables

- [x] `src/server/routers/admin/dashboard.ts` — `computeHealthSignals()` extended with 5th signal (Paddle silence), billing default fixed to warning
- [x] `src/domains/operations/health/__tests__/severity-mapping.test.ts` — 20 unit tests for all 5 severity mappings + overall aggregation (AC-8.2)
- [x] `src/server/routers/admin/health.ts` — `createAdminHealthRouter(deps)` with `getStatus`
- [x] `src/server/routers/__tests__/admin-health.integration.test.ts` — 27 integration tests (AC-8.1 through AC-8.10)
- [x] `src/app/admin/health/page.tsx` — Health status page with signal panels + friction summary stub (AC-8.9)
- [x] `src/server/routers/admin/index.ts` — Wired health router under `admin.health` namespace

## References

- `3-requirements/slices/slice-07-operations/08-health-monitoring.md` §8
- `3-requirements/interfaces/operations.md` (platform health concept)
- `2-concept-design/operations.md` §8 (health monitoring)
