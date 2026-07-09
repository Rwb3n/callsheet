---
id: CS-WORK-096
title: User and account management routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.users.list returns paginated users with search (name/email) and role filter"
    test_type: integration
  - id: AC-2
    description: "admin.users.getDetail returns full user + account profile"
    test_type: integration
  - id: AC-3
    description: "admin.users.updateRole changes user role"
    test_type: integration
  - id: AC-4
    description: "Cursor-based pagination on list"
    test_type: integration
  - id: AC-5
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-096: User and account management routes

## Deliverables

- [x] `src/server/routers/admin/users.ts` — new router with list + getDetail + updateRole
- [x] `src/server/routers/admin/index.ts` — wired users sub-router
- [x] `src/server/routers/__tests__/admin-users.integration.test.ts` — 11 integration tests
