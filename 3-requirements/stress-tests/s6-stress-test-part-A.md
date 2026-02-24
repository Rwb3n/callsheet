# S6 Stress Test — Part A (CR + Ops + SI Boundaries)

**Agent:** A
**Boundaries:** Commercial & Revenue, Operations, Shared Infrastructure, Internal Consistency
**Date:** 2026-02-14
**Scenarios:** 12

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S6-ST-A1 | `TIER_LIMITS` import for `rankingBoost` and `sponsoredPlacement` — P4 compliance | Pass | `01-search.md` §1.3 | CR §4.1 | Correct |
| S6-ST-A2 | `computeFeatureAccess` usage matches CR §4.2 signature | Pass | `05-crossrole-gating.md` §9.3 | CR §4.2 | Correct |
| S6-ST-A3 | Engagement stats gating logic inconsistency with `FeatureAccess` output | Medium | `05-crossrole-gating.md` §9.3 | CR §4.2, SI §8.1 | `shouldShowEngagementStats` bypasses `FeatureAccess` with a hardcoded `subscriptionTier !== "free"` check instead of using a `FeatureAccess` field |
| S6-ST-A4 | `contact_attempt` event payload P1 compliance against Ops consumer table | Pass | `02-listing-profile.md` §7.3 | Ops §2, PP §1.8 | Correct |
| S6-ST-A5 | Search history retention — 12-month via deferred action pattern match with SI §2 | Low | `01-search.md` §5.2 | SI §2.1, SI §2.2 | Self-perpetuating pattern specifies `retry: once` and `onFailure: log` in index.md §11 but SI §2.2 registered actions table has no `Delay` column value documented for `search_history_cleanup` |
| S6-ST-A6 | `search_history_cleanup` in `DeferredActionParamsMap` — entry and count | Medium | `index.md` §11 | SI §2.1, SI §2.2 | `DeferredActionParamsMap` currently has 11 entries. S6 adds `search_history_cleanup: Record<string, never>`. Total should be 12. Index.md §11 says "12 deferred actions (was 11 after S5)" — count is correct. But SI §2.2 registered actions table currently shows 11 rows; needs the 12th row added. |
| S6-ST-A7 | `EventPayloadMap` coverage — all 5 S6-emitted events present | Medium | `00-router-plan.md` §5 | SI §1.2, PP §1.1–§1.8 | All 5 events (`search_performed`, `profile_viewed`, `enquiry_submitted`, `shortlist_added`, `contact_attempt`) are present in SI §1.2 `EventPayloadMap`. Payloads match PP §1.1–§1.8. However, `search_performed` payload in `01-search.md` §1.8 emits `sessionId: ctx.session?.id` but PP §1.1 types it as `sessionId?: string`. The field name `id` vs session object key must align at implementation. |
| S6-ST-A8 | Email templates — `new_enquiry` and `enquiry_forwarded` in SI §5.2; total count 25 | Pass | `index.md` §12 | SI §5.2 | Correct |
| S6-ST-A9 | Rendering strategy — SSR for `/search`, SSG+ISR for `/providers/[slug]` against SI §7 | Low | `00-router-plan.md` §3 | SI §7.1 | SSR for `/search` matches SI §7.1 "Search results: SSR, Real-time". SSG+ISR 15 min for `/providers/[slug]` matches SI §7.1 "Listing profiles: SSG + ISR, 15 minutes". Rendering strategy reference cites `SI §10` for the 500ms TTFB target — the correct section is SI §12.1 (Non-Functional Requirements). |
| S6-ST-A10 | Notification type `enquiry_received` in SI §8.1 | Low | `index.md` §13 | SI §8.1 | `enquiry_received` is listed in SI §8.1 `NotificationType` union. However, index.md §13 says "S6 uses one existing notification type" and the handler "is already registered by S5." S5 does register this handler — correct. No finding. Actually: the `enquiry_received` notification is triggered by S5's consumer of `enquiry_submitted`, but S6 is the first slice to actually emit `enquiry_submitted` (S5 only defines the handler). This ordering dependency is implicit but correct — S5 registers the handler, S6 provides the trigger. |
| S6-ST-A11 | Deferred action count — index.md §11 claims 12 after S6 | Medium | `index.md` §11 | SI §2.2 | SI §2.2 registered actions table has 11 entries (listed explicitly): `expire_enquiry_queue`, `compliance_schedule_check`, `billing_reconciliation`, `compliance_hold_recheck`, `win_back_evaluation`, `auto_escalation_check`, `notification_cleanup`, `grace_period_expiry`, `checkout_precondition_retry`, `listing_update_reminder`, `enquiry_response_reminder`. Adding `search_history_cleanup` = 12. Count matches. But `DeferredActionParamsMap` also has 11 entries — `search_history_cleanup` must be added to both the map and the table. The slice correctly specifies both additions. |
| S6-ST-A12 | Downstream flags completeness — S6-1 through S6-5 | Medium | `index.md` §16 | CR §4.1, SI §1.2 | S6-2 says S8 consumes `search_performed`, `profile_viewed`, `enquiry_submitted`, `contact_attempt` — but `contact_attempt` has no CR consumer in CR §2. CR only consumes `enquiry_submitted` (for `first_enquiry` trigger). `contact_attempt` consumers are D&L and Ops only (PP §1.8). S6-2 incorrectly attributes `contact_attempt` consumption to S8 (Commercial). |

## Detailed Findings

### S6-ST-A3: Engagement stats gating bypasses `FeatureAccess` output

**Severity:** Medium
**Slice section:** `05-crossrole-gating.md` §9.3
**Upstream reference:** CR §4.2, CR §4.1 (`FeatureAccess` type)

**Problem:** The `shouldShowEngagementStats` function in §9.3 calls `computeFeatureAccess(tier)` to get a `FeatureAccess` object, but then ignores it and hardcodes `listing.subscriptionTier !== "free"` as the gate condition. The `FeatureAccess` type (CR §4.2) includes `basicAnalytics: true` for all tiers — there is no field that distinguishes "buyer-visible engagement stats" from "provider-visible analytics." The slice acknowledges this ("basicAnalytics is always true, but engagement stats on the PUBLIC profile are a Standard+ feature") but the implementation bypasses the CR export entirely, creating a de facto feature gate that lives in PP, not CR. If CR later adjusts which tiers see buyer-visible engagement stats (e.g., making it a premium-only feature), the change must be made in PP's rendering code rather than in CR's `TIER_LIMITS` — violating P4.

The fix is to add a `buyerVisibleEngagementStats: boolean` field to `TierLimits` (CR §4.1), set it to `false` for free and `true` for standard/premium/partner. Then `shouldShowEngagementStats` checks the `FeatureAccess` output rather than branching on tier directly. This preserves P4 — CR owns the business rule, PP imports and renders.

**Fix — slice:**
- Section: `05-crossrole-gating.md` §9.3
- Old: `return access.basicAnalytics === true && listing.subscriptionTier !== "free"`
- New: `return access.buyerVisibleEngagementStats === true`
- Also update the implementation note to reference the new field instead of the hardcoded tier check.

**Fix — sibling specs:**
- Document: `interfaces/commercial-and-revenue.md`
- Section: §4.1 (`TierLimits` type)
- Change: Add `buyerVisibleEngagementStats: boolean` to `TierLimits`. Set values: `free: false`, `standard: true`, `premium: true`, `partner: true`.
- Also propagate to `FeatureAccess` in §4.2 (it extends `TierLimits`, so it inherits automatically).

**Acceptance criteria impact:** AC-50 in index.md §18 and AC-{9.5}/AC-{9.6} in `05-crossrole-gating.md` §9.7 unchanged in intent — they already test the correct behaviour. The code implementing them changes.

---

### S6-ST-A6: `DeferredActionParamsMap` — SI §2.1/§2.2 require update for `search_history_cleanup`

**Severity:** Medium
**Slice section:** `index.md` §11, `01-search.md` §5.2
**Upstream reference:** SI §2.1 (`DeferredActionParamsMap`), SI §2.2 (Registered Actions table)

**Problem:** S6 correctly specifies that `search_history_cleanup: Record<string, never>` must be added to `DeferredActionParamsMap` (SI §2.1) and a new row must be added to the registered actions table (SI §2.2). The slice provides exact code blocks for both additions. However, the fix-applier must know to edit `shared-infrastructure.md` — the slice documents the required changes but does not make them. This is by design (slices specify, stress test confirms, fix-applier applies), but the instructions need to be precise.

The `DeferredActionParamsMap` in SI §2.1 must gain the entry. The SI §2.2 table must gain a row: `Platform | search_history_cleanup | Self-perpetuating, seeded on startup | daily | once | log`. The table column headers in SI §2.2 are: Domain | Action | Trigger | Delay | Retry | On Failure. S6's index.md §11 uses slightly different column names ("Owner" instead of "Domain", "Schedule" instead of "Delay"). The fix must use SI §2.2's column naming convention.

**Fix — slice:**
- Section: `index.md` §11, SI §2.2 row specification
- Old: `| Owner | Action | Trigger | Schedule | Failure |`
- New: `| Domain | Action | Trigger | Delay | Retry | On Failure |`
- And the row: `| Platform | search_history_cleanup | Self-perpetuating, seeded on startup | 24h recurring | once | log |`

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 — Add `search_history_cleanup: Record<string, never>` to `DeferredActionParamsMap`
- Section: §2.2 — Add row: `| Platform | search_history_cleanup | Self-perpetuating, seeded on startup | 24h recurring | `once` | `log` |`

**Acceptance criteria impact:** None — AC-37/AC-{5.28-29} already test this correctly.

---

### S6-ST-A9: Rendering strategy TTFB reference cites wrong SI section

**Severity:** Low
**Slice section:** `00-router-plan.md` §3 (Rendering Strategy Summary)
**Upstream reference:** SI §7.1, SI §12.1

**Problem:** The router plan §3 states: "Target: <500ms TTFB p95 [SI §10]." The shared infrastructure spec has no §10 — the rendering strategy is §7 and non-functional requirements (including latency budgets) are §12. The correct citation is SI §12.1 (SSR search: <500ms TTFB p95) or SI §7.1 (page classification table). The `[SI §10]` reference is a stale pointer, likely from an earlier version of the spec.

**Fix — slice:**
- Section: `00-router-plan.md` §3, row for `/search`
- Old: `[SI §10]`
- New: `[SI §12.1]`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None.

---

### S6-ST-A12: Downstream flag S6-2 incorrectly attributes `contact_attempt` to S8 (Commercial)

**Severity:** Medium
**Slice section:** `index.md` §16, flag S6-2
**Upstream reference:** CR §2 (Events Consumed), Ops §2 (Events Consumed), PP §1.8 (contact_attempt consumers)

**Problem:** Flag S6-2 states: "S6 emits `search_performed`, `profile_viewed`, `enquiry_submitted`, `contact_attempt`. S8 consumes these for conversion funnel analysis and churn detection triggers." However, CR §2 (the authoritative consumer registry for Commercial) lists only `enquiry_submitted` as a consumed event relevant to conversion triggers (via the `first_enquiry` trigger, CR-X-10). CR does not consume `contact_attempt` — that event's consumers are D&L (data quality) and Ops (outreach prioritisation), per PP §1.8. Including `contact_attempt` in the S8-targeted flag implies Commercial will build a consumer for it, which has no basis in the interface spec.

Additionally, `profile_viewed` and `search_performed` are consumed by D&L (not CR). S8 is the Commercial slice. The events S8 actually needs from S6 are `enquiry_submitted` (already consumed by CR per CR §2) and potentially `search_performed`/`profile_viewed` for perception signals — but those feed S9 (Entity Intelligence), not S8.

The fix is to split S6-2 into two flags: one for S8 (CR consumption of `enquiry_submitted` for conversion trigger) and acknowledge that `search_performed`, `profile_viewed`, and `contact_attempt` feed S9 (which S6-3, S6-4, and S6-5 already cover). S6-2 should reference only the event that CR actually consumes.

**Fix — slice:**
- Section: `index.md` §16, flag S6-2
- Old: `S6 emits search_performed, profile_viewed, enquiry_submitted, contact_attempt. S8 consumes these for conversion funnel analysis and churn detection triggers.`
- New: `S6 emits enquiry_submitted which CR consumes for the first_enquiry conversion trigger (CR §2, CR-X-10). S8 implements the conversion trigger evaluation logic and churn detection that depend on this event. search_performed, profile_viewed, and contact_attempt feed D&L and Ops consumers; S9 aggregates them for entity perception (covered by S6-3, S6-4, S6-5).`

**Fix — sibling specs:** None — the interface specs are correct. The slice flag was inaccurate.

**Acceptance criteria impact:** None — the ACs test event emission, not downstream consumption attribution.

---

### S6-ST-A7: `search_performed` event `sessionId` field source ambiguity

**Severity:** Medium
**Slice section:** `01-search.md` §1.8, `00-router-plan.md` §2.1
**Upstream reference:** SI §1.2 (`EventPayloadMap`), PP §1.1 (`SearchPerformedEvent`)

**Problem:** PP §1.1 defines `SearchPerformedEvent` with `sessionId?: string` — an optional string field. The slice emits `sessionId: ctx.session?.id` in the search handler (§1.8). The `ctx.session` object comes from Better Auth's `AuthSession` type (SI §4.1), which defines `accountId: UUID`, `email: string`, etc. — but does not define a `session.id` field. The `AuthSession` type in SI §4.1 has no `id` property. The implementation would need to either:

1. Use `ctx.session?.accountId` (which is a UUID, compatible with `string`), or
2. Define `session.id` as a separate concept (session token identifier vs account identifier).

The intent appears to be tracking whether the search came from an authenticated session, not the specific session token. If `sessionId` maps to `accountId`, the field name is misleading. If it maps to a session token (separate from account), that token is not in the `AuthSession` type.

The fix is to clarify in the slice that `sessionId` maps to `ctx.session?.accountId` (or `null` for anonymous), matching the intent described in the PP concept design. The PP interface spec should annotate what `sessionId` represents.

**Fix — slice:**
- Section: `01-search.md` §1.8 and `00-router-plan.md` §2.1
- Old: `sessionId: ctx.session?.id,`
- New: `sessionId: ctx.session?.accountId ?? null,`
- Add inline comment: `// PP §1.1: sessionId is accountId for authenticated users, null for anonymous`

**Fix — sibling specs:** None required — PP §1.1 types it as `sessionId?: string` which accommodates UUID. The semantic clarification belongs in the slice implementation note.

**Acceptance criteria impact:** AC-8 in index.md references `sessionId optional` — unchanged. AC-13 in `01-search.md` should add: "sessionId is ctx.session.accountId for authenticated users, null for anonymous."

---

### S6-ST-A11: Deferred action count verified — no structural finding

**Severity:** Pass (verification scenario)
**Slice section:** `index.md` §11
**Upstream reference:** SI §2.2

Counted all 11 entries in SI §2.2 registered actions table. Adding `search_history_cleanup` yields 12. Index.md §11 states "12 deferred actions (was 11 after S5)." Verified correct.

---

### S6-ST-A10: `enquiry_received` notification type and handler ordering

**Severity:** Low
**Slice section:** `index.md` §13
**Upstream reference:** SI §8.1

**Problem:** Index.md §13 states the `enquiry_received` notification is "triggered by S6's enquiry submission to claimed listings — the notification handler is already registered by S5." This is correct: S5 registers the handler that fires when `enquiry_submitted` is consumed by PP. However, the slice does not document where in S6's `enquiry.submit` handler the notification is created. Examining the §3 enquiry submission flow (§3.4 routing decision tree), Branch A sends the `new_enquiry` email but does not explicitly call `createNotification("enquiry_received", ...)`. The notification is created by S5's async consumer of `enquiry_submitted` (which S6 emits at the end of the handler).

This means the notification path is: S6 emits `enquiry_submitted` → S5's registered PP consumer creates the `enquiry_received` notification asynchronously. The flow is correct but the intermediary step (S5's consumer) is not mentioned in §3. A reader might expect the notification to be created inline in the handler.

This is a documentation clarity issue, not a structural gap. The implementation will work correctly because S5's consumer handles it.

**Fix — slice:**
- Section: `03-enquiry-submission.md` §3.5, below the consumer table
- Old: (no mention of notification path)
- New: Add note: "The `enquiry_received` in-app notification is created by S5's async consumer of `enquiry_submitted` (PP §2). S6 emits the event; S5's handler creates the notification. No inline notification creation in `enquiry.submit`."

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None.

---

## Summary

S6 is well-aligned with upstream interface specs across the CR, Ops, and SI boundaries. Of 12 scenarios, 4 pass cleanly. The most significant finding (S6-ST-A3, Medium) is a P4 compliance gap: engagement stats gating on the buyer-visible profile page hardcodes a tier check in PP rather than consuming a CR-owned field from `FeatureAccess`. This requires adding `buyerVisibleEngagementStats: boolean` to `TierLimits` in CR §4.1. Two other Medium findings are documentation precision issues: the downstream flag S6-2 incorrectly attributes `contact_attempt` consumption to S8/Commercial (S6-ST-A12), and `sessionId` in `search_performed` references a non-existent `ctx.session.id` property (S6-ST-A7). The deferred action registration (S6-ST-A6) is correctly specified in the slice but needs column naming alignment with SI §2.2 conventions. Three Low findings address citation accuracy and documentation clarity. No High-severity gaps found — S6's interface boundary surface is structurally sound.
