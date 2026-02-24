# Slice 6: Buyer Experience

**Status:** Draft v2 (STRESS TESTED)
**Primary Owner:** Platform & Product
**Last updated:** 2026-02-14
**Dependencies:** S0 (event bus, scheduler, auth, email transport, notifications, service abstraction, tRPC, decision logging), S1 (Listing schema, Account schema, engagement counters, search index, taxonomy, shortlists, enquiry_records, search_history stub), S2 (onboarding flow, profile strength meter, anonymous enquiry handling), S4 (subscriptions, feature gating middleware, computeFeatureAccess, TIER_LIMITS)
**Inputs:** `interfaces/shared-infrastructure.md` (v8), `interfaces/platform-and-product.md` (v6), `interfaces/data-and-listings.md` (v5), `interfaces/operations.md` (v4), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/platform-and-product.md` (v5 §2, §3, §5, §6, §7), `2-concept-design/data-and-listings.md` (v6 §1, §3), `2-concept-design/commercial-and-revenue.md` (v4 §4), `slices/slice-01-data-model.md` (v2), `slices/slice-02-onboarding.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S8 (Commercial — conversion triggers, sponsored placement display), S9 (Entity Intelligence — search analytics, quality scoring data from profile_viewed/search_performed events)

---

## Summary

S6 implements the complete buyer-side experience: search, listing profiles, enquiry submission, shortlists, search history, and the buyer dashboard. It is the first slice producing public-facing content pages (SSR search results, SSG+ISR listing profiles) and the first to emit the five buyer-origin events (`search_performed`, `profile_viewed`, `enquiry_submitted`, `shortlist_added`, `contact_attempt`) that feed entity perception and cross-domain analytics. S6 adds one new database table (`search_history`), one deferred action (`search_history_cleanup`), and no new email templates or notification types — all buyer-side communications use existing S0–S5 infrastructure.

The buyer surface is read-heavy: 13 of S6's 18 tRPC routes are reads or queries, 5 are mutations. The enquiry submission flow has the highest routing complexity — a four-branch decision tree based on listing claim status determines whether enquiries are delivered directly, forwarded via email, silently queued, or returned as a contact fallback. Feature gating applies primarily to profile page engagement stats (Standard+ only for buyer-visible display) and search ranking (paid boost from `TIER_LIMITS`). Contact details on claimed listings are never tier-gated — the governing constraint is that claiming must never reduce reachability. [Source: commercial-and-revenue.md — §4.1, PP-5]

Cross-role nudge (`evaluateCrossRoleNudge`) is a pure client-side function that detects buyer-only accounts with concentrated search patterns and surfaces a provider creation prompt. It requires no tRPC routes, no events, and no server-side state — dismissal is localStorage-only. All schema, event, and interface dependencies are satisfied by S0–S5; S6 is a consumer of upstream infrastructure, not a producer of new cross-domain contracts (except `search_history_cleanup` for SI §2.1/§2.2).

## V1 Scope Boundary

**In scope:**
- Full-text search with ranking, faceted filtering, sponsored placement, autocomplete, zero-result handling, and `search_performed` event emission [PP concept design §2]
- Listing profile page with SSG+ISR, verification badges, quality score display, CTA decision tree, JSON-LD structured data, and `profile_viewed` event emission [PP concept design §3]
- Enquiry submission with four routing branches (direct delivery, email forwarding, contact fallback, silent queue), spam prevention, and `enquiry_submitted` event emission [PP concept design §5]
- Shortlist CRUD (10 shortlists, 50 items each), listing state display via join, and `shortlist_added` event emission [PP concept design §7.2]
- Saved searches (max 20 per account) and search history (12-month retention) with `search_history` table and retention cleanup [PP concept design §7.1, S1-6]
- Buyer dashboard sections: "Enquiries Sent", "Your Shortlists", "Recent Searches" / "Saved Searches" [PP concept design §6.1]
- Contact attempt feedback ("I reached them" / "I couldn't reach them") with `contact_attempt` event emission [PP concept design §5.3]
- Cross-role nudge for buyer-only accounts (5+ searches in same category or 20+ total searches) [PP concept design §7.3]
- Feature gating on buyer-visible surfaces: engagement stats visibility (Standard+), ranking boost, sponsored placement eligibility [CR §4.1]

**Deferred:**
- Admin dashboard (S7)
- Conversion triggers, sponsored placement selection logic, churn intervention (S8)
- Analytics pipeline, quality scoring algorithms, search term aggregation, competitor benchmarking data (S9)
- Account closure orchestration (S10)
- Recommendation engine (V2)

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions (new tables, amendments, cumulative snapshot) |
| 00 | `00-router-plan.md` | tRPC routes, file tree, rendering modes, cross-domain read patterns |
| 01 | `01-search.md` | §1 Search Implementation, §5 Saved Searches & Search History |
| 02 | `02-listing-profile.md` | §2 Listing Profile Page, §7 Contact Attempt Feedback |
| 03 | `03-enquiry-submission.md` | §3 Enquiry Submission |
| 04 | `04-shortlist-dashboard.md` | §4 Shortlist Management, §6 Buyer Dashboard |
| 05 | `05-crossrole-gating.md` | §8 Cross-Role Nudge, §9 Feature Gating & Tier-Restricted Display |

---

## 10. Event Consumers Registered in S6

S6 registers no new cross-domain event consumers. S6 is primarily an event *emitter* (5 event types). Buyer-facing features that react to listing state changes (shortlist display, profile page revalidation) consume events already registered by S1–S5. [Source: s6-pre-draft-checklist.md — §4]

| Event | Existing Consumer | Registered In | S6 Implementation |
|-------|-------------------|---------------|-------------------|
| `listing_archived` | Shortlist item status update [XP-15] | PP §2 (Async) | S6 reads `shortlist_items.status` for display; consumer already writes the value |
| `listing_suspended` | Shortlist item status update [XP-15] | PP §2 (Async) | Same pattern — S6 reads, existing consumer writes |
| `listing_reactivated` | Shortlist item restore [XP-15] | PP §2 (Async) | Restores `shortlist_items.status` to `"active"` |
| `erasure_completed` | Shortlist items cascade-deleted (FK) | PP §2 (Async) | S6 returns fewer results on next `shortlist.getItems` call |
| `claim_approved` | Profile page revalidation | SI §7.2 | S6 renders profile page via ISR — revalidation fires on event |
| `listing_suspended` | Profile page revalidation | SI §7.2 | Profile returns 404 for suspended listings |
| `verification_tier_changed` | Profile page revalidation | SI §7.2 | Badge display updates |

**No new `EVENT_CONSUMER_MATRIX` entries required.**

---

## 11. Deferred Actions Registered in S6

S6 registers **one** deferred action for search history retention cleanup. S6 also *schedules* S5's existing `enquiry_response_reminder` on Branch A enquiry submissions (§3.8) but does not register it — the handler is S5's. [Source: 01-search.md — §5.2, 01-decisions.md — D1]

| Action | Params | Handler | Schedule | Retry | On Failure | New? |
|--------|--------|---------|----------|-------|------------|------|
| `search_history_cleanup` | `Record<string, never>` | Delete `search_history` rows older than 365 days, self-schedule next execution | Self-perpetuating daily (seeded on startup) | `once` | `log` — retry next cycle | **Yes** |

**SI §2.1 addition:**
```typescript
search_history_cleanup: Record<string, never>   // no params — bulk operation
```

**SI §2.2 row [S6-ST-3]:**

| Domain | Action | Trigger | Delay | Retry | On Failure |
|--------|--------|---------|-------|-------|------------|
| Platform | `search_history_cleanup` | Self-perpetuating, seeded on startup | 24h recurring | once | log |

**Current totals after S6:** 12 deferred actions (was 11 after S5), 25 email templates (unchanged).

---

## 12. Email Templates Triggered by S6

S6 triggers two existing email templates. No new templates defined. [Source: 03-enquiry-submission.md — §3.7]

| Template ID | Trigger | Recipient | Category | New? |
|-------------|---------|-----------|----------|------|
| `new_enquiry` | Enquiry submission to claimed listing (Branch A) | Provider (listing account email) | Platform Transactional | No — SI §5.2 |
| `enquiry_forwarded` | Enquiry submission to unclaimed listing with email (Branch B) | Listing's `contactEmail` | Platform Transactional | No — SI §5.2 |

**Template count after S6:** 25 (unchanged from S5).

---

## 13. Notification Types Used in S6

S6 uses one existing notification type. No new types defined. The `enquiry_received` notification is triggered by S6's enquiry submission to claimed listings — the notification handler is already registered by S5. [Source: shared-infrastructure.md — §8.1]

| Type | Trigger | Recipient | New? |
|------|---------|-----------|------|
| `enquiry_received` | `enquiry_submitted` event consumed by PP (S5 handler) | Provider (listing owner) | No — SI §8.1 |

---

## 14. Schema Additions

S6 adds one new table and no column amendments to existing tables. Full Drizzle definitions are in `00-schema.md`.

| Change | Table | Description | Source |
|--------|-------|-------------|--------|
| **New table** | `search_history` | Buyer search history — accountId, query, filters (jsonb `SearchFilters`), resultCount, createdAt. Index: `(account_id, created_at DESC)`. 12-month retention via `search_history_cleanup` deferred action. | `00-schema.md` §1.1 |
| **No amendment** | `shortlist_items` | Decision D2: no `displayStatus` column. Listing lifecycle state written to `shortlist_items.status` by PP consumers [XP-15] on `listing_archived`/`listing_suspended`/`listing_reactivated`. Existing `shortlistItemStatusEnum` (S1-ST-7) already has `archived`/`suspended` values. S6 reads `status` directly. [S6-ST-1] | `00-schema.md` §2.1, `01-decisions.md` — D2 |
| **No amendment** | `enquiry_records` | Decision D3: no new consumer needed. `status` column (S5 §16.3) already maintained by S5's response and stale handlers. S6 reads only. | `00-schema.md` §2.2, `01-decisions.md` — D3 |
| **No amendment** | `saved_searches` | S6 reads and writes but adds no columns. Type alignment note: `filters` column annotation should be tightened to `$type<SearchFilters>()` at implementation time. | `00-schema.md` §2.3 |

**New pgEnums:** None. All required enums exist from S1/S5.

---

## 15. Upstream Flag Resolutions

| Flag | Source | Resolution |
|------|--------|-----------|
| S1-6 | S1 §downstream flags — buyer `searchHistory` table deferred to S6 | **Resolved.** S6 implements the `search_history` table (`00-schema.md` §1.1), recording logic in `search.query` (§1.9), dashboard display (§6.4), and 12-month retention via `search_history_cleanup` deferred action (§5.2). |
| S1-10 | S1 §downstream flags — pending enquiry delivery on claim approval | **Already resolved by S3** (S3 §3.2). S6 does not re-implement. S6 provides buyer-side enquiry *submission*; S3 handles delivery to claimant on `claim_approved`. |
| S2-2 | S2 §downstream flags — `deliverPendingEnquiries` stub | **Already resolved by S3** (S3 §3.2). S6 inherits the working implementation. |
| S5-8 | S5 §downstream flags — buyer experience: enquiry submission, anonymous flow, shortlist integration | **Resolved.** S6 implements: enquiry form (claimed listings, §3), forwarding (unclaimed + email, §3), contact fallback (unclaimed + no email, §7), anonymous enquiry handling (§3.6), "Enquiries Sent" dashboard view (§6.2), shortlist management with listing state display (§4). |

---

## 16. Downstream Flags

| # | Flag | Target Slice | Source |
|---|------|-------------|--------|
| S6-1 | Sponsored placement selection logic — S6 renders the sponsored section (§1.5) and `isSponsored` flag on result cards. S8 implements the commercial logic for sponsored placement bidding, rotation, and impression tracking. | S8 | §1.5, CR concept design §4.4 |
| S6-2 | Conversion trigger from buyer engagement — S6 emits `enquiry_submitted` which CR consumes for the `first_enquiry` conversion trigger (CR §2, CR-X-10). S8 implements the conversion trigger evaluation logic and churn detection that depend on this event. `search_performed`, `profile_viewed`, and `contact_attempt` feed D&L and Ops consumers; S9 aggregates them for entity perception (covered by S6-3, S6-4, S6-5). [S6-ST-5] | S8 | §3.5, CR §2 |
| S6-3 | Search analytics pipeline — S6 emits `search_performed` with query, filters, and resultCount. S9 aggregates these for search term frequency analysis, zero-result pattern detection, and taxonomy gap identification. | S9 | §1.8, D4 |
| S6-4 | PP-Q5 analytics tooling partially addressed — S6 provides event emission infrastructure (`search_performed`, `profile_viewed`, `contact_attempt`). S9 owns the analytics pipeline, aggregation, and tooling decision. | S9 | `01-decisions.md` — D4 |
| S6-5 | Quality scoring data from engagement events — S9 consumes `profile_viewed` and `shortlist_added` as perception signals for quality score calibration and provider benchmarking. | S9 | §2.10, §4.6 |

---

## 17. Open Question Resolutions

| # | Question | Resolution |
|---|----------|-----------|
| PP-Q5 | Analytics / product metrics tooling | **Partially addressed, deferred to S9.** S6 implements the event emission infrastructure: `search_performed` (PP §1.1), `profile_viewed` (PP §1.2), `contact_attempt` (PP §1.8). These events are the raw data sources for analytics. S6 does not resolve the tooling choice (what aggregates and surfaces analytics data) — that is S9's responsibility. PP-Q5 remains open with a note that S6 provides emission coverage. [Source: 01-decisions.md — D4] |

---

## 18. Acceptance Criteria

### §1 Search Implementation (10)

| # | Criterion | Test |
|---|-----------|------|
| AC-1 | `/search` renders SSR with TTFB <500ms p95 for queries against 4,700 listings | Performance |
| AC-2 | Query parameters (`q`, `sectors`, `serviceAreas`, `location`, `sort`, `cursor`) round-trip correctly; invalid filter values silently dropped | Integration |
| AC-3 | Ranking formula: `finalScore = (relevance * 30) + (quality * 0.45) + paidBoost + freshness + coldStart + jitter(±3)`; `TIER_LIMITS[tier].rankingBoost` imported from CR §4.1 (P4 compliance) | Unit |
| AC-4 | Facet counts for sectors, service areas, locations, and verification tiers returned with results; each facet excludes its own dimension from the filter | Integration |
| AC-5 | Sponsored section shows max 3 premium/partner listings matching query, labelled "Sponsored", separate from organic results; sponsored listings also appear at natural organic rank (dual placement) | Integration |
| AC-6 | `search.suggest` returns max 10 autocomplete results from taxonomy + synonyms for prefixes >= 2 characters | Integration |
| AC-7 | Zero-result searches insert a `zero_result_queries` row and return `suggestedFilters` (broadened) + `zeroResultSuggestions` (nearest matches) | Integration |
| AC-8 | `search_performed` event emitted with exact `SearchPerformedEvent` payload: `query` is empty string (not undefined) for filter-only searches, `filters` is `SearchFilters`, `sessionId` is `ctx.session.accountId` for authenticated users or `null` for anonymous [S6-ST-4] | Integration |
| AC-9 | Authenticated searches insert `search_history` row; anonymous searches do not | Integration |
| AC-10 | Only listings with `lifecycle_status = 'active'` appear in search results; `subscriptionTier` never included in client response [PP-1, PP-33] | Integration |

### §2 Listing Profile Page (9)

| # | Criterion | Test |
|---|-----------|------|
| AC-11 | Profile page renders via SSG+ISR with 15-minute revalidation; on-demand revalidation fires for `claim_approved`, `listing_suspended`, `listing_archived`, `listing_reactivated`, `erasure_completed`, `verification_tier_changed` | Integration |
| AC-12 | Profile returns 404 for non-existent slugs, archived listings, suspended listings, and erased listings | Integration |
| AC-13 | CTA renders as "Send Enquiry" for claimed/verified/premium_verified; "Send Enquiry" (forwarded) for unclaimed+email; "Contact Provider" with feedback buttons for unclaimed without email; "Send Enquiry" for disputed (no dispute exposure) | E2E |
| AC-14 | Targeted claim CTA shown when authenticated user's email domain matches listing website domain [PP-18] | Integration |
| AC-15 | Verification badge displays correct tier icon; no badge for unclaimed; quality score displayed only for verified and premium_verified | E2E |
| AC-16 | Media gallery renders thumbnail grid; clicking opens lightbox with full-size image; images filtered by `type = "portfolio"` | E2E |
| AC-17 | JSON-LD `<script>` tag present with `LocalBusiness` for companies and `Person` for freelancers; SEO meta tags include title, description, og:image, canonical URL | Integration |
| AC-18 | `profile_viewed` event emitted server-side with P1-compliant payload (`listingId`, `source`, `timestamp`); NOT emitted during build-time static generation | Integration |
| AC-19 | `inferSource` maps referer to `"search"`, `"shortlist"`, or `"direct"` correctly | Unit |

### §3 Enquiry Submission (8)

| # | Criterion | Test |
|---|-----------|------|
| AC-20 | Branch A (claimed): creates `enquiry_records` row with `status = "unread"`, sends `new_enquiry` email to provider, schedules `enquiry_response_reminder` at 7 days | Integration |
| AC-21 | Branch B (unclaimed+email): sends `enquiry_forwarded` email with claim CTA, queues in `pending_enquiries` with 90-day TTL | Integration |
| AC-22 | Branch C (unclaimed, no email): returns `NO_EMAIL` with contact methods, no `enquiry_records` row created, no `enquiry_submitted` event emitted | Integration |
| AC-23 | Branch D (disputed): enquiry queued silently, buyer sees normal confirmation identical to Branch A | Integration |
| AC-24 | `enquiry_submitted` payload contains only `enquiryId`, `listingId`, `timestamp` — no PII (no `senderEmail`, no `senderAccountId`) [PP-ST-12] | Unit |
| AC-25 | Honeypot non-empty -> rejected; rate limit: 11th enquiry from same email within 1 hour -> rejected; message under 20 chars -> Zod rejects | Unit |
| AC-26 | Anonymous user must provide `senderEmail`; authenticated user `senderEmail` resolved from session (form input ignored); anonymous enquiry stored with `senderAccountId = null` | Integration |
| AC-27 | Inactive listing (`lifecycleStatus !== "active"`) -> `NOT_FOUND` | Unit |

### §4 Shortlist Management (5)

| # | Criterion | Test |
|---|-----------|------|
| AC-28 | `shortlist.create` creates a shortlist; rejects with error when account has 10 shortlists | Integration |
| AC-29 | `shortlist.addItem` inserts with `status = "active"`, emits `shortlist_added` with P1-compliant payload (`listingId`, `accountId`, `timestamp`); rejects duplicate (unique constraint) and at 50 items | Integration |
| AC-30 | `shortlist.removeItem` sets `shortlist_items.status` to `"removed"` (soft delete); `shortlist.delete` cascade-deletes items via FK | Integration |
| AC-31 | `shortlist.getItems` returns listing display data via single JOIN; items with `shortlist_items.status` of `archived`/`suspended` included in results with lifecycle badge; `WHERE si.status != 'removed'` filter (not `= 'active'`) [S6-ST-1] | Integration |
| AC-32 | Shortlist items for archived listings render based on `shortlist_items.status = 'archived'` (consumer-written by PP [XP-15]), not `listings.lifecycleStatus` join; suspended listings show "Unavailable" based on `shortlist_items.status = 'suspended'`; erased listings cascade-deleted (no stale references) [S6-ST-1] | E2E |

### §5 Saved Searches & Search History (5)

| # | Criterion | Test |
|---|-----------|------|
| AC-33 | `search.saveSearch` creates `saved_searches` row; rejects at 20 saved searches per account | Integration |
| AC-34 | `search.deleteSavedSearch` deletes only if `savedSearch.accountId === session.userId`; returns NOT_FOUND otherwise | Integration |
| AC-35 | `searchHistory.list` returns at most `limit` entries (default 10, max 50), ordered by createdAt DESC, for authenticated user only | Integration |
| AC-36 | `searchHistory.clear` deletes all `search_history` rows for the authenticated user and no other accounts | Integration |
| AC-37 | `search_history_cleanup` deferred action deletes rows older than 365 days, self-schedules next execution, and is registered in `DeferredActionParamsMap` (SI §2.1) | Integration |

### §6 Buyer Dashboard (4)

| # | Criterion | Test |
|---|-----------|------|
| AC-38 | `/dashboard/enquiries-sent` displays sent enquiries with status indicators: grey "Awaiting response" (unread), green "Responded" (responded), amber "No response after 7 days" (stale) | E2E |
| AC-39 | `/dashboard/shortlists` displays shortlist summary cards with active item count and most recent addition | E2E |
| AC-40 | `/dashboard/searches` renders "Recent Searches" (last 5 from history) and "Saved Searches" with re-run functionality (navigates to `/search?q=...&sectors=...`) | E2E |
| AC-41 | Dashboard data loading uses `Promise.all` for parallel queries (enquiries, shortlists, history, saved searches); buyer sections visible to all authenticated accounts regardless of provider status | Integration |

### §7 Contact Attempt Feedback (3)

| # | Criterion | Test |
|---|-----------|------|
| AC-42 | Feedback buttons visible only on unclaimed listings without `contactEmail` that have phone or website; not visible on claimed/disputed/unclaimed+email listings | Integration |
| AC-43 | `contact_attempt` event emitted with exact `ContactAttemptEvent` payload (`listingId`, `result`, `reporterAccountId?`, `timestamp`); anonymous users emit with `reporterAccountId: null` | Integration |
| AC-44 | Rate limit: 1 report per user (or IP) per listing per 24 hours; buttons disabled after click with confirmation message | Integration |

### §8 Cross-Role Nudge (4)

| # | Criterion | Test |
|---|-----------|------|
| AC-45 | `evaluateCrossRoleNudge` returns `category_concentration` nudge when account has 5+ searches in same service area within 30 days and 0 listings | Unit |
| AC-46 | `evaluateCrossRoleNudge` returns `engagement_threshold` nudge when account has 20+ searches, 0 listings, and account older than 14 days; category concentration takes priority over engagement threshold | Unit |
| AC-47 | `evaluateCrossRoleNudge` returns `null` when account has any listing (including archived) | Unit |
| AC-48 | Nudge banner does not render when localStorage dismissal is within 90 days; dismiss writes timestamp and removes banner; CTA links to `/dashboard/listings/create` | Integration |

### §9 Feature Gating & Tier-Restricted Display (4)

| # | Criterion | Test |
|---|-----------|------|
| AC-49 | Claimed listing profile page shows phone, email, website, social links regardless of subscription tier (free through partner) [PP-5] | Integration |
| AC-50 | Engagement stats (profile views, enquiries received) hidden on buyer-facing profile page for free-tier listings; visible for standard/premium/partner | Integration |
| AC-51 | Search result cards display identical fields regardless of listing tier; `isSponsored` is the only tier-derived display attribute; `computeFeatureAccess` and `mapFeatureAccessToUI` imported, not redefined (P4) | Code review |
| AC-52 | "Upgrade" CTA on free-tier listing profile visible only to the listing's own account, not to other buyers; "Claim this listing" CTA appears on unclaimed profiles; media/credit display respects tier limits | Integration |

**Total: 52 acceptance criteria.**

---

## 19. Stress Test Resolution Log (v2)

20 scenarios targeting S6's implementation delta against upstream interface specs (SI v5, D&L v4, Ops v3, PP v5, CR v2), prior slices (S0-S5), and concept design (PP §2, §3, §5, §6, §7; D&L §1, §3; CR §4). 1 High, 6 Medium, 5 Low, 8 Pass. 12 fixes applied.

Full analysis: `stress-tests/s6-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S6-ST-1 | Shortlist lifecycle display: internal contradiction between join-based and consumer-written approaches | **High** | Fixed. `04-shortlist-dashboard.md` §4.1/§4.4/§4.5 rewritten to use consumer-written `shortlist_items.status` model (PP §2 authoritative). WHERE clause changed to `!= 'removed'`. `ShortlistItemWithListing` type updated. Display rules reference `shortlist_items.status`. AC-31/AC-32 amended. |
| S6-ST-2 | Engagement stats gating bypasses `FeatureAccess` with hardcoded tier check | **Medium** | Fixed. `05-crossrole-gating.md` §9.3 changed from `listing.subscriptionTier !== "free"` to `access.buyerVisibleEngagementStats === true`. CR §4.1 `TierLimits` updated with new field. |
| S6-ST-3 | `DeferredActionParamsMap` and registered actions table need correct SI §2.2 column naming | **Medium** | Fixed. `index.md` §11 SI §2.2 row updated to use correct columns (Domain/Action/Trigger/Delay/Retry/On Failure). SI §2.1 and §2.2 updated. |
| S6-ST-4 | `search_performed` event `sessionId` field references non-existent `ctx.session.id` | **Medium** | Fixed. `01-search.md` §1.8 and `00-router-plan.md` §2.1 changed to `ctx.session?.accountId ?? null`. AC-8/AC-13 amended. |
| S6-ST-5 | Downstream flag S6-2 incorrectly attributes `contact_attempt` consumption to S8 | **Medium** | Fixed. `index.md` §16 flag S6-2 narrowed to `enquiry_submitted` only (CR consumer CR-X-10). Other events feed D&L/Ops/S9. |
| S6-ST-6 | `enquiry_submitted` consumer list in §3.5 omits CR conversion trigger consumer | **Medium** | Fixed. `03-enquiry-submission.md` §3.5 consumer table expanded to 3 rows: D&L engagement, D&L unclaimed queue, CR first_enquiry trigger. |
| S6-ST-7 | `search_performed` emission — `filters` default `{}` produces semantically ambiguous type | **Medium** | Fixed. `01-search.md` §1.8 note added: empty `{}` is valid `SearchFilters`; consumers treat missing properties as "no filter applied." |
| S6-ST-8 | Search history cleanup deferred action — SI §2.2 `Delay` column undocumented | **Low** | Covered by S6-ST-3 fix (column naming alignment includes Delay value). |
| S6-ST-9 | Rendering strategy TTFB reference cites non-existent `[SI §10]` | **Low** | Fixed. `00-router-plan.md` §3 changed to `[SI §12.1]`. |
| S6-ST-10 | `enquiry_received` notification creation path undocumented in §3 | **Low** | Fixed. `03-enquiry-submission.md` §3.5 note added: S5's async consumer of `enquiry_submitted` creates the notification. |
| S6-ST-11 | `getEngagementCounters` — D&L spec does not document unclaimed-listing behaviour | **Low** | No slice change. D&L §3.2 updated with note: returns zero-initialised counters for unclaimed listings. |
| S6-ST-12 | `pending_enquiries.forwardedAt` null semantics for Branch D undocumented | **Low** | Fixed. `03-enquiry-submission.md` §3.9 note added: `forwardedAt` non-null for Branch B, null for Branch D. |
| S6-ST-13 | `TIER_LIMITS` import for `rankingBoost` and `sponsoredPlacement` — P4 compliance | Pass | Correct. No fix needed. |
| S6-ST-14 | `computeFeatureAccess` usage matches CR §4.2 signature | Pass | Correct. No fix needed. |
| S6-ST-15 | `contact_attempt` event payload P1 compliance against Ops consumer table | Pass | Correct. No fix needed. |
| S6-ST-16 | Email templates — `new_enquiry` and `enquiry_forwarded` in SI §5.2; total count 25 | Pass | Correct. No fix needed. |
| S6-ST-17 | ISR revalidation trigger list: S6 §2.1 lists 6 events; SI §7.2 lists 7 including inline `profile_edited` | Pass | Correct. No fix needed. |
| S6-ST-18 | `search_performed` D&L consumption — zero-result tracking confirmed in D&L §2 | Pass | Correct. No fix needed. |
| S6-ST-19 | Email templates `new_enquiry` and `enquiry_forwarded` registered in PP §4.1 with correct IDs | Pass | Correct. No fix needed. |
| S6-ST-20 | Deferred action count verified: 11 + `search_history_cleanup` = 12 | Pass | Correct. No fix needed. |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `interfaces/platform-and-product.md` (v5) | Emitted events §1 (`search_performed`, `profile_viewed`, `enquiry_submitted`, `shortlist_added`, `contact_attempt`), query interfaces §3, email templates §4, account closure §5, rendering strategy §7. S6 implements buyer-side event emissions and reads listing data via PP query interfaces. |
| `interfaces/data-and-listings.md` (v4) | `getEngagementCounters` query §3.1 (S6 calls for profile page display), `pending_enquiries` table (S6 queues Branch B/D enquiries), emitted events consumed by PP §1 (`listing_archived`, `listing_suspended`, `listing_reactivated` — S6 renders the effects via shortlist status and ISR revalidation). |
| `interfaces/commercial-and-revenue.md` (v2) | `TIER_LIMITS` §4.1 (S6 imports `rankingBoost` for search ranking, `sponsoredPlacement` for sponsored section eligibility), `computeFeatureAccess` §4.2 (S6 imports for feature gate UI on profile pages). |
| `interfaces/operations.md` (v3) | `contact_attempt` event consumed by Ops (outreach prioritisation for unreachable unclaimed listings). Search history retention policy (12 months, §5). |
| `interfaces/shared-infrastructure.md` (v5) | Event bus §1 (S6 emits 5 events), deferred actions §2 (S6 adds `search_history_cleanup`), email transport §5 (S6 triggers 2 templates), rendering strategy §7 (ISR config, on-demand revalidation), notifications §8 (`enquiry_received` type). |
| `slices/slice-00-infrastructure.md` (v2) | Event bus §2, deferred actions §3 (self-perpetuating pattern for `search_history_cleanup`), notifications §8, tRPC §12. |
| `slices/slice-01-data-model.md` (v2) | Listing schema §1.2, search infrastructure §3 (tsvector, synonyms, zero_result_queries), engagement counters §1.6, shortlists/shortlist_items §2.2, enquiry_records §2.2, saved_searches §2.2. Upstream flag S1-6 resolved. |
| `slices/slice-02-onboarding.md` (v2) | Anonymous enquiry linking §2.3 (`linkAnonymousEnquiries`). Upstream flags S1-10, S2-2 already resolved by S3. |
| `slices/slice-03-claim-verify.md` (v2) | `deliverPendingEnquiries` §3.2 — S6 queues enquiries in `pending_enquiries`; S3 delivers on `claim_approved`. |
| `slices/slice-04-subscriptions.md` (v2) | Feature gating §4 (`enforceFeatureGate`, `checkFeatureAccess`), `TIER_LIMITS` §3.2. S6 imports for ranking boost and feature gate UI. |
| `slices/slice-05-provider-experience.md` (v2) | Enquiry status lifecycle §5.2–§5.3 (S6 reads `enquiry_records.status`), `enquiry_response_reminder` §5.3 (S6 schedules on Branch A submission), dashboard layout §2 (S6 buyer sections inherit auth guard), `mapFeatureAccessToUI` §11 (S6 imports). Upstream flag S5-8 resolved. |
