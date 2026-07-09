---
id: CS-WORK-098
title: Task management routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.tasks.list returns paginated tasks filterable by domain, status, priority"
    test_type: integration
  - id: AC-2
    description: "admin.tasks.getDetail returns full task spec"
    test_type: integration
  - id: AC-3
    description: "admin.tasks.create creates a new task with all fields"
    test_type: integration
  - id: AC-4
    description: "admin.tasks.updateStatus transitions task status, sets completedAt on completion"
    test_type: integration
  - id: AC-5
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-098: Task management routes

## Deliverables

- [x] `src/server/routers/admin/tasks.ts` — new router with list + getDetail + create + updateStatus
- [x] `src/server/routers/admin/index.ts` — wired tasks sub-router
- [x] `src/server/routers/__tests__/admin-tasks.integration.test.ts` — 11 integration tests
