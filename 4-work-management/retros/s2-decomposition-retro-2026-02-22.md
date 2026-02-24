# Retro: S2 Decomposition

**Date:** 2026-02-22
**Scope:** Decomposition of S2 (Onboarding) into work items across CH-CS-003 (Seed Pipeline, 9 AC) and CH-CS-004 (Onboarding, 41 AC). 11 work items total (CS-WORK-013 through CS-WORK-023).

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The chapter split (CH-CS-003 vs CH-CS-004) required explicit deliberation before the skill could run. The decomposer skill assumes one slice → one chapter, but S2 legitimately spans two chapters with different arcs. This isn't a bug — it's an intentional design from the S1 era — but the skill doesn't account for it. The split decision (which ACs go where) had to be made by the orchestrator before dispatching agents. |
| **What went well?** | Parallel agent dispatch worked cleanly. Both agents (CH-CS-003 and CH-CS-004) ran simultaneously, produced non-overlapping work item IDs (021-022 and 013-020+023 respectively), and maintained cross-chapter dependency symmetry (CS-WORK-022 blocks CS-WORK-023). AC count verified at 50/50 — zero gaps, zero duplicates. The pre-agreed ID reservation (013-020 for CH-CS-004, 021-022 for CH-CS-003) prevented collisions. |
| **Could have gone better?** | 1. ID sequence has a gap: CH-CS-004 uses 013-020 then jumps to 023. This is because 021-022 were reserved for CH-CS-003. Functionally harmless but aesthetically untidy — a contiguous scheme would have CH-CS-003 at the end (021-023) or CH-CS-004 renumbered. 2. The fitness-for-purpose analysis took a full read of the decomposer skill, S2 slice (1300+ lines), both chapter skeletons, both arc files, and existing work items before concluding "yes, with a chapter split." This was thorough but could have been faster if the skill documented the multi-chapter case. 3. REQ-CS-SEED trace IDs on CS-WORK-021 has 7 entries (REQ-CS-SEED-001 through 007) — the template says "one per work item" but the agent generated one per AC. Minor inconsistency. |
| **Keep doing** | Pre-decomposition fitness analysis. The question "is the tooling fit for purpose?" before blindly invoking the skill caught the chapter split issue and produced a cleaner result. Also: parallel agent dispatch with pre-agreed ID ranges. |
| **Stop doing** | Nothing to stop. |
| **Start doing** | 1. Document the multi-chapter decomposition pattern in the skill instructions so future runs don't need the same deliberation. 2. Standardise whether REQ-CS IDs are one-per-work-item or one-per-AC — pick one and enforce it. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Parallel agent dispatch with ID reservation prevented collisions | Feature | Working pattern. Both agents ran independently with pre-agreed non-overlapping ID ranges. Keep. |
| 2 | AC coverage verification (50/50 exact match) | Feature | Final count check caught zero issues. Verification step is valuable. |
| 3 | Decomposer skill doesn't document multi-chapter case | Feature request | S2 spans CH-CS-003 + CH-CS-004. The skill assumes 1 slice = 1 chapter. Need a documented pattern for the split case. |
| 4 | Non-contiguous work item IDs (013-020, skip, 023) | Refactor | Gap caused by interleaving CH-CS-003 IDs (021-022) mid-sequence. Not blocking but untidy. Could renumber or accept the convention. |
| 5 | REQ-CS trace ID cardinality inconsistency | Bug | Template says "one per work item" but CS-WORK-021 has 7 (one per AC). CS-WORK-013 through CS-WORK-020 correctly have 1 each. Inconsistent. |
| 6 | Pre-decomposition fitness analysis caught chapter split | Feature | The deliberation step before invoking the skill produced a better outcome than blind invocation would have. |
| 7 | Cross-chapter dependency symmetry maintained | Feature | CS-WORK-022 (CH-CS-003) blocks CS-WORK-023 (CH-CS-004). Both files have symmetric `blocks`/`blocked_by`. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Document multi-chapter decomposition in skill instructions | ~~next~~ **done** | orchestrator | `work-item-decomposer/skill.md` has a "Multi-Chapter Slices" bullet in Important Rules explaining: orchestrator decides AC split, parallel dispatch with pre-agreed ID ranges, cross-chapter dependency symmetry, gap acceptance. ✅ |
| 2 | Fix REQ-CS trace cardinality on CS-WORK-021 | ~~next~~ **done** | orchestrator | CS-WORK-021 `traces_to` reduced to 1 entry (`REQ-CS-SEED-001`). CS-WORK-022 also fixed (`REQ-CS-SEED-002`). Matches one-per-work-item convention. ✅ |
| 3 | Decide on non-contiguous ID policy | ~~later~~ **done** | orchestrator | Decision: (a) accept gaps. Rationale: IDs are lookup keys not indices; renumbering 13+ files has zero functional benefit; gap is self-documenting (parallel multi-chapter decomposition). Skill verification step (§6.5) amended to allow gaps from interleaving. ✅ |
