---
id: CS-WORK-093
title: Scheduler visibility routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.scheduler.list returns paginated deferred actions, filterable by status and action type"
    test_type: integration
  - id: AC-2
    description: "admin.scheduler.list supports cursor-based pagination with createdAt cursor"
    test_type: integration
  - id: AC-3
    description: "admin.scheduler.getDetail returns full row for a single deferred action by ID"
    test_type: integration
  - id: AC-4
    description: "admin.scheduler.trigger sets executeAt to now for a pending action (forces immediate execution)"
    test_type: integration
  - id: AC-5
    description: "admin.scheduler.cancel cancels a pending action with reason and cancelledBy"
    test_type: integration
  - id: AC-6
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-093: Scheduler visibility routes

## Deliverables

- [x] `src/server/routers/admin/scheduler.ts` — new router with 4 routes (list, getDetail, trigger, cancel)
- [x] `src/server/routers/admin/index.ts` — wired scheduler sub-router
- [x] `src/server/routers/__tests__/admin-scheduler.integration.test.ts` — 14 integration tests
