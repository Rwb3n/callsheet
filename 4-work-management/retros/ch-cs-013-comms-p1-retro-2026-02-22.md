# Retro: Communications Phase 1 (CH-CS-013)

**Date:** 2026-02-22
**Scope:** CS-WORK-025 through CS-WORK-028. Correspondence log schema, LoggingEmailService decorator, Resend webhook, bounce handling, DSAR queries. 4 work items, 17 AC, 36 new tests (17 unit + 19 integration). Single session.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The plan's stress test (25 scenarios) front-loaded almost every integration issue. Only two surprises during implementation: (1) `NodePgDatabase` generic parameter mismatch — bare `NodePgDatabase` defaults to `Record<string, never>` which rejects `getTestDb()`'s `Record<string, unknown>`. The project already had `Db = NodePgDatabase<any>` in `src/db/types.ts` but the new modules used the raw import. (2) `decision_logs.accountId` is `uuid` type in the DB schema, so test data must use valid UUIDs, not arbitrary strings like `"user-1"`. Both were caught immediately by TypeScript/Postgres, not at runtime. |
| **What went well?** | (1) The stress-tested plan eliminated design ambiguity — DD-1 through DD-5 resolved every architectural question before a line of code. Zero mid-implementation direction changes. (2) Decorator pattern for `LoggingEmailService` preserved full backward compatibility — 228 pre-existing tests passed without modification (only 1 test needed `threadId` added to a `setResponse()` call). (3) Sequential dependency chain (025→026→027→028) was the correct decomposition — each work item had clear inputs and produced testable outputs for the next. (4) Integration tests caught real FK constraint issues that unit tests couldn't (suppressed_emails FK, correspondence_log accountId FK). |
| **Could have gone better?** | (1) Should have checked `Db` type alias usage pattern before writing the first module. Three files needed fixing after the first typecheck. The `Db` type is documented in MEMORY.md's implementation patterns but was added after this session started — the pattern should be checked proactively when writing any module that takes a DB parameter. (2) The AC-16 bounce threshold test used a fabricated `correspondenceLogId` that didn't exist in the DB, triggering a FK constraint violation on `suppressed_emails`. Test data must respect FK constraints even when the ID seems irrelevant to the test's purpose. (3) `anonymiseCorrespondence` initially used a fragile raw SQL count query before switching to `.returning()` — should have used `.returning()` from the start (established Drizzle pattern). |
| **Keep doing** | (1) Stress testing plans before implementation — 25 scenarios surfaced 7 HIGH findings that would have been mid-implementation blockers. (2) Running full test suite after every work item to catch cascading regressions early. (3) Decorator/wrapper pattern for cross-cutting concerns — preserves existing interface, opt-in adoption, no breaking changes. (4) Two-level test strategy: unit tests for logic (hash determinism, suppression flow), integration tests for DB interactions (FK constraints, status transitions). |
| **Stop doing** | (1) Using bare `NodePgDatabase` import when `Db` type alias exists. Should be reflexive. (2) Fabricating UUIDs in tests without checking FK constraints on the target table. |
| **Start doing** | (1) Add `Db` type usage to a pre-implementation checklist: any function that accepts a database connection should use `Db` from `@/db/types`, not `NodePgDatabase`. (2) When writing integration tests that call functions with FK-constrained params, always use IDs returned from actual insert operations, never fabricated strings. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Stress-tested plan eliminated design ambiguity | Feature | 25-scenario stress test on decomposition plan. Produced 5 design decisions (DD-1 through DD-5) and resolved all 22 findings. Zero mid-implementation direction changes. |
| 2 | Decorator pattern preserved backward compatibility | Feature | `LoggingEmailService` wraps `EmailService` — 228 existing tests unchanged. Opt-in adoption. Same pattern viable for rate limiting, audit logging. |
| 3 | Sequential dependency chain was correct decomposition | Feature | 025→026→027→028 produced testable outputs at each stage. No circular dependencies, no rework. |
| 4 | Integration tests caught FK constraint issues | Feature | Unit tests missed FK violations on `suppressed_emails.correspondenceLogId` and `correspondence_log.accountId`. Integration tests caught both immediately. |
| 5 | `Db` type alias not used in new modules | Bug | Three files imported `NodePgDatabase` directly instead of `Db` from `@/db/types`. TypeScript caught it but it shouldn't have happened — the alias exists for exactly this reason. |
| 6 | Fabricated UUID in test violated FK constraint | Bug | AC-16 test used `"00000000-0000-4000-8000-000000000099"` as `correspondenceLogId` — doesn't exist in `correspondence_log`. Should have used a real inserted row's ID. |
| 7 | `anonymiseCorrespondence` initially used raw SQL count | Refactor | First version used `db.execute(sql\`SELECT count(*)\`)` then parsed the string result. Replaced with `.returning({ id })` + `.length` — standard Drizzle pattern. |
| 8 | No `retry_bounced_email` action handler registered | Feature request | The deferred action type is in `DeferredActionParamsMap` and the scheduler can schedule it, but no handler is registered to execute it. The handler needs `LoggingEmailService` as a dependency — should be wired at app bootstrap. |
| 9 | Webhook route not wired to bounce handler in production | Feature request | `route.ts` calls `handleResendEvent(db, event)` without passing an `onBounce` callback. The bounce handler exists but the production wiring needs the full dependency graph (`DecisionLogDb`, `SchedulerDb`, `NotificationDb`). Should be wired when service abstraction layer is extended. |
| 10 | No `providerMessageId` index on `correspondence_log` | Upgrade | Webhook handler queries `WHERE provider_message_id = ?`. At V1 volume (~3K emails/month) a sequential scan is fine. At scale, this needs a btree index. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Wire `onBounce` callback in production webhook route | next | Platform | `route.ts` passes `handleBounce(deps, params)` as the `onBounce` callback to `handleResendEvent`. Requires service container / dependency resolution at the route level. Verify: hard bounce webhook → `suppressed_emails` row + decision log. |
| 2 | Register `retry_bounced_email` action handler | next | Platform | Handler in `src/lib/email/retry-handler.ts` reads `originalParams` from deferred action, re-sends via `LoggingEmailService`. If retry also bounces → treat as hard bounce (call `handleBounce` with `bounceType: "hard"`). Verify: scheduled retry action → email re-sent OR suppressed. |
| 3 | Add `providerMessageId` index to `correspondence_log` | later | Platform | `CREATE INDEX correspondence_log_provider_msg_idx ON correspondence_log (provider_message_id)`. Trigger: email volume >10K/month or webhook handler p95 >50ms. |
| 4 | Enforce `Db` type alias in new modules | now | Platform | Update `output-style-engineer.md` §2 with: "Use `Db` from `@/db/types` for database parameters, not `NodePgDatabase`." Already in MEMORY.md implementation patterns. Verify: grep for `NodePgDatabase` in `src/lib/` returns only `src/db/types.ts`. |
