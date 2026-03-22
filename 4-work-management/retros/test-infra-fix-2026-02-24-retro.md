---
triaged: true
status: complete
---

# Retro: Test infrastructure fix — pg_trgm + search vector trigger

**Date:** 2026-02-24
**Scope:** Investigation and fix of 13 pre-existing integration test failures across 3 test files (search, import pipeline, CRUD routes). Triggered by retro action #3 from CS-WORK-048.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The 13 failures had been present since the DB was last reset and nobody investigated — they were treated as "known failures" rather than a bug. The root cause was trivial: `drizzle-kit push` silently ignores custom SQL in migration files (extensions, triggers, functions, custom indexes). The migration `0001` correctly defined everything. The tooling gap between `push` and `migrate` was the entire problem. |
| **What went well?** | Diagnosis was fast — a single psql check for `pg_extension` and `pg_trigger` confirmed both hypotheses in under 30 seconds. The fix was equally fast: 4 SQL statements applied directly, then wrapped in an idempotent script for permanence. |
| **Could have gone better?** | This should have been caught during S1 implementation when the search tests were first written. The fact that 13 tests were failing without anyone flagging it means either (a) the full integration suite wasn't being run regularly, or (b) the failures were dismissed as environment issues. Both are process gaps. |
| **Keep doing** | Running the full integration suite (`npx vitest run --config vitest.config.integration.ts`) after every work item, not just the subset of tests related to the current work. This session's fix was only possible because the full suite was run during CS-WORK-048. |
| **Stop doing** | Accepting "pre-existing failures" as a category. Every failing test is either a bug to fix or a test to delete. There is no stable middle ground. |
| **Start doing** | Including `db:custom-sql` in CI setup. The local fix is wired into `db:reset`, but if CI uses a different DB init path, the same gap will reappear. Also: add a startup self-check that verifies `pg_trgm` is available, similar to the existing `EVENT_CONSUMER_MATRIX` boot check. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | `drizzle-kit push` silently drops custom SQL (extensions, triggers, functions) from migrations | **Bug** | The migration file `0001` correctly defines `CREATE EXTENSION pg_trgm`, `CREATE FUNCTION`, `CREATE TRIGGER`, and two custom indexes. `drizzle-kit push` only syncs schema (tables, columns, enums, standard indexes) — everything else is silently ignored. No warning is emitted. |
| 2 | 13 test failures accepted as "pre-existing" without investigation | **Bug** | Process failure. Memory file documented "13 pre-existing search failures" as a known state. The IMPLEMENTATION-TRACKER didn't flag them as a blocker or tech debt item. This normalised broken tests. |
| 3 | `db:custom-sql` script created and wired into `db:reset` | **Feature** | `src/db/seed/custom-sql.ts` applies extensions, triggers, and indexes idempotently. `package.json` `db:reset` now runs `drizzle-kit push && db:custom-sql && db:seed`. Prevents regression on local DB reset. |
| 4 | Fast diagnosis via direct psql verification | **Feature** | Checking `pg_extension` and `pg_trigger` tables directly, rather than guessing from test output, resolved the ambiguity in under 30 seconds. |
| 5 | CI may not run `db:custom-sql` | **Feature request** | The local fix is wired into `db:reset`, but CI setup scripts may have a separate DB init path that doesn't call `db:reset`. Need to verify and wire. |
| 6 | No runtime self-check for required extensions | **Feature request** | The event bus has `EVENT_CONSUMER_MATRIX` boot check. No equivalent exists for database prerequisites. A startup check that verifies `pg_trgm` is installed would fail fast instead of producing confusing runtime errors. |
| 7 | Gap between `drizzle-kit push` and `drizzle-kit migrate` not documented | **Refactor** | Memory and CLAUDE.md describe `drizzle-kit push` as the local DB setup tool, but don't document its limitation (no custom SQL). This caused the bug to persist across sessions. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Verify CI DB init calls `db:custom-sql` | next | engineer | CI workflow file includes `npm run db:custom-sql` after schema push. Integration tests in CI pass at 454/454. |
| 2 | Document `drizzle-kit push` limitation in CLAUDE.md or memory | now | engineer | Memory file states: "`drizzle-kit push` does not execute custom SQL (extensions, triggers, functions) — always run `db:custom-sql` after push." |
| 3 | Add runtime self-check for `pg_trgm` at app startup | later | engineer | App startup queries `SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`. Missing extension throws with actionable error message ("run `npm run db:custom-sql`"). |
| 4 | Adopt zero-tolerance policy for failing tests in memory/tracker | now | engineer | Memory file includes: "Every failing test is either a bug to fix or a test to delete. Do not record 'pre-existing failures' without an action item." |
