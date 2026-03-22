---
triaged: true
status: complete
---

# Retro: Tech Debt — "Watching" Items Cleanup

**Date:** 2026-02-22
**Scope:** 3 "New patterns worth watching" items identified during the tech debt audit session. Items 1–2 (test infrastructure duplication) and item 3 (resolveSectorId extra query). Cross-session — extraction started in a previous session, completed and verified in this one.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The `createSchedulerDb` and `emptyConsumerMatrix` extractions were already complete when this session started — the previous session hit context limit mid-work but had finished both extractions and updated all import sites. The only incomplete work was the `resolveSectorId` removal. Cross-session continuity via file state (not memory) worked perfectly. |
| **What went well?** | The `resolveSectorId` removal was clean: one input schema field change, one handler line deletion, one helper function deletion, one unused import removal, 9 test call-site updates. Zero ambiguity. All 294 tests passed on first run after edits. The `test-fixtures.ts` extraction follows the right pattern — functions take `db` as first arg, no module-level state, exports are granular. |
| **Could have gone better?** | The previous session's fixture extraction left behind missing imports in `bounce.integration.test.ts` and `phase-5-article14.integration.test.ts` — `decisionLogs` and `deferredActions` were referenced but not imported. These were pre-existing type errors that `tsc` would have caught if run at the end of that session. Suggests the previous session hit context limit before the final type-check gate. |
| **Keep doing** | Running `tsc --noEmit` before tests after any refactoring session. It caught the missing imports immediately, before integration tests could surface them as runtime failures. |
| **Stop doing** | Ending sessions without a final type-check pass. The missing imports were a 2-line fix but could have caused confusion in a future session that didn't have the extraction context. |
| **Start doing** | When a session hits context limit mid-refactor, the resuming session should run `tsc --noEmit` as its first action before reading any code. This catches orphaned references from incomplete work. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | `createSchedulerDb` extracted to `test-fixtures.ts` (4 copies → 1) | Refactor | Identical `SchedulerDb` adapter was hand-written in freelancer-creation, company-creation, bounce, and phase-5-article14 tests. Now a single export. All 4 test files import from `@/db/test-fixtures`. |
| 2 | `emptyConsumerMatrix` extracted to `test-fixtures.ts` (2 copies → 1) | Refactor | 25-key empty matrix object was copy-pasted in both onboarding test files. Now a single export. AC-08 test uses `...emptyConsumerMatrix` spread with its custom `listing_created` entry — correct pattern. |
| 3 | `resolveSectorId` query eliminated | Refactor | Extra DB round-trip to resolve `sectorId` from `primaryServiceAreaId`. Client now sends `primarySectorId` directly (matching `taxonomyTagInput` pattern). `resolveSectorId` helper and `taxonomyServiceAreas` import deleted. |
| 4 | Missing imports after fixture extraction (`decisionLogs`, `deferredActions`) | Bug | Previous session extracted adapters but removed schema imports that were still used directly in test assertions. `tsc` would have caught this — session ended before final type-check. |
| 5 | `test-fixtures.ts` as canonical shared test infrastructure | Feature | Single file for session factories, user seeding, listing creation, taxonomy seeding, DB adapter factories, and empty consumer matrix. All integration tests import from here. Protect this pattern. |
| 6 | Cross-session file-based continuity | Feature | Previous session wrote all extractions to disk before hitting context limit. This session resumed by reading file state, not relying on conversation memory. The pattern works. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Add `tsc --noEmit` as first action when resuming a mid-refactor session | now | principal | Session discipline — any `/resume` or context-limit continuation runs type check before reading code. No tooling change needed. |
| 2 | Add `createDecisionLogDb` to the "always import from test-fixtures" pattern check | now | platform | Next integration test file that needs a `DecisionLogDb` imports from `@/db/test-fixtures`, not inline. Currently 3 files use it (bounce, phase-5, test-fixtures). No new inline copies. |
| 3 | Consider `NotificationDb` adapter extraction | later | platform | `bounce.integration.test.ts` has an inline `NotificationDb` stub. If a second test file needs one, extract to `test-fixtures.ts`. Trigger: 2nd usage. |
