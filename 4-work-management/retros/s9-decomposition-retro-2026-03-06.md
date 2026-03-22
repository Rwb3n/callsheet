---
triaged: true
status: complete
---

# Retro: S9 Decomposition

**Date:** 2026-03-06
**Scope:** Decomposition of Slice 9 (Entity Intelligence) into 8 work items (CS-WORK-075 through CS-WORK-082, 101 AC)

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | S9 has 101 AC but decomposes cleanly into 8 work items — fewer than S7 (9) or S8 (9) despite higher AC count. The slice's 6 content files map almost 1:1 to work items, with only §6 (event consumers) splitting into two. |
| **What went well?** | Type alignment check was fast — all 17 `DeferredActionParamsMap` entries and all event payload types already existed in the codebase. No sibling spec fixes needed at decomposition time (stress test already resolved them). The `00-router-plan.md` file tree made dependency mapping straightforward. |
| **Could have gone better?** | The 0-AC schema work item (CS-WORK-075) required deliberation about whether it was valid. Prior slices (S7, S8) bundled schema with the first functional work item. For S9, the schema serves all 7 downstream items equally, so standalone was the right call, but the skill instructions don't explicitly address 0-AC foundation work items. |
| **Keep doing** | Reading `00-router-plan.md` before content files — the file tree + handler inventories gave the complete decomposition picture without needing to read 6 content files in full. Distributing admin routes to the work items that produce their data (not a separate router work item). |
| **Stop doing** | N/A |
| **Start doing** | For slices with >80 AC, explicitly state in the decomposition summary which work items create the admin router shell vs which append routes — avoids confusion when multiple items target the same router file. |
| **Skill amendment?** | Decomposer skill should add a note in Step 2 about 0-AC foundation work items: "A work item with 0 AC is valid when it creates shared infrastructure (schema, migration, seed data) that all other work items depend on. Schema correctness is verified by dependent work items' integration tests." This codifies the pattern rather than requiring case-by-case reasoning. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Type alignment was pre-satisfied — all DeferredActionParamsMap entries already in codebase | Feature | S8 implementation correctly pre-populated S9 deferred action types. Protect this pattern of forward-populating type registries during implementation. |
| 2 | 0-AC foundation work item pattern not documented in decomposer skill | Feature request | Skill should explicitly support 0-AC work items for schema/migration/seed foundations. |
| 3 | Admin router distribution (routes in domain work items, not standalone router) worked well for S9 | Feature | Eliminates a 0-AC admin router work item, keeps route logic co-located with the computation it surfaces. |
| 4 | Router file creation coordination unclear — 4 work items add routes to same `admin/intelligence.ts` | Upgrade | First work item to execute creates the router shell; subsequent items append. Document this in each WORK.md Context section. |

---

## 3 — Action Register

| # | Item | Priority | Status | Owner | Definition of Done |
|---|------|----------|--------|-------|--------------------|
| 1 | Add "0-AC foundation work item" guidance to decomposer skill Step 2 | later | done | Skill | **DONE.** Added "0-AC foundation work items" subsection to decomposer skill Step 2 with CS-WORK-075 as example. |
| 2 | Add "admin router shell creation" note to CS-WORK-076 Context (first item to create `admin/intelligence.ts`) | next | done | Engineer | **DONE.** CS-WORK-076 Context updated: "Creates admin intelligence router shell... CS-WORK-077, 079, 080 append routes to this file." |
