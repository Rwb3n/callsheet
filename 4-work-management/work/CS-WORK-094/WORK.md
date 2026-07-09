---
id: CS-WORK-094
title: Decision log search route
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "admin.decisions.search returns paginated decision logs filterable by domain, decisionType, date range, listingId, accountId"
    test_type: integration
  - id: AC-2
    description: "admin.decisions.search supports cursor-based pagination with createdAt cursor"
    test_type: integration
  - id: AC-3
    description: "admin.decisions.search returns full row including inputs/output JSONB"
    test_type: integration
  - id: AC-4
    description: "Route requires adminProcedure"
    test_type: integration
---

# CS-WORK-094: Decision log search route

## Deliverables

- [x] `src/server/routers/admin/decisions.ts` — new router with search route
- [x] `src/server/routers/admin/index.ts` — wired decisions sub-router
- [x] `src/server/routers/__tests__/admin-decisions.integration.test.ts` — 5 integration tests
