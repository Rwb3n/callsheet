---
triaged: true
status: complete
---

# Retro: Tech Debt Session 2026-02-24

**Date:** 2026-02-24
**Scope:** Tech debt triage + resolution session. Three items resolved from the "Later" backlog (#15, #23, #25). Full backlog audited (25 items → 16 active after 3 resolved + 6 previously struck).

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | #23 (NoOpNotificationDb) was a single-line swap per file — the production adapter factory `createNotificationDb(db)` already existed since CS-WORK-046 and both webhook routes already had `getDb()` in scope. The blocker was never code complexity; it was just that nobody revisited the TODO after the table landed. |
| **What went well?** | Trigger-based triage works. The 25-item backlog had clear thresholds and every "not yet" call was defensible. All three resolved items went from identification to green tests in under 15 minutes. The `invokeHandler<T>` helper preserved full type safety over the branded `DeferredActionParamsMap` — no `as unknown` casts leak to test call sites. |
| **Could have gone better?** | #23 sat for two work items after its trigger was met (CS-WORK-046 created the table, but the webhook routes weren't updated until this session). The retro system flagged it, but the close-out checklist for CS-WORK-046 didn't include "update consumers of NoOpNotificationDb". |
| **Keep doing** | Trigger thresholds on tech debt items — prevents premature extraction and ensures debt is only paid when it actually hurts. Flat backlog table with strikethrough for done items — single source of truth. |
| **Stop doing** | Nothing new to stop. |
| **Start doing** | Add "upstream consumer audit" to the close-out checklist for work items that create replacements for no-op/stub implementations. When a real implementation lands, the WORK.md completion step should grep for the no-op import and list affected files. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | NoOpNotificationDb sat 2 work items past trigger | Bug | Close-out checklist gap — CS-WORK-046 created DrizzleNotificationDb but didn't update the two webhook routes still importing the no-op. Bounce threshold notifications were silently dropped in production-path code. |
| 2 | `invokeHandler<T>` typed over `DeferredActionParamsMap` | Feature | The helper preserves branded param types through the registry's type-erased internal map. Test call sites get autocomplete on params without any manual cast. |
| 3 | Trigger-based tech debt triage | Feature | 25-item backlog, clear thresholds, no premature extraction. 3 items resolved in one session, 16 deferred with documented triggers. |
| 4 | `db:reset` script chains 3 steps | Feature | Single command replaces manual three-step workflow. Reduces onboarding friction and eliminates ordering mistakes (seed before push, etc.). |
| 5 | Close-out checklist missing "no-op consumer audit" step | Feature request | When a work item creates a real implementation that replaces a no-op/stub, the close-out should include grepping for the no-op import and updating all consumers. |
| 6 | Tech debt items lack "triggered at" timestamps | Upgrade | Items have trigger conditions but no record of when the trigger was met. Makes triage harder — you have to re-derive whether a threshold was crossed. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Add "no-op consumer audit" to close-out checklist | next | Agent | IMPLEMENTATION-TRACKER close-out checklist section includes: "After replacing a no-op/stub implementation: grep for no-op import, update all consumer files." |
| 2 | Add "triggered at" column or annotation to tech debt table | later | Agent | Each tech debt item with a met trigger has a date annotation (e.g., `Triggered: CS-WORK-046, 2026-02-24`). New items include trigger date when added post-threshold. |
