---
id: CS-WORK-119
title: Scheduler, decisions, and user admin pages
chapter: CH-CS-022
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Scheduler page wired to admin.scheduler.list with status color dots"
    test_type: manual
  - id: AC-2
    description: "Decisions page wired to admin.decisions.search with domain/type filters"
    test_type: manual
  - id: AC-3
    description: "Users page wired to admin.users.list with role badges"
    test_type: manual
  - id: AC-4
    description: "Admin sidebar updated with Scheduler, Decisions, Users links"
    test_type: manual
  - id: AC-5
    description: "All 3 pages created with loading skeletons"
    test_type: manual
---
# CS-WORK-119: Scheduler, decisions, and user admin pages
## Deliverables
- [x] `src/app/admin/scheduler/page.tsx` — scheduler queue view
- [x] `src/app/admin/decisions/page.tsx` — decision log viewer with filters
- [x] `src/app/admin/users/page.tsx` — user list with role badges
- [x] `src/app/admin/admin-sidebar.tsx` — added 3 new nav items
