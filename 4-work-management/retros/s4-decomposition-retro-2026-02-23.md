# Retro: S4 Decomposition

**Date:** 2026-02-23
**Scope:** Decomposition of S4 (Subscriptions) into 8 work items (CS-WORK-035 through CS-WORK-042, 50 AC). CH-CS-006.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | S4 is a genuine multi-domain slice — Ops, CR, and PP each own distinct surfaces. The decomposition needed to respect 3 domain ownership boundaries while keeping work items vertically sliced. The `PaymentService.SubscriptionTier` misalignment (S0 placeholder `starter/professional/enterprise` vs actual `free/standard/premium/partner`) was caught during codebase grep — would have been a confusing type error if not flagged in the work item. |
| **What went well?** | Clean AC partitioning — 50 AC divided into 8 groups with no overlap and no orphans. The skill's grouping heuristics worked naturally: schema cluster (035), pure-function cluster (036), data-preservation cluster (037), lifecycle cluster (038), integration cluster (039), route cluster (040), consumer cluster (041), UI cluster (042). Codebase grep before writing deliverable paths caught existing files (`tier-limits.ts`, `tier-update.ts`, `services/types.ts`) that deliverables need to extend rather than duplicate. Dependency graph has good parallelism — after 035, three work items can proceed simultaneously. |
| **Could have gone better?** | CS-WORK-035 at 11 AC is the largest work item in the decomposition. It bundles schema migration + webhook endpoint skeleton + Paddle type mapping + pending cancellation CRUD + idempotency + multi-listing customer management. These are tightly coupled (all need the same migration), but the AC breadth means the implementer must context-switch across Ops, CR, and D&L schema files in one session. Whether this holds together or needs splitting will be clear during implementation. |
| **Keep doing** | Grepping the codebase for existing stubs/paths before writing deliverables. Prior decompositions had path mismatches (WORK.md said `src/domains/platform/`, actual code landed in `src/lib/onboarding/`). This session checked `TIER_LIMITS`, `PaymentService`, and consumer locations — all deliverable paths now reference real existing files or logical new locations. |
| **Stop doing** | Nothing to stop — decomposition is mechanical and the skill instructions are well-calibrated. |
| **Start doing** | Flag known type misalignments in the Context section of WORK.md. The `SubscriptionTier` placeholder-to-real alignment is documented in CS-WORK-035's context but could have been missed. Future decompositions should grep for type definitions that downstream work items will consume and note discrepancies explicitly. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | PaymentService.SubscriptionTier alignment caught by codebase grep | Feature | Working practice: grepping existing code before writing deliverables. Prevents type mismatches at implementation time. |
| 2 | CS-WORK-035 at 11 AC may be too large | Upgrade | Functional decomposition but could strain single-session implementation. Monitor during implementation — split if it takes >2 hours or >15 tests. |
| 3 | Deliverable path accuracy improved vs S2/S3 | Feature | Skill instruction "check where prior work items placed stubs" is producing correct paths. |
| 4 | Flag type misalignments in WORK.md Context | Feature request | Not currently part of the decomposer skill checklist. Would prevent implementers discovering misalignments mid-coding. |
| 5 | Three-domain ownership split documented in chapter summary | Feature | The domain ownership table (Ops/CR/PP) in CH-CS-006 makes it clear which domain owns each surface area. |
| 6 | Arc exit criteria updated with S2/S3 completion checkmarks | Feature | Previously all unchecked. Now reflects actual state. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Monitor CS-WORK-035 size during implementation | next | implementer | If implementation exceeds 2 hours or 15 tests, split schema migration from webhook skeleton + Paddle mapping. Decision made before committing. |
| 2 | ~~Add "type alignment check" step to decomposer skill~~ | ~~later~~ | ~~skill-maintainer~~ | **DONE.** Step 1.7 added to `skill.md`: grep codebase for type definitions the slice consumes/extends, note misalignments in WORK.md Context. |
