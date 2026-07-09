---
id: CS-WORK-095
title: Notification management routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.notifications.list returns cross-account paginated notifications with accountId/type/dismissed filters"
    test_type: integration
  - id: AC-2
    description: "admin.notifications.dismiss soft-deletes any notification by ID"
    test_type: integration
  - id: AC-3
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-095: Notification management routes

## Deliverables

- [x] `src/server/routers/admin/notifications.ts` — new router with list + dismiss
- [x] `src/server/routers/admin/index.ts` — wired notifications sub-router
- [x] `src/server/routers/__tests__/admin-notifications.integration.test.ts` — 6 integration tests
