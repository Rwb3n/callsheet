# Retro: Integration Test Performance Fix

**Date:** 2026-02-24
**Scope:** TRUNCATE → DELETE migration in `resetDb()`. Discovered during CS-WORK-047 full suite validation.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | `TRUNCATE ... CASCADE` on 37 empty tables averaged 9.5 seconds (peak 12.8s) on Supabase local Docker. The cost comes from `ACCESS EXCLUSIVE` lock acquisition on every table in the CASCADE chain, not from data deletion. `DELETE FROM` on the same empty tables: 2ms. 4750x difference. |
| **What went well?** | Once the root cause was identified, the fix was surgical — one file changed (`test-utils.ts`), zero test changes required, same table list in same FK order. The `TRUNCATE_ALL_TABLES_SQL` export stayed for E2E reset (runs once per suite). Integration suite went from 31 minutes / 5 flakes to 80 seconds / 0 flakes. |
| **Could have gone better?** | Three wrong hypotheses explored before benchmarking: (1) hookTimeout config mismatch (symptom, not cause), (2) transaction rollback (incompatible with cross-table side-effect testing), (3) timeout bump to 30s (band-aid). Should have benchmarked TRUNCATE timing first — the 9.5s mean would have pointed to the answer immediately. |
| **Keep doing** | Benchmarking before theorising. The `node -e` one-liner that measured TRUNCATE vs DELETE was the turning point — everything before it was speculation. |
| **Stop doing** | Proposing fixes without measuring. Two of three proposals (transaction rollback, timeout bump) would have been wrong or insufficient. |
| **Start doing** | Periodic integration suite timing checks. The suite degraded from fast to 31 minutes over S0–S5 as the table count grew from 0 to 37, but nobody noticed because files were run individually during development. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | `TRUNCATE CASCADE` on empty tables takes 9.5s due to lock acquisition | Bug | Postgres behaviour is correct but the choice of TRUNCATE for per-test cleanup was wrong for this workload. DELETE is the right tool when tables are empty or near-empty between tests. |
| 2 | Full suite runs 402 tests in 80s with 0 flakes after fix | Feature | 24x speedup, flake elimination. Protects CI reliability as test count grows. |
| 3 | Initial misdiagnosis: hookTimeout default (10s) vs testTimeout (15s) | Bug | Vitest's hookTimeout defaulting lower than testTimeout masked the real issue. The config asymmetry was a real problem but fixing it alone would have left ~10% flake rate. |
| 4 | `TRUNCATE_ALL_TABLES_SQL` still exported for E2E reset endpoint | Feature | E2E runs TRUNCATE once per suite (acceptable cost). Integration tests run DELETE ~400 times per suite (must be fast). Correct separation of concerns. |
| 5 | Three wrong-direction proposals before benchmarking (hookTimeout bump, transaction rollback, testTimeout 30s) | Refactor | Process issue — should benchmark before proposing. User pushback ("is that a good idea?") twice was the corrective signal. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | ~~Replace TRUNCATE with DELETE in `resetDb()`~~ | ~~now~~ | ~~infrastructure~~ | **DONE.** `src/db/test-utils.ts` updated. 402/402 pass, 80s, 0 flakes. |
| 2 | Add integration suite duration to CI output | later | infrastructure | CI step logs wall-clock time for integration suite. Regression detected if duration exceeds 120s (1.5x current). |
| 3 | Document DELETE vs TRUNCATE decision for future table additions | later | memory | Close-out checklist entry: "After adding a table to `TRUNCATE_ALL_TABLES_SQL`, also add corresponding `DELETE FROM` line to `DELETE_ALL_TABLES_SQL` in same FK order." |
