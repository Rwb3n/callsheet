# S6 Stress Test — Buyer Experience

**Slice:** `slices/slice-06-buyer-experience/` (v1, multi-file)
**Tested against:** shared-infrastructure.md (v5), data-and-listings.md (v4), operations.md (v3), platform-and-product.md (v5), commercial-and-revenue.md (v2)
**Date:** 2026-02-14
**Scenarios:** 20
**Severity distribution:** 1 High, 6 Medium, 5 Low, 8 Pass
**Total fixes:** 12

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S6-ST-1 | Shortlist lifecycle display: internal contradiction between join-based and consumer-written approaches | High | `04-shortlist-dashboard.md` §4.1/§4.4/§4.5 vs `00-schema.md` §2.1 vs `index.md` §10 | PP §2, D&L §1.3/§1.4/§1.5 | §4.1/§4.5 say lifecycle read via join to `listings.lifecycleStatus`; §2.1/index §10 say PP consumers write `shortlist_items.status`. Mutually exclusive. |
| S6-ST-2 | Engagement stats gating bypasses `FeatureAccess` with hardcoded tier check | Medium | `05-crossrole-gating.md` §9.3 | CR §4.2, CR §4.1 | `shouldShowEngagementStats` hardcodes `subscriptionTier !== "free"` instead of consuming a CR-owned `FeatureAccess` field — P4 violation. |
| S6-ST-3 | `DeferredActionParamsMap` and registered actions table need `search_history_cleanup` row with SI §2.2 column naming | Medium | `index.md` §11, `01-search.md` §5.2 | SI §2.1, SI §2.2 | Slice specifies correct additions but uses wrong column names for SI §2.2 table row. |
| S6-ST-4 | `search_performed` event `sessionId` field references non-existent `ctx.session.id` property | Medium | `01-search.md` §1.8, `00-router-plan.md` §2.1 | SI §1.2, PP §1.1 | `ctx.session?.id` does not exist in `AuthSession` (SI §4.1). Should be `ctx.session?.accountId`. |
| S6-ST-5 | Downstream flag S6-2 incorrectly attributes `contact_attempt` consumption to S8 (Commercial) | Medium | `index.md` §16, flag S6-2 | CR §2, PP §1.8 | CR does not consume `contact_attempt`. S6-2 bundles four events under S8; only `enquiry_submitted` has a CR consumer. |
| S6-ST-6 | `enquiry_submitted` consumer list in §3.5 omits CR `first_enquiry` conversion trigger consumer | Medium | `03-enquiry-submission.md` §3.5 | PP §1.3 | Consumer table lists only D&L; PP §1.3 lists CR consumer [CR-X-10] as well. |
| S6-ST-7 | `search_performed` emission — `filters` default `{}` produces semantically ambiguous type | Medium | `01-search.md` §1.8, `00-router-plan.md` §2.1 | PP §1.1 | `filters: input.filters ?? {}` emits `Record<string, never>` when undefined; consumers must treat missing properties as "no filter applied." |
| S6-ST-8 | Search history cleanup deferred action — SI §2.2 `Delay` column undocumented for self-perpetuating pattern | Low | `01-search.md` §5.2 | SI §2.1, SI §2.2 | Slice specifies `retry: once` and `onFailure: log` but SI §2.2 row lacks a `Delay` column value for self-perpetuating actions. |
| S6-ST-9 | Rendering strategy TTFB reference cites non-existent `[SI §10]` | Low | `00-router-plan.md` §3 | SI §7.1, SI §12.1 | Correct citation is SI §12.1 (latency budgets) or SI §7.1 (page classification). |
| S6-ST-10 | `enquiry_received` notification creation path undocumented in §3 | Low | `index.md` §13, `03-enquiry-submission.md` §3.5 | SI §8.1, PP §2 | Notification created by S5's async consumer of `enquiry_submitted`, not inline. Flow is correct but intermediary step missing from §3. |
| S6-ST-11 | `getEngagementCounters` — D&L spec does not document unclaimed-listing behaviour | Low | `02-listing-profile.md` §2.3 | D&L §3.2 | S6 correctly guards with `verificationTier !== "unclaimed"` but D&L §3.2 does not specify return value for unclaimed listings. |
| S6-ST-12 | `pending_enquiries.forwardedAt` null semantics for Branch D (disputed) undocumented | Low | `03-enquiry-submission.md` §3.9 | D&L, S1 §1.12 | `forwardedAt: null` distinguishes silently-queued from forwarded enquiries; no spec documents this semantic. |
| S6-ST-13 | `TIER_LIMITS` import for `rankingBoost` and `sponsoredPlacement` — P4 compliance | Pass | `01-search.md` §1.3 | CR §4.1 | Correct |
| S6-ST-14 | `computeFeatureAccess` usage matches CR §4.2 signature | Pass | `05-crossrole-gating.md` §9.3 | CR §4.2 | Correct |
| S6-ST-15 | `contact_attempt` event payload P1 compliance against Ops consumer table | Pass | `02-listing-profile.md` §7.3 | Ops §2, PP §1.8 | Correct |
| S6-ST-16 | Email templates — `new_enquiry` and `enquiry_forwarded` in SI §5.2; total count 25 | Pass | `index.md` §12 | SI §5.2 | Correct |
| S6-ST-17 | ISR revalidation trigger list: S6 §2.1 lists 6 events; SI §7.2 lists 7 including inline `profile_edited` | Pass | `02-listing-profile.md` §2.1 | SI §7.2 | Correct — `profile_edited` is inline ISR, not event-bus. Counts align. |
| S6-ST-18 | `search_performed` D&L consumption — zero-result tracking confirmed in D&L §2 | Pass | `01-search.md` §1.8 | D&L §2 | Correct |
| S6-ST-19 | Email templates `new_enquiry` and `enquiry_forwarded` registered in PP §4.1 with correct IDs | Pass | `03-enquiry-submission.md` §3.7 | PP §4.1 | Correct |
| S6-ST-20 | Deferred action count verified: 11 + `search_history_cleanup` = 12 | Pass | `index.md` §11 | SI §2.2 | Correct |

## Detailed Findings

### S6-ST-1: Shortlist lifecycle display — internal contradiction between join-based and consumer-written approaches

**Severity:** High
**Slice section:** `04-shortlist-dashboard.md` §4.1, §4.4, §4.5 vs `00-schema.md` §2.1 vs `index.md` §10
**Upstream reference:** PP §2 (consumers for `listing_archived`, `listing_suspended`, `listing_reactivated`), D&L §1.3, §1.4, §1.5

**Problem:** S6 contains two mutually exclusive descriptions of how shortlist items reflect listing lifecycle state. In `04-shortlist-dashboard.md` §4.1, §4.4, and §4.5, the slice says `shortlist_items.status` tracks only item-level state (`active`/`removed`), listing lifecycle state is read via JOIN to `listings.lifecycleStatus`, and "no consumer writes to `shortlist_items` are needed." But in `00-schema.md` §2.1, the consumer mapping table states that `listing_archived` transitions `shortlist_items.status` from `active` → `archived`, `listing_suspended` does `active` → `suspended`, and `listing_reactivated` restores to `active` — PP consumers already registered in PP §2 (`[XP-15]`). The `index.md` §10 event consumer table reinforces the consumer-written model, stating "S6 reads `shortlist_items.status` for display; consumer already writes the value." PP §2 is authoritative: the consumer-written model is correct.

**Fix — slice:**
- Section: `04-shortlist-dashboard.md` §4.1, paragraph 2
- Old: `The shortlist_items.status column tracks only the item's own lifecycle within the shortlist: active (in shortlist) or removed (buyer removed). The archived and suspended values in shortlistItemStatusEnum (S1-ST-7) exist in the enum but are unused by S6 — listing state is read from listings.lifecycleStatus via join, not written to shortlist_items.status by event consumers.`
- New: `The shortlist_items.status column tracks both the item's own lifecycle (active → removed by buyer) and the listing's lifecycle state (active → archived/suspended by PP event consumers [XP-15]). S6 reads shortlist_items.status to render the correct display state — PP consumers registered in PP §2 update this column asynchronously on listing_archived, listing_suspended, and listing_reactivated events.`

- Section: `04-shortlist-dashboard.md` §4.4, the `shortlist.getItems` query WHERE clause
- Old: `WHERE si.shortlist_id = shortlistId AND si.status = 'active'`
- New: `WHERE si.shortlist_id = shortlistId AND si.status != 'removed'`
- Rationale: The query must return archived and suspended items (to display dimmed with badges) in addition to active items. Filtering to `status = 'active'` hides items PP consumers have transitioned, making §4.4 display rules unreachable.

- Section: `04-shortlist-dashboard.md` §4.5, replace entire section
- Old: The current text stating "Neither requires S6 to register new consumers or update shortlist_items rows" and describing the join-based approach
- New: Rewrite to state PP consumers (registered in PP §2) update `shortlist_items.status` on lifecycle events. S6 reads the status column directly. The join to `listings` is retained for display data (name, slug, headline) but lifecycle state comes from `shortlist_items.status`, not `listings.lifecycleStatus`. `erasure_completed` still cascades via FK.

- Section: `04-shortlist-dashboard.md` §4.4, the `ShortlistItemWithListing` type
- Old: `lifecycleStatus: LifecycleStatus // from listings table via join — NOT a shortlist_items column`
- New: Remove `lifecycleStatus` from the joined listing fields. Add `status` from `shortlist_items.status` to the item-level fields: `status: "active" | "archived" | "suspended" | "removed"`. Use this for display rendering.

**Fix — sibling specs:** None — PP §2 is already correct.

**Acceptance criteria impact:**
- AC-31 amended: `shortlist.getItems` returns listing display data via single JOIN; items with `status` of `archived`/`suspended` included in results with lifecycle badge. `WHERE si.status != 'removed'` filter (not `= 'active'`).
- AC-32 amended: Shortlist items for archived listings render based on `shortlist_items.status = 'archived'` (consumer-written), not `listings.lifecycleStatus` join.

---

### S6-ST-2: Engagement stats gating bypasses `FeatureAccess` output

**Severity:** Medium
**Slice section:** `05-crossrole-gating.md` §9.3
**Upstream reference:** CR §4.2, CR §4.1 (`FeatureAccess` type)

**Problem:** The `shouldShowEngagementStats` function in §9.3 calls `computeFeatureAccess(tier)` to get a `FeatureAccess` object, but then ignores it and hardcodes `listing.subscriptionTier !== "free"` as the gate condition. The `FeatureAccess` type (CR §4.2) includes `basicAnalytics: true` for all tiers — there is no field that distinguishes "buyer-visible engagement stats" from "provider-visible analytics." The slice acknowledges this but the implementation bypasses the CR export entirely, creating a de facto feature gate in PP, not CR. If CR later adjusts which tiers see buyer-visible engagement stats, the change must be made in PP's rendering code — violating P4.

**Fix — slice:**
- Section: `05-crossrole-gating.md` §9.3
- Old: `return access.basicAnalytics === true && listing.subscriptionTier !== "free"`
- New: `return access.buyerVisibleEngagementStats === true`
- Update the implementation note to reference the new CR field instead of the hardcoded tier check.

**Fix — sibling specs:**
- Document: `interfaces/commercial-and-revenue.md`
- Section: §4.1 (`TierLimits` type)
- Change: Add `buyerVisibleEngagementStats: boolean` to `TierLimits`. Values: `free: false`, `standard: true`, `premium: true`, `partner: true`.
- `FeatureAccess` in §4.2 extends `TierLimits`, so it inherits automatically.

**Acceptance criteria impact:** AC-50 in index.md §18 and AC-{9.5}/AC-{9.6} in `05-crossrole-gating.md` §9.7 unchanged in intent — the code implementing them changes.

---

### S6-ST-3: `DeferredActionParamsMap` — SI §2.1/§2.2 require update with correct column naming

**Severity:** Medium
**Slice section:** `index.md` §11, `01-search.md` §5.2
**Upstream reference:** SI §2.1 (`DeferredActionParamsMap`), SI §2.2 (Registered Actions table)

**Problem:** S6 correctly specifies that `search_history_cleanup: Record<string, never>` must be added to `DeferredActionParamsMap` (SI §2.1) and a new row to the registered actions table (SI §2.2). However, the slice's index.md §11 uses column names ("Owner", "Schedule", "Failure") that differ from SI §2.2's actual columns ("Domain", "Delay", "Retry", "On Failure"). The fix-applier must use SI §2.2's naming convention.

**Fix — slice:**
- Section: `index.md` §11, SI §2.2 row specification
- Old: `| Owner | Action | Trigger | Schedule | Failure |`
- New: `| Domain | Action | Trigger | Delay | Retry | On Failure |`
- Row: `| Platform | search_history_cleanup | Self-perpetuating, seeded on startup | 24h recurring | once | log |`

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 — Add `search_history_cleanup: Record<string, never>` to `DeferredActionParamsMap`
- Section: §2.2 — Add row: `| Platform | search_history_cleanup | Self-perpetuating, seeded on startup | 24h recurring | once | log |`

**Acceptance criteria impact:** None — AC-37/AC-{5.28-29} already test this correctly.

---

### S6-ST-4: `search_performed` event `sessionId` field source ambiguity

**Severity:** Medium
**Slice section:** `01-search.md` §1.8, `00-router-plan.md` §2.1
**Upstream reference:** SI §1.2 (`EventPayloadMap`), PP §1.1 (`SearchPerformedEvent`)

**Problem:** PP §1.1 defines `SearchPerformedEvent` with `sessionId?: string`. The slice emits `sessionId: ctx.session?.id` in the search handler. The `AuthSession` type in SI §4.1 has no `id` property — it defines `accountId: UUID`, `email: string`, etc. The implementation needs to use `ctx.session?.accountId` (a UUID, compatible with `string`). If `sessionId` maps to `accountId`, the field name is misleading but the type is compatible. The intent is tracking whether the search came from an authenticated session.

**Fix — slice:**
- Section: `01-search.md` §1.8 and `00-router-plan.md` §2.1
- Old: `sessionId: ctx.session?.id,`
- New: `sessionId: ctx.session?.accountId ?? null,`
- Add inline comment: `// PP §1.1: sessionId is accountId for authenticated users, null for anonymous`

**Fix — sibling specs:** None — PP §1.1 types `sessionId` as `string?` which accommodates UUID.

**Acceptance criteria impact:** AC-8 in index.md references `sessionId optional` — unchanged. AC-13 in `01-search.md` should add: "sessionId is ctx.session.accountId for authenticated users, null for anonymous."

---

### S6-ST-5: Downstream flag S6-2 incorrectly attributes `contact_attempt` to S8 (Commercial)

**Severity:** Medium
**Slice section:** `index.md` §16, flag S6-2
**Upstream reference:** CR §2 (Events Consumed), Ops §2 (Events Consumed), PP §1.8 (`contact_attempt` consumers)

**Problem:** Flag S6-2 states S6 emits `search_performed`, `profile_viewed`, `enquiry_submitted`, `contact_attempt` and S8 consumes these for conversion funnel analysis. CR §2 lists only `enquiry_submitted` as a consumed event relevant to conversion triggers (via `first_enquiry` [CR-X-10]). CR does not consume `contact_attempt` — that event's consumers are D&L and Ops per PP §1.8. `profile_viewed` and `search_performed` feed D&L, not CR. S8 is the Commercial slice. The events S8 needs from S6 are limited to `enquiry_submitted`. The remaining events feed S9 (Entity Intelligence) for perception signals.

**Fix — slice:**
- Section: `index.md` §16, flag S6-2
- Old: `S6 emits search_performed, profile_viewed, enquiry_submitted, contact_attempt. S8 consumes these for conversion funnel analysis and churn detection triggers.`
- New: `S6 emits enquiry_submitted which CR consumes for the first_enquiry conversion trigger (CR §2, CR-X-10). S8 implements the conversion trigger evaluation logic and churn detection that depend on this event. search_performed, profile_viewed, and contact_attempt feed D&L and Ops consumers; S9 aggregates them for entity perception (covered by S6-3, S6-4, S6-5).`

**Fix — sibling specs:** None — interface specs are correct. The slice flag was inaccurate.

**Acceptance criteria impact:** None — ACs test event emission, not downstream consumption attribution.

---

### S6-ST-6: `enquiry_submitted` consumer list in §3.5 omits CR conversion trigger consumer

**Severity:** Medium
**Slice section:** `03-enquiry-submission.md` §3.5
**Upstream reference:** PP §1.3

**Problem:** S6 §3.5 documents only one consumer of `enquiry_submitted` (D&L engagement metric update). PP §1.3 lists three consumers: D&L (engagement metric), D&L (unclaimed enquiry queue), and CR (`first_enquiry` conversion trigger [CR-X-10]). Omitting CR from the consumer table could lead an implementer to believe the event has no Commercial significance and remove fields needed by CR.

**Fix — slice:**
- Section: `03-enquiry-submission.md` §3.5, consumer table
- Old:
```
| Consumer | Domain | Action | Sync/Async |
|----------|--------|--------|------------|
| Engagement metric update | D&L | Increment enquiry count on listing engagement | Async |
```
- New:
```
| Consumer | Domain | Action | Sync/Async |
|----------|--------|--------|------------|
| Engagement metric update | D&L | Increment `listing.engagement.enquiriesReceived` | Async |
| Unclaimed enquiry queue | D&L | If listing unclaimed: queue `enquiryId` reference for delivery on claim | Async |
| first_enquiry conversion trigger | CR | Evaluate `first_enquiry` conversion trigger [CR-X-10] | Async |
```

**Fix — sibling specs:** None — PP §1.3 already lists all three consumers correctly.

**Acceptance criteria impact:** None — consumer list is reference documentation.

---

### S6-ST-7: `search_performed` emission — `filters` default produces semantically ambiguous type

**Severity:** Medium
**Slice section:** `01-search.md` §1.8, `00-router-plan.md` §2.1
**Upstream reference:** PP §1.1 (`SearchPerformedEvent`)

**Problem:** S6 emits `search_performed` with `filters: input.filters ?? {}`. When `input.filters` is undefined, this emits `filters: {}` — `Record<string, never>`. Technically assignable to `SearchFilters` (all fields optional), so the compiler won't catch it. D&L consumes `filters` for zero-result tracking and reads `filters.sectors`, `filters.serviceAreas`, etc. Missing properties yield `undefined` — safe at runtime but semantically ambiguous (no filter applied vs property missing from payload).

**Fix — slice:**
- Section: `01-search.md` §1.8, emission note after the code block
- Old: (no note on empty filters semantics)
- New: Add note: "When no filters are applied, `filters` is emitted as `{}`. This is valid `SearchFilters` (all properties optional). Consumers must treat missing properties as 'no filter applied' — not as an error. D&L's zero-result tracking checks `resultCount === 0` as the primary signal; filter values provide context, not trigger conditions."

**Fix — sibling specs:** None — PP §1.1 `SearchFilters` already has all optional fields.

**Acceptance criteria impact:** None — AC-8 already states `filters` is `SearchFilters`. The note clarifies edge behaviour.

---

### S6-ST-8: Search history cleanup deferred action — SI §2.2 `Delay` column undocumented for self-perpetuating pattern

**Severity:** Low
**Slice section:** `01-search.md` §5.2
**Upstream reference:** SI §2.1, SI §2.2

**Problem:** The self-perpetuating pattern specifies `retry: once` and `onFailure: log` in index.md §11, but SI §2.2 registered actions table has no `Delay` column value documented for `search_history_cleanup`. The S6 row must specify the delay value in the SI §2.2 format.

**Fix — slice:** Covered by S6-ST-3 fix (column naming alignment includes the `Delay` value: `24h recurring`).

**Fix — sibling specs:** Covered by S6-ST-3 fix.

**Acceptance criteria impact:** None.

---

### S6-ST-9: Rendering strategy TTFB reference cites non-existent `[SI §10]`

**Severity:** Low
**Slice section:** `00-router-plan.md` §3 (Rendering Strategy Summary)
**Upstream reference:** SI §7.1, SI §12.1

**Problem:** The router plan §3 states: "Target: <500ms TTFB p95 [SI §10]." SI §10 is the Service Abstraction Layer, not latency budgets. The correct reference for TTFB targets is SI §12.1 (non-functional requirements / latency budgets) or SI §7.1 (page classification). The `[SI §10]` reference is a mislabelled pointer.

**Fix — slice:**
- Section: `00-router-plan.md` §3, row for `/search`
- Old: `[SI §10]`
- New: `[SI §12.1]`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None.

---

### S6-ST-10: `enquiry_received` notification creation path undocumented in §3

**Severity:** Low
**Slice section:** `index.md` §13, `03-enquiry-submission.md` §3.5
**Upstream reference:** SI §8.1, PP §2

**Problem:** Index.md §13 states the `enquiry_received` notification is "triggered by S6's enquiry submission to claimed listings — the notification handler is already registered by S5." S5 registers the handler that fires when `enquiry_submitted` is consumed by PP. S6 is the first slice to actually emit `enquiry_submitted`. The notification path is: S6 emits `enquiry_submitted` → S5's registered PP consumer creates the `enquiry_received` notification asynchronously. This flow is correct but §3 does not mention the intermediary step, which could confuse implementers expecting inline notification creation.

**Fix — slice:**
- Section: `03-enquiry-submission.md` §3.5, below the consumer table
- Old: (no mention of notification path)
- New: Add note: "The `enquiry_received` in-app notification is created by S5's async consumer of `enquiry_submitted` (PP §2). S6 emits the event; S5's handler creates the notification. No inline notification creation in `enquiry.submit`."

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None.

---

### S6-ST-11: `getEngagementCounters` — D&L spec does not document unclaimed-listing behaviour

**Severity:** Low
**Slice section:** `02-listing-profile.md` §2.3
**Upstream reference:** D&L §3.2

**Problem:** S6 §2.3 guards the `getEngagementCounters` call with `listing.verificationTier !== "unclaimed"` before invoking the query. The guard is correct — unclaimed listings have no meaningful engagement data. However, D&L §3.2 does not document what `getEngagementCounters` returns for an unclaimed listing. If the guard is accidentally removed, the D&L query may return zeroes (safe) or throw (unsafe).

**Fix — slice:** No change needed — S6's guard is correct.

**Fix — sibling specs:**
- Document: `interfaces/data-and-listings.md`
- Section: §3.2
- Change: Add note after the function signature: "Returns zero-initialised counters for unclaimed listings. Callers may choose to skip the call for unclaimed listings (no engagement data exists), but the interface does not reject them."

**Acceptance criteria impact:** None.

---

### S6-ST-12: `pending_enquiries.forwardedAt` null semantics for Branch D undocumented

**Severity:** Low
**Slice section:** `03-enquiry-submission.md` §3.9
**Upstream reference:** D&L, S1 §1.12

**Problem:** S6 §3.9 writes `forwardedAt: hasContactEmail ? new Date() : null` when queuing in `pending_enquiries`. For Branch B (unclaimed + email), `forwardedAt` is the timestamp of the email forward. For Branch D (disputed), `forwardedAt` is `null` because no email is sent. The `pending_enquiries` table in S1 §1.12 defines `forwardedAt` as a nullable timestamp but does not document this semantic distinction. S3's `deliverPendingEnquiries` may need this to avoid duplicate forward notifications for enquiries that were never forwarded.

**Fix — slice:**
- Section: `03-enquiry-submission.md` §3.9, after the `queuePendingEnquiry` pseudocode
- Old: (no note on `forwardedAt` semantics)
- New: Add note: "`forwardedAt` is non-null for Branch B (email forwarded to listing's contactEmail) and null for Branch D (disputed — no forward sent). S3's `deliverPendingEnquiries` can use this to distinguish forwarded-and-queued from silently-queued enquiries."

**Fix — sibling specs:** None — S1 §1.12 comment "null if no email available" covers the schema intent. The S6 note provides the implementation context.

**Acceptance criteria impact:** None.

---

## Summary

S6 has one High finding, six Medium, and five Low — 12 fixes total from 20 scenarios. The only structural gap is S6-ST-1: a direct contradiction within the slice where three content files describe mutually exclusive approaches to shortlist lifecycle display. PP §2 settles it — the consumer-written `shortlist_items.status` model is authoritative, and the join-based approach in §4.1/§4.4/§4.5 must be corrected. Six Medium findings break into two categories: P4/contract compliance (ST-2 engagement stats gating bypasses CR, ST-3 deferred action column naming, ST-4 sessionId references non-existent property) and documentation completeness (ST-5 downstream flag misattribution, ST-6 missing CR consumer in enquiry table, ST-7 empty-filters semantics). No deduplication was required — all 20 scenarios across the two partitions target distinct boundaries with distinct fixes. Compared to S5 (2 High, 5 Medium, 5 Low from 20 scenarios), S6 is marginally better at the High level (1 vs 2) with one additional Medium finding, consistent with the prediction that UI-heavy slices produce fewer structural gaps. One sibling spec change is required (CR §4.1 `buyerVisibleEngagementStats` field), one SI update (deferred action registration), and one D&L documentation addition — lighter cross-spec impact than S4/S5.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S6-1 | Clean | `search_performed` event emission and D&L consumption verified (S6-ST-18). |
| S6-2 | Fix required (S6-ST-5) | Incorrectly attributes `contact_attempt` consumption to S8/Commercial. Only `enquiry_submitted` has a CR consumer. Fix narrows the flag to the correct event. |
| S6-3 | Clean | D&L engagement counter consumption verified (S6-ST-18, S6-ST-11). |
| S6-4 | Clean | Ops consumption of `contact_attempt` confirmed (S6-ST-15). |
| S6-5 | Clean | S9 entity perception aggregation — no interface boundary concern at S6 level. |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `interfaces/commercial-and-revenue.md` | §4.1 (`TierLimits`) | Add `buyerVisibleEngagementStats: boolean` — `free: false`, `standard: true`, `premium: true`, `partner: true` | S6-ST-2 |
| `interfaces/shared-infrastructure.md` | §2.1 (`DeferredActionParamsMap`) | Add `search_history_cleanup: Record<string, never>` | S6-ST-3 |
| `interfaces/shared-infrastructure.md` | §2.2 (Registered Actions table) | Add row: `Platform | search_history_cleanup | Self-perpetuating, seeded on startup | 24h recurring | once | log` | S6-ST-3 |
| `interfaces/data-and-listings.md` | §3.2 (`getEngagementCounters`) | Add note: "Returns zero-initialised counters for unclaimed listings. Callers may skip the call for unclaimed listings but the interface does not reject them." | S6-ST-11 |
