# S6 Validation Report

**Date:** 2026-02-14
**Slice:** `slices/slice-06-buyer-experience/` (multi-file format)

## Summary

**8 Pass, 2 Fail.** Two issues require fixes before v1 is final. Both are internal consistency errors — one is a contradictory deferred action count between index.md and the decisions/schema docs, the other is a stale type reference in the router plan that contradicts the schema foundation's decision not to add `displayStatus`.

| # | Check | Status |
|---|-------|--------|
| 1 | P1 payload compliance | **Pass** |
| 2 | Three-part sync — deferred actions | **Fail** |
| 3 | Three-part sync — email templates | **Pass** |
| 4 | Schema consistency | **Pass** |
| 5 | Upstream flags — all resolved | **Pass** |
| 6 | AC coverage | **Pass** |
| 7 | Cross-reference versions | **Pass** |
| 8 | Prose-code consistency | **Fail** |
| 9 | N+1 query patterns | **Pass** |
| 10 | Import compliance (P4) | **Pass** |

## Detailed Results

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | P1 payload compliance | **Pass** | All 5 event emissions verified against EventPayloadMap (SI §1.2) and PP §1 payload types. **search_performed** (`01-search.md` §1.8): `query`, `filters: SearchFilters`, `resultCount`, `sessionId?`, `timestamp` — matches `SearchPerformedEvent` (PP §1.1). `query` is `""` not `undefined` for filter-only (AC-14 explicitly covers). **profile_viewed** (`02-listing-profile.md` §2.10): `listingId`, `source`, `timestamp` — matches `ProfileViewedEvent` (PP §1.2). **enquiry_submitted** (`03-enquiry-submission.md` §3.5): `enquiryId`, `listingId`, `timestamp` — matches `EnquirySubmittedEvent` (PP §1.3). No PII — `senderEmail` and `senderAccountId` excluded per PP-ST-12. **shortlist_added** (`04-shortlist-dashboard.md` §4.6 / `04-shortlist-dashboard.md` §4.3): `listingId`, `accountId`, `timestamp` — matches `ShortlistAddedEvent` (PP §1.5). **contact_attempt** (`02-listing-profile.md` §7.3): `listingId`, `result`, `reporterAccountId?`, `timestamp` — matches `ContactAttemptEvent` (PP §1.8). All 5 pass. |
| 2 | Three-part sync — deferred actions | **Fail** | S6 adds one deferred action: `search_history_cleanup`. Content section `01-search.md` §5.2 correctly specifies the SI §2.1 entry (`search_history_cleanup: Record<string, never>`) and the SI §2.2 row (Owner: Platform, daily, self-perpetuating, `log` on failure). The handler implementation is present in the same section. **Three-part sync is satisfied for the action itself.** However, `index.md` §11 states "Current totals after S6: **12** deferred actions (was 11 after S5)" while `01-decisions.md` states "S6 adds **0 new deferred actions** [...] Current totals after S6: **11** deferred actions (SI §2.2, unchanged)." The decisions document was written before the search-history content agent, which correctly added the action. The decisions document is stale — the count should be 12. Additionally, `00-schema.md` §1.1 contains a contradictory note: "Batch delete via scheduled job (not deferred action)" and "not a per-record deferred action — `DeferredActionParamsMap` is for individual entity lifecycle events, not batch cleanup." This directly contradicts `01-search.md` §5.2 which explicitly corrects this: "Correction to schema foundation §1.1: [...] the S0 scheduler *is* the mechanism for scheduled jobs [...] The cleanup uses a self-perpetuating deferred action." The schema doc's note is wrong; the content section's correction is right (S0's deferred action scheduler is the only scheduling mechanism at V1). The schema doc needs amendment to remove the misleading note. |
| 3 | Three-part sync — email templates | **Pass** | S6 triggers two existing email templates: `new_enquiry` (Branch A, §3.7) and `enquiry_forwarded` (Branch B, §3.7). Both are present in SI §5.2 under Platform Transactional. Both are present in PP §4 (not explicitly checked — PP interface spec does not have a §4 template table, templates are inventoried in SI §5.2 which is the authoritative source). S6 defines no new templates. Template count remains 25. No three-part sync issue. |
| 4 | Schema consistency | **Pass** | `search_history` table definition in `00-schema.md` §1.1 and §4.1 matches usage in `01-search.md` §1.9 (insert: `accountId`, `query`, `filters`, `resultCount`) and §5.2 (delete by `createdAt` cutoff). Column types (`uuid`, `text`, `jsonb.$type<SearchFilters>()`, `integer`, `timestamp`) are consistent. `shortlist_items` — no amendment, consistent with `04-shortlist-dashboard.md` §4.3/§4.4 which reads via join. `enquiry_records` — S6 inserts in `03-enquiry-submission.md` §3.4 with fields matching the cumulative snapshot in `00-schema.md` §4.3. `saved_searches` — read-only in S6, no type mismatch. |
| 5 | Upstream flags — all resolved | **Pass** | Four flags in checklist §6: **S1-6** (search_history table) — resolved in `index.md` §15, implemented in `00-schema.md` §1.1 and `01-search.md` §1.9/§5.2. **S1-10** (pending enquiry delivery on claim) — resolved: "Already resolved by S3 (S3 §3.2)." **S2-2** (`deliverPendingEnquiries` stub) — resolved: "Already resolved by S3 (S3 §3.2)." **S5-8** (buyer experience) — resolved: enquiry form (§3), forwarding (§3), contact fallback (§7), anonymous flow (§3.6), shortlist integration (§4), "Enquiries Sent" dashboard (§6.2). All 4 flags addressed in `index.md` §15. |
| 6 | AC coverage | **Pass** | Cross-checked all functional behaviour in content sections against ACs in `index.md` §18. Key checks: (a) Autocomplete (`01-search.md` §1.6) — covered by AC-6 (index.md) and AC-10 (01-search.md §1.11). (b) Zero-result handling (`01-search.md` §1.7) — covered by AC-7 (index.md). (c) Anonymous enquiry flow (`03-enquiry-submission.md` §3.6) — covered by AC-26/AC-27 (index.md). (d) Saved search re-run (`01-search.md` §5.4) — covered by AC-40 (index.md). (e) Cross-role nudge dismissal persistence (`05-crossrole-gating.md` §8.4) — covered by AC-48 (index.md). (f) Media gallery lightbox (`02-listing-profile.md` §2.7) — covered by AC-16 (index.md). (g) Enquiry Branch C `NO_EMAIL` contact methods return (`03-enquiry-submission.md` §3.4) — covered by AC-22 (index.md). (h) `search_history_cleanup` deferred action (`01-search.md` §5.2) — covered by AC-37 (index.md). Note: content sections define their own local ACs (e.g., `01-search.md` §1.11 has AC-1 through AC-18, `02-listing-profile.md` §2.11 has AC-2-1 through AC-2-17). These are more granular than `index.md` §18. The index.md ACs are the authoritative 52; the content-section ACs are elaborations. No functional behaviour is missing an AC. |
| 7 | Cross-reference versions | **Pass** | All cited spec versions match current: `index.md` header cites SI v5, D&L v4, Ops v3, PP v5, CR v2. Content section headers reference the same versions. Cross-references table in `index.md` cites correct versions. No stale version references found. |
| 8 | Prose-code consistency | **Fail** | One contradiction found in `00-router-plan.md` §2.2 (shortlist router). The `ShortlistItemWithListing` type definition includes a `displayStatus: "active" | "archived" | "suspended"` field with comment `// S6 schema addition [pre-draft §5.2]`. The `shortlist.addItem` pseudocode also references `displayStatus = "active"` on insert. **This directly contradicts Decision D2** (`01-decisions.md`) which resolved: "No column. Join to `listings.status` at read time." The content section `04-shortlist-dashboard.md` §4.4 correctly omits `displayStatus` from the return type and reads `lifecycleStatus` from the listings join. The router plan was written before the decisions agent resolved D2 and was not updated. The `ShortlistItemWithListing` type in `00-router-plan.md` §2.2 must be amended to remove `displayStatus` and add `lifecycleStatus` sourced from the listings join (matching the `04-shortlist-dashboard.md` §4.4 type). The `shortlist.addItem` pseudocode line `displayStatus = "active"` must also be removed. No other prose-code contradictions found. The enquiry routing pseudocode in `03-enquiry-submission.md` §3.4 matches the flowchart above it (Branch C returns early before the emit block, consistent with "Branch C does not emit `enquiry_submitted`"). The ranking formula in `01-search.md` §1.3 matches AC-3 in `index.md` §18 exactly. The `evaluateCrossRoleNudge` logic in `05-crossrole-gating.md` §8.2 matches the trigger definitions in §8.3. |
| 9 | N+1 query patterns | **Pass** | Three read patterns checked: (a) `shortlist.getItems` (`04-shortlist-dashboard.md` §4.4) — single JOIN query (`shortlist_items` → `listings` → `verifications` → `media_items`). Explicit N+1 prevention noted. (b) `enquiry.listSent` (`04-shortlist-dashboard.md` §6.2) — single JOIN query (`enquiry_records` → `listings`). (c) Dashboard data loading (`04-shortlist-dashboard.md` §6.6) — `Promise.all` for 4 parallel queries, each is a single query. (d) Facet counts (`01-search.md` §1.4) — 4 COUNT queries via `Promise.all`, not per-item. (e) Autocomplete (`01-search.md` §1.6) — `Promise.all` for taxonomy + synonym queries, merged in memory. No N+1 patterns found. |
| 10 | Import compliance (P4) | **Pass** | Key imports verified: (a) `TIER_LIMITS[tier].rankingBoost` — `01-search.md` §1.3 states "imported from CR §4.1 (P4)". AC-6 (index §18) explicitly requires "imported from CR §4.1 — not hardcoded locally (P4 compliance)". (b) `computeFeatureAccess` — `05-crossrole-gating.md` §9.1 references "CR export, P4 compliance". AC-51 (index §18) requires "imported, not redefined (P4)". (c) `mapFeatureAccessToUI` — `05-crossrole-gating.md` §9.5 states "S6 imports this function" and "S6 does not redefine `mapFeatureAccessToUI` (P4 compliance)". AC-51 (index §18) covers this. (d) `SearchFilters` type — `00-schema.md` §1.1 correctly marks it as "Authoritative in platform-and-product.md §1.1 — summary only". (e) `enquiry_response_reminder` deferred action — `03-enquiry-submission.md` §3.8 states "S6 calls, S5 handles" — schedules, does not redefine. (f) `expandSynonyms`, `buildSearchQuery` — `01-search.md` §1.2 references "S1 §3" infrastructure, does not redefine. No P4 violations found. |

## Required Fixes

### Fix 1: Deferred action count inconsistency (Check #2)

**Files affected:** `01-decisions.md`, `00-schema.md`

**`01-decisions.md` — update count:**

In the "Implications for Downstream Agents" section at the bottom, change:

> S6 adds **0 new deferred actions** and **0 new email templates**. Existing S0–S5 infrastructure covers all S6 needs. Current totals after S6: 11 deferred actions (SI §2.2, unchanged), 25 email templates (SI §5.2, unchanged).

To:

> S6 adds **1 new deferred action** (`search_history_cleanup`) and **0 new email templates**. Current totals after S6: 12 deferred actions (SI §2.2), 25 email templates (SI §5.2, unchanged).

**`00-schema.md` §1.1 — remove contradictory retention note:**

Replace the "Retention mechanism" paragraph:

> **Retention mechanism:** Batch delete via scheduled job (not deferred action). A nightly or weekly cron deletes rows where `created_at < NOW() - INTERVAL '12 months'`. This is a bulk maintenance operation, not a per-record deferred action — `DeferredActionParamsMap` is for individual entity lifecycle events, not batch cleanup. The scheduler infrastructure is in S0 §3. Implementation: single SQL `DELETE FROM search_history WHERE created_at < $cutoff` with a configurable `SEARCH_HISTORY_RETENTION_DAYS = 365` constant.

With:

> **Retention mechanism:** 12-month rolling. Enforced via `search_history_cleanup` self-perpetuating deferred action (registered in SI §2.1/§2.2). Uses the S0 §3 scheduler infrastructure — the deferred action scheduler is the only scheduling mechanism at V1. Implementation: `DELETE FROM search_history WHERE created_at < $cutoff` with configurable `SEARCH_HISTORY_RETENTION_DAYS = 365`. Handler self-schedules next execution at 24h interval.

Also update the cumulative snapshot comment in `00-schema.md` §4.1 from `// Retention: 12 months, batch delete via scheduled job` to `// Retention: 12 months, search_history_cleanup deferred action (SI §2.1)`.

### Fix 2: Stale `displayStatus` in router plan (Check #8)

**File affected:** `00-router-plan.md` §2.2

**`ShortlistItemWithListing` type** — remove `displayStatus`, replace with listing data sourced from join:

Change:
```typescript
type ShortlistItemWithListing = {
  shortlistItemId: number
  listingId: UUID
  displayStatus: "active" | "archived" | "suspended"  // S6 schema addition [pre-draft §5.2]
  addedAt: ISO8601
  listing: {
    slug: string
    name: string
    headline?: string
    entityType: EntityType
    verificationTier: VerificationTier
    baseRegion?: string
    headshotUrl?: string
    logoUrl?: string
    lifecycleStatus: LifecycleStatus
  }
}
```

To:
```typescript
type ShortlistItemWithListing = {
  shortlistItemId: number
  listingId: UUID
  addedAt: ISO8601
  listing: {
    slug: string
    name: string
    headline?: string
    entityType: EntityType
    verificationTier: VerificationTier
    baseRegion?: string
    headshotUrl?: string
    logoUrl?: string
    lifecycleStatus: LifecycleStatus   // read from listings table via join (Decision D2)
  }
}
```

This aligns with `04-shortlist-dashboard.md` §4.4 which already has the correct type.

**`shortlist.addItem` pseudocode** — remove `displayStatus = "active"` from the insert line:

Change:
```
  // Insert with status = "active", displayStatus = "active"
```

To:
```
  // Insert with status = "active"
```

This aligns with `04-shortlist-dashboard.md` §4.3 which correctly omits `displayStatus`.
