---
id: CS-WORK-097
title: Listing admin routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.listings.suspend sets lifecycleStatus to suspended with reason"
    test_type: integration
  - id: AC-2
    description: "admin.listings.unsuspend restores suspended listing to active"
    test_type: integration
  - id: AC-3
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-097: Listing admin routes

## Deliverables

- [x] `src/server/routers/admin/listings.ts` — new router with suspend + unsuspend
- [x] `src/server/routers/admin/index.ts` — wired listings sub-router
- [x] `src/server/routers/__tests__/admin-listings.integration.test.ts` — 7 integration tests
