# Retro: Tech Debt — "Next" Queue Clear

**Date:** 2026-02-22
**Scope:** All 8 active items in IMPLEMENTATION-TRACKER.md "Next" tech debt queue, cleared in a single session after S0+S1 code completion.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | AC-24 (`validateUpload`) was more broken than the tracker suggested. The function never checked actual data size at all — `maxSizeBytes > MAX_UPLOAD_SIZE_BYTES` compared the *limit* to itself. The "size validation" test only passed because it fell through to a content-type rejection. A real >10MB upload would have sailed through unchecked at the application layer. |
| **What went well?** | All 8 items were genuinely independent — no cascading failures, no hidden coupling. The `satisfies` narrowing on `EVENT_CONSUMER_MATRIX` was the only cross-cutting surprise and was caught by `tsc` immediately. Total session: ~15 minutes of edits, one type-check cycle, one test fix, all green (93 unit + 85 integration). |
| **Could have gone better?** | The `createTestMatrix` helper initially broke AC-05 because it builds from the production matrix (which has 9 populated entries), but `bus.test.ts` needs an empty base. Should have recognised that bus mechanic tests and integration tests need different matrix construction strategies. |
| **Keep doing** | Running `tsc --noEmit` before tests. It caught both the `validateUpload` signature change (7 call sites) and the `satisfies` narrowing issue before any test ran. Type-first, test-second is the right order. |
| **Stop doing** | Accumulating tech debt items past 5 in the "Next" queue. Several of these (CH-CS-003 scope, Supabase docs) were 2-minute fixes that sat for 3 days. The cost of context-switching to fix them was lower than the cost of re-reading them each session. |
| **Start doing** | Adding a `DATABASE_URL` to a `.env.test` or `vitest.config.integration.ts` `env` block so integration tests don't require manual env var injection. Every session re-discovers this. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | AC-24 `validateUpload` never checked actual buffer size | Bug | Silent pass on oversized uploads. Fixed: 3-arg signature, `data.byteLength` check, 10MB+1 test. |
| 2 | R2 orphan on upload tx rollback | Bug | R2 object written, DB tx fails, no cleanup. Fixed: try/catch + `storage.delete(key)`. |
| 3 | `SubscriptionTierChangedEvent.newTier` was `string` | Bug | Unsafe `as SubscriptionTier` cast in handler. Fixed: narrowed payload type, removed cast. |
| 4 | `buildRankExpression` extraction | Refactor | 12-line SQL blob inlined in 50-line function. Extracted to named, exported function. |
| 5 | `createTestMatrix` + `EMPTY_MATRIX` helper | Refactor | 3 test files with duplicated matrix construction. Now shared in `test-helpers.ts`. |
| 6 | Pagination edge case test gap | Upgrade | Missing last-page and beyond-total tests. Added 2 integration tests. |
| 7 | CH-CS-003 scope description was wrong | Bug | Chapter said "S1 seed data" but taxonomy seed was in CH-CS-002. Fixed description. |
| 8 | No dev setup runbook | Feature request | Each session re-discovered Docker PATH and Supabase start. Created `scripts/dev-setup.sh`. |
| 9 | `createTestMatrix` broke bus.test.ts AC-05 | Feature | Two matrix strategies: `EMPTY_MATRIX` for bus mechanics, `createTestMatrix` for integration. Both exported, usage is correct. Protect this distinction. |
| 10 | Type-first workflow caught 2 issues before tests ran | Feature | `tsc --noEmit` before `vitest run`. Keep doing this. |
| 11 | `DATABASE_URL` not in test config | Feature request | Manual env var injection every session. Should be in `vitest.config.integration.ts` or `.env.test`. |
| 12 | Tech debt "Next" queue grew to 8 items over 3 days | Upgrade | Fix trivial items immediately rather than queuing. Reserve "Next" for items requiring investigation. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Add `DATABASE_URL` to integration test config | next | platform | `npm run test:integration` works without manual `DATABASE_URL=...` prefix. Either `.env.test` loaded by vitest or `env` block in `vitest.config.integration.ts`. |
| 2 | Cap "Next" tech debt at 5 items | now | principal | Any item added to "Next" that pushes count above 5 must be fixed immediately or moved to "Later" with justification. Enforced by session discipline, not tooling. |
| 3 | Verify `InMemoryObjectStorageService` size check covers `ReadableStream` | later | platform | Current fix only checks `Buffer.byteLength`. `ReadableStream` data returns `0` — fine for tests (all use `Buffer`) but production R2 transport must enforce size independently. Document this gap or add stream byte counting. |
