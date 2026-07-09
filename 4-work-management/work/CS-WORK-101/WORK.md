---
id: CS-WORK-101
title: CS-E2 audit critical + high fixes
chapter: CH-CS-016
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: medium
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Bearer auth wired to HTTP: extractSession() checks Authorization header, calls validateApiKey(), constructs AuthSession. Integration test verifies Bearer token → admin route succeeds."
    test_type: integration
  - id: AC-2
    description: "Auth emails use production email service: auth-instance.ts accepts emailService from services factory, not hardcoded InMemoryEmailService."
    test_type: integration
  - id: AC-3
    description: "retryStep bounds check: throws PRECONDITION_FAILED if currentStep >= steps.length"
    test_type: integration
  - id: AC-4
    description: "Scopes field documented as V2-reserved: removed from create input, scopes always empty array on insert. Scope enforcement deferred."
    test_type: unit
  - id: AC-5
    description: "lastUsedAt update is awaited (no fire-and-forget)"
    test_type: integration
  - id: AC-6
    description: "scheduler.trigger, scheduler.cancel, notifications.dismiss return { success: true }"
    test_type: integration
  - id: AC-7
    description: "api_keys migration generated: drizzle-kit generate produces migration including api_keys table"
    test_type: manual
---

# CS-WORK-101: CS-E2 audit critical + high fixes

**Source:** CS-E2 audit (2026-03-30). Round 1 identified 13 findings across security, integration boundary, and deployment prerequisite audits. Round 2 verified against code, confirmed 7 critical+high items.

## Problem Summary

1. **Bearer auth not wired** — `validateApiKey()` exists but `extractSession()` in the tRPC HTTP handler only checks Better Auth sessions. API keys cannot authenticate.
2. **Auth emails hardcoded to InMemory** — `auth-instance.ts` always uses `InMemoryEmailService`. Email verification and password reset don't send in production.
3. **retryStep unguarded array access** — `row.steps[row.currentStep]` without bounds check → TypeError if data is corrupted.
4. **Scopes stored but never enforced** — false sense of security. Remove from input for V1.
5. **lastUsedAt fire-and-forget** — silent error swallowing, unreliable audit trail.
6. **3 mutations return undefined** — scheduler.trigger, scheduler.cancel, notifications.dismiss.
7. **api_keys not in migration set** — exists via `drizzle-kit push` but not in `drizzle/` migrations.

## Deliverables

- [x] `src/app/api/trpc/[trpc]/route.ts` — Bearer token extraction in `extractSession()`
- [x] `src/lib/auth-instance.ts` — conditional Resend/InMemory based on RESEND_API_KEY
- [x] `src/server/routers/admin/flows.ts` — bounds check in retryStep
- [x] `src/server/routers/admin/api-keys.ts` — scopes removed from create input
- [x] `src/lib/api-keys/index.ts` — lastUsedAt update awaited
- [x] `src/server/routers/admin/scheduler.ts` — return { success: true } for trigger + cancel
- [x] `src/server/routers/admin/notifications.ts` — return { success: true } for dismiss
- [x] `drizzle/0017_funny_human_fly.sql` — migration for api_keys table + enum additions
