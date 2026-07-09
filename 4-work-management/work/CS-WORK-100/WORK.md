---
id: CS-WORK-100
title: API key admin routes
chapter: CH-CS-016
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: [CS-WORK-099]
acceptance_criteria:
  - id: AC-1
    description: "admin.apiKeys.create generates a key, stores hash, returns the plaintext key (shown once)"
    test_type: integration
  - id: AC-2
    description: "admin.apiKeys.list returns all keys for viewing (never shows full key, shows prefix)"
    test_type: integration
  - id: AC-3
    description: "admin.apiKeys.revoke sets revokedAt on a key"
    test_type: integration
  - id: AC-4
    description: "All routes require adminProcedure"
    test_type: integration
---

# CS-WORK-100: API key admin routes

## Deliverables

- [x] `src/server/routers/admin/api-keys.ts` — new router with create + list + revoke
- [x] `src/server/routers/admin/index.ts` — wired apiKeys sub-router
- [x] `src/server/routers/__tests__/admin-api-keys.integration.test.ts` — 9 integration tests
