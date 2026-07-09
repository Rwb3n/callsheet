---
id: CS-WORK-113
title: Error boundaries and loading states
chapter: CH-CS-020
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
source_files:
  - 4-work-management/arcs/presentation-e2.md
extensions:
  io_profile: pure
  spec_sections: ["presentation-e2 arc §CH-CS-020"]
acceptance_criteria:
  - id: AC-1
    description: "Error boundaries at root (error.tsx, global-error.tsx, not-found.tsx), dashboard, and admin levels"
    test_type: manual
  - id: AC-2
    description: "Loading states (loading.tsx) at root, dashboard, and admin levels with skeleton UI"
    test_type: manual
  - id: AC-3
    description: "Error boundaries show error digest ID, try-again button, and navigation links"
    test_type: manual
  - id: AC-4
    description: "Global error boundary defines its own html/body tags (Next.js requirement)"
    test_type: manual
---

# CS-WORK-113: Error boundaries and loading states

## Deliverables

- [x] `src/app/global-error.tsx` — catches root layout errors
- [x] `src/app/error.tsx` — root error boundary
- [x] `src/app/not-found.tsx` — 404 page
- [x] `src/app/loading.tsx` — root loading skeleton
- [x] `src/app/dashboard/error.tsx` — dashboard error boundary
- [x] `src/app/dashboard/loading.tsx` — dashboard loading skeleton
- [x] `src/app/admin/error.tsx` — admin error boundary
- [x] `src/app/admin/loading.tsx` — admin loading skeleton
