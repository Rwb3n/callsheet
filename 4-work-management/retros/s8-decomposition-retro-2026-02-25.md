---
triaged: true
status: complete
---

# Retro: S8 Decomposition

**Date:** 2026-02-25
**Scope:** Decomposition of S8 (Commercial & Revenue) into work items for CH-CS-010

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | S8 has only 81 AC (vs S7's 101) despite covering 10 spec sections. The slice is computation-heavy but route-light — only 4 tRPC routes, all queries, zero mutations. All state changes flow through 8 event consumers. This made grouping clean: domain logic modules (§1–§9) are independent, consumers (§10) converge at the end. |
| **What went well?** | Type alignment checks were fast — direct Grep/Read confirmed `check_quality_improvement` and `win_back_evaluation` already in `DeferredActionParamsMap`, and 2 of 8 consumers already registered in `EVENT_CONSUMER_MATRIX`. The S7 decomposition pattern transferred directly; no format changes needed. AC numbering (1–81 contiguous) verified with zero gaps in under 30 seconds. |
| **Could have gone better?** | The router plan's file tree places code in `src/server/commercial/` and `src/server/consumers/commercial/` but existing S4 commercial code lives in `src/domains/commercial/`. The decomposition deliverables follow the existing convention (`src/domains/commercial/`), not the spec's tree — this mismatch should be flagged for the implementer. |
| **Keep doing** | Single foundation work item (schema + const) blocking everything else. 5-way parallel after foundation. Final convergence item (consumers) that imports from all domain logic modules. This pattern works for every slice. |
| **Stop doing** | N/A — decomposition workflow is stable. |
| **Start doing** | Verify spec file tree against existing codebase conventions during decomposition, not just during implementation. Would have caught the `src/server/commercial/` vs `src/domains/commercial/` mismatch earlier. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | 5-way parallel after foundation + convergence consumer item | Feature | Pattern works. 066 → 5 parallel (067, 068, 070, 071, 072) + 1 sequential (069 after 068) → 073 convergence. |
| 2 | Spec file tree (`src/server/commercial/`) diverges from codebase convention (`src/domains/commercial/`) | Refactor | S8 router plan §1 prescribes `src/server/commercial/*.ts` and `src/server/consumers/commercial/*.ts`. Existing code is `src/domains/commercial/`. Deliverables follow existing convention but spec is misleading. |
| 3 | AC verification automated (grep + sort + count) | Feature | 81/81 verified in one pass. No manual counting. |
| 4 | Existing `PRICING` in `src/domains/commercial/subscription/pricing.ts` may overlap with new `pricing-config.ts` | Upgrade | CS-WORK-066 creates `src/domains/commercial/pricing-config.ts`. Implementer should check existing pricing.ts and consolidate rather than duplicate. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Add note to CS-WORK-066 Context: check existing `src/domains/commercial/subscription/pricing.ts` and consolidate | next | done | Engineer | CS-WORK-066 Context updated: "An existing `src/domains/commercial/subscription/pricing.ts` already exists (from S4). Consolidate." |
| 2 | Verify spec file tree convention mismatch is documented for S9 decomposition | later | done | Engineer | Added to MEMORY.md Decomposition Lessons. S9 router plan pre-checked — `src/server/intelligence/` confirmed as same mismatch pattern. |
