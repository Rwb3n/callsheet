---
triaged: true
status: complete
---

# Retro: CS-WORK-080 Implementation Planning

**Date:** 2026-03-07
**Scope:** `/impl 080` planning session — plan produced but implementation deferred to next session due to context budget exhaustion at ~150K/195K tokens.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | The session hit 150K/195K (~77% context) after init + impl planning alone, leaving zero room for implementation. This is the first work item where plan + build cannot fit in a single session. The project has grown to 1,623 tests and the init ceremony alone (governing docs + tracker + chapter + health checks + action scan) consumes ~40-50K tokens. |
| **What went well?** | Plan quality is high — discovered 3 handlers already exist from 079 (partial satisfaction), identified the schema gap (commercial_state needs JSONB column), found `emitChurnRiskDetected` reusable, and produced a concrete 3-agent delegation plan with spec constants block. All of this would have been wasted work if discovered mid-implementation in a context-limited session. |
| **Could have gone better?** | The sub-agent dispatched for spec extraction was cancelled due to a parallel tool call error (Read file too large). Had to read the spec file directly in main context (~900 lines), consuming significant tokens. Should have used the sub-agent solo (not in parallel with other reads) or used a limit parameter for the tracker file. |
| **Keep doing** | Writing impl plans to disk (`plans/impl-plan.md`). This is exactly the pattern that enables cross-session handoff — next session reads plan from disk, skips all discovery work. |
| **Stop doing** | Attempting to read IMPLEMENTATION-TRACKER.md without a `limit` parameter — it's now >30K tokens and causes parallel tool call cancellation when combined with other reads. |
| **Start doing** | For large work items (effort: large, ≥12 AC), proactively split into plan-only and build-only sessions. The `/impl` skill's context budget warning at Step 5 fires too late — by then, 60%+ is consumed. Should detect early (at Step 1) that a large work item will likely exhaust context during planning, and tell the user upfront. |
| **Skill amendment?** | `/impl` skill Step 1 should add an early context budget estimate: if `effort: large` AND AC count ≥ 12, output a warning: "This is a large work item. Planning may consume most of the context window. Consider running `/impl` at the start of a fresh session dedicated to planning, with implementation in a follow-up session." This is a ceremony step, not a judgement call. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Plan written to disk enables cross-session handoff | Feature | The `plans/impl-plan.md` pattern works exactly as intended. |
| 2 | IMPLEMENTATION-TRACKER too large for parallel reads | Bug | 30K+ token file causes parallel tool cancellation. Must use `limit` param or read specific sections via grep+offset. |
| 3 | Sub-agent spec extraction cancelled by parallel error | Bug | Dispatching sub-agent in parallel with a too-large Read triggers cancellation of all parallel calls. |
| 4 | `/impl` context budget warning fires too late for large work items | Upgrade | Warning at Step 5 (after all reads) doesn't help — context is already consumed. Need early warning at Step 1. |
| 5 | No MEMORY.md guidance on plan-vs-build session splitting | Feature request | MEMORY.md should document that for effort: large items, plan and build are separate sessions. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Add early context budget warning to `/impl` Step 1 for large work items | next | open | Skill | `/impl` skill Step 1 includes: if `effort: large` AND AC ≥ 12, output warning that planning may exhaust context and recommend dedicated plan session. |
| 2 | Document plan-vs-build session splitting in MEMORY.md | next | done | Engineer | **Pre-satisfied.** Already in MEMORY.md `## Skill Pipeline Observations` line 69. |
| 3 | Always use `limit` or grep+offset when reading IMPLEMENTATION-TRACKER.md | later | done | Engineer | **Pre-satisfied.** Already in MEMORY.md `## Skill Pipeline Observations` line 70. |
