# Retro: S5 Decomposition

**Date:** 2026-02-24
**Scope:** Decomposition of S5 (Provider Experience) into 7 work items (CS-WORK-043 through CS-WORK-049, 46 AC). CH-CS-007.

---

## 1 — Reflection

| Prompt | Notes |
|--------|-------|
| **What surprised you?** | S5 is almost entirely a presentation/routing layer — no new event consumers, no new domain logic, only 1 new email template. The slice is large (46 AC) but shallow: it surfaces S1–S4 data through a dashboard UI. The notifications table not existing yet was unexpected given S0 defined the notification system. The `NoOpNotificationDb` workaround in webhook routes has been accumulating tech debt since S4. Also, the AC numbering quirk (AC-34 → AC-45 in the profile editor section, AC-46 as a stress test addition) required careful counting — initial count came to 45 until line 1200 revealed AC-46. |
| **What went well?** | Star-topology dependency graph — single critical path (CS-WORK-043) then full parallelism across 6 work items. This is the simplest dependency shape of any decomposition so far. Type alignment check (Step 1.7) caught 3 actionable findings: `enquiry_records` missing `status` column, `notifications` table not yet created, `listings.version` column absent. All three are documented in the relevant WORK.md Context sections. The `DeferredActionParamsMap` already contains both S5 action types (`listing_update_reminder`, `enquiry_response_reminder`) — no type alignment issue there. `PaymentService.getCustomerPortalUrl` also already exists. |
| **Could have gone better?** | CS-WORK-044 at 10 AC is the largest work item. It bundles analytics display (6 AC) with quality score transparency (4 AC). These share the same route (`getListingDashboard`) and data loading pattern, so splitting them would create an artificial boundary. But 10 AC means more test surface area per session. CS-WORK-049 groups two conceptually distinct features (account settings + feature gating) because they're both small individually (4 AC each) and share the same dashboard context dependency. If implementation reveals they have nothing in common, the grouping was a mistake — but at 8 AC total it's still manageable. |
| **Keep doing** | The Explore subagent for codebase type checking. It found `enquiry_records` schema shape, `NotificationDb` abstract interface, `DeferredActionParamsMap` completeness, and `PaymentService` interface — all in a single parallel pass. This prevented multiple potential "type surprise" moments during implementation. |
| **Stop doing** | Nothing to stop. The decomposer skill's instructions are stable and the S4 retro's action item (type alignment check) is already proving useful. |
| **Start doing** | Note migration coordination requirements explicitly when multiple work items in the same slice need schema changes. CS-WORK-045 (enquiry_status column), CS-WORK-046 (notifications table), and CS-WORK-048 (listings.version column) all need migrations. The deliverables say "coordinate migration numbering" but don't specify an order. During implementation, whichever work item runs `drizzle-kit generate` first claims the next migration number. This is fine for sequential implementation but would cause conflicts under parallel execution. |

---

## 2 — Classification

| # | Item | Bucket | Detail |
|---|------|--------|--------|
| 1 | Star-topology dependency graph enables 6-way parallelism | Feature | Best dependency shape across all decompositions. The dashboard shell is a clean separation point. |
| 2 | Type alignment check caught 3 missing columns/tables | Feature | Step 1.7 working as designed. All 3 documented in WORK.md Context. |
| 3 | CS-WORK-044 at 10 AC is the largest work item | Upgrade | Functional grouping but monitor during implementation. Split if analytics tests exceed 12 tests or session exceeds 2 hours. |
| 4 | AC-46 nearly missed due to non-contiguous numbering | Bug | Initial AC count returned 45. Line 1200 (AC-46, stress test addition) was beyond the visible AC section headers. The "total: 46" footer was the safety net. |
| 5 | 3 work items need schema migrations but order is unspecified | Feature request | Add migration ordering note to chapter file when >1 work item needs schema changes. Prevents conflicts under parallel execution. |
| 6 | `NoOpNotificationDb` tech debt resolved by CS-WORK-046 | Feature | CS-WORK-046 creates the real notifications table and Drizzle-backed implementation, replacing the no-op. Tech debt item from IMPLEMENTATION-TRACKER resolved. |
| 7 | CS-WORK-049 groups account settings + feature gating | Upgrade | Two conceptually distinct features grouped for size. If implementation shows no shared code, consider whether the grouping hurt clarity. |

---

## 3 — Action Register

| # | Item | Priority | Owner | Definition of Done |
|---|------|----------|-------|--------------------|
| 1 | Monitor CS-WORK-044 size during implementation | next | implementer | If implementation exceeds 2 hours or 12 tests, split analytics (AC-6–11) from quality score (AC-12–15) into two work items. Decision made before committing. |
| 2 | Run schema migrations in order: 045 → 046 → 048 | next | implementer | First migration adds `enquiry_status` enum + column, second creates `notifications` table, third adds `listings.version`. Each claims the next sequential migration number. Document final numbers in IMPLEMENTATION-TRACKER completion log. |
| 3 | Add migration coordination note to chapter template | later | skill-maintainer | Chapter file template includes a "Migration Order" section when >1 work item in the chapter needs schema changes. Observable: next multi-migration chapter has an explicit ordering note. |
