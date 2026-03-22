---
triaged: true
status: complete
---

# Retro: Session recovery — context exhaustion fix (2026-02-25)

**Date:** 2026-02-25
**Scope:** Recovery from previous session context exhaustion. Fixes to churn_risk_registry unique index, decision_logs uuid/text mismatch in winback + churn-risk consumers, and invalid test UUID values.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The previous session's fixes were partially applied but not fully verified before context ran out. The `accountId` fix in `logDecision` was correct but insufficient — the `listingId` test data also contained non-hex characters (`lst`) that PostgreSQL rejects for uuid columns. The error message pointed at `listingId`, not `accountId`, meaning the previous session's accountId fix was correct but masked by the listingId issue. |
| **What went well?** | Session init caught the 6 failing integration tests immediately. The fix was straightforward: replace invalid test UUID `"00000000-0000-4000-8000-000000lst001"` with `makeUUID("lst001")`. All 801 integration tests pass after the fix. The `uniqueIndex` on `churn_risk_registry.listing_id` was already pushed by the previous session — no action needed. The `onConflictDoUpdate` in the churn-risk handler references `churnRiskRegistry.listingId` as target, which requires the unique index — good that the previous session caught this. |
| **Could have gone better?** | The previous session could have used `makeUUID()` from the start when writing the test fixtures. The `"00000000-0000-4000-8000-000000lst001"` pattern was already flagged in MEMORY.md as a known gotcha (`decision_logs.account_id is uuid()` — test admin IDs must use `makeUUID()`). The same principle applies to `listing_id`. The gotcha note is too narrow — it only mentions `account_id`, not `listing_id` or any other uuid column in `decision_logs`. |
| **Keep doing** | Running full integration test suite at session init. Using `makeUUID()` for all test IDs that touch uuid columns. Carrying forward mid-session fixes via detailed handoff notes. |
| **Stop doing** | Using hand-crafted UUID-like strings with non-hex suffixes (e.g., `lst`, `ticket`) for test IDs that will be inserted into uuid columns. |
| **Start doing** | Broadening the MEMORY.md gotcha to cover all uuid columns in `decision_logs`, not just `account_id`. When writing consumer handlers that call `logDecision`, always check whether the `listingId` field will contain a real uuid or a text ID. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Test used non-hex UUID-like string for `listingId` in email-delivery tests | Bug | `"00000000-0000-4000-8000-000000lst001"` is not a valid UUID — `lst` contains non-hex chars. PostgreSQL rejects on insert to `decision_logs.listing_id` (uuid column). Fixed by using `makeUUID("lst001")`. |
| 2 | `logDecision` accountId uuid/text mismatch (winback + churn-risk) | Bug | `decision_logs.account_id` is uuid but Better Auth user IDs are text. Previous session fixed by moving to `additionalContext`. Verified working. |
| 3 | Session init catches inherited failures quickly | Feature | Full test suite at init surfaces carried-over bugs before any new work begins. |
| 4 | MEMORY.md gotcha note too narrow — only mentions `account_id` | Upgrade | The gotcha says "`decision_logs.account_id` is uuid" but `decision_logs.listing_id` is also uuid. Test authors need to know ALL uuid columns in the table. |
| 5 | Integration test count increased (771 → 801) without MEMORY.md update | Bug | Previous session added 30 integration tests but ran out of context before updating MEMORY.md. Test counts were stale at session init. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Broaden MEMORY.md uuid gotcha to cover all `decision_logs` uuid columns | next | done | Engineer | MEMORY.md "Test Infrastructure Gotchas" section updated: notes that BOTH `decision_logs.account_id` AND `decision_logs.listing_id` are uuid columns. Test data for these fields must use `makeUUID()`. |
| 2 | Update MEMORY.md test counts to 407 unit + 801 integration = 1208 total | next | done | Engineer | MEMORY.md "Repository State" section shows current test counts. |
| 3 | Grep for remaining non-hex UUID-like strings in test files | later | done | Engineer | `grep -rn '0000-4000-8000-.*[g-z]' src/**/*.test.ts src/**/*.integration.test.ts` returns 0 results. All test UUIDs use `makeUUID()` or valid hex. Fixed 2 remaining `"000ticket001"` instances in `email-delivery.integration.test.ts`. |
