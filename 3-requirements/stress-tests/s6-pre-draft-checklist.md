# S6 Pre-Draft Checklist — Buyer Experience

**Generated:** 2026-02-14
**Slice:** `slices/slice-06-buyer-experience.md`
**Primary domain:** Platform & Product
**Upstream specs:** `shared-infrastructure.md` (v5), `platform-and-product.md` (v5), `data-and-listings.md` (v4), `operations.md` (v3), `commercial-and-revenue.md` (v2)

---

## 1. Deferred Actions to Register

S6 introduces **no new deferred actions**. Existing deferred actions cover S6's needs:

| Existing Action | Used By S6 | Notes |
|-----------------|-----------|-------|
| `expire_enquiry_queue` (D&L) | Indirectly — S6 submits enquiries; D&L manages the 90-day TTL for unclaimed listing queues | Already registered in SI §2.1/§2.2 |

**Potential new action — `stale_enquiry_check`?** S6 implements the buyer enquiry submission flow. The 14-day stale marking (PP concept design §5.2: `delivered/read → stale: 14 days with no response`) needs a deferred action to trigger the status transition. However, S5 already handles the 7-day `enquiry_response_reminder` (SI §2.1). The stale transition at 14 days may be a separate deferred action or an extension of the existing reminder.

**Decision needed during drafting:** Does the 14-day stale transition require a new `stale_enquiry_mark` deferred action, or does S5's `enquiry_response_reminder` handler cascade to mark stale at 14 days? If new action needed:

**SI §2.1 entry (conditional):**
```typescript
stale_enquiry_mark: { enquiryId: UUID; listingId: UUID }
```

**SI §2.2 row (conditional):**
```
| Platform | `stale_enquiry_mark` | 14 days after enquiry delivery, no response | `once` | `log` |
```

---

## 2. Email Templates to Register

S6 introduces **no new email templates**. All buyer-relevant emails are already registered:

| Template ID | Already In | S6 Usage |
|-------------|-----------|----------|
| `new_enquiry` | SI §5.2 (Platform Transactional) | S6 triggers on enquiry submission to claimed listings |
| `enquiry_forwarded` | SI §5.2 (Platform Transactional) | S6 triggers on enquiry submission to unclaimed listings with email |
| `enquiry_response` | SI §5.2 (Platform Transactional, S5-ST-3) | Buyer receives response notification — triggered by S5 provider response |
| `enquiry_reminder` | SI §5.2 (Platform Transactional) | Provider reminder after 7 days — triggered by S5's deferred action |

**Current count:** 25 templates (SI §5.2). After S6: **25** (no additions).

**Note:** The `enquiry_response` template (added in S5-ST-3) delivers to the buyer when a provider responds. S6 implements the buyer's view of this notification. No new template needed — S6 consumes the existing template's delivery.

---

## 3. Event Emissions

S6 emits events already defined in PP interface spec §1. Verify payload compliance.

| Event | Emitted By | Key Payload Fields | P1 Check |
|-------|-----------|-------------------|----------|
| `search_performed` | PP (S6 search route) | `query`, `filters: SearchFilters`, `resultCount`, `sessionId?`, `timestamp` | All present in PP §1.1 ✓ |
| `profile_viewed` | PP (S6 listing profile page) | `listingId`, `source`, `timestamp` | All present in PP §1.2 ✓ |
| `enquiry_submitted` | PP (S6 enquiry form handler) | `enquiryId`, `listingId`, `timestamp` | All present in PP §1.3 ✓. No PII (senderEmail removed PP-ST-12). |
| `shortlist_added` | PP (S6 shortlist handler) | `listingId`, `accountId`, `timestamp` | All present in PP §1.5 ✓ |
| `contact_attempt` | PP (S6 unclaimed listing feedback) | `listingId`, `result`, `reporterAccountId?`, `timestamp` | All present in PP §1.8 ✓ |

**Critical check:** `enquiry_submitted` must NOT include `senderEmail` or `senderAccountId` — removed per PP-ST-12 (data minimisation). Only `enquiryId` + `listingId` + `timestamp`.

---

## 4. Event Consumers

S6 does **not register new cross-domain event consumers**. Buyer-side features are primarily event emitters (search, enquiry, shortlist, contact attempt), not consumers.

However, S6 implements the **buyer-side shortlist display** that reacts to listing state changes. These consumers are already registered in PP interface spec §2 (S5/earlier slices):

| Event | Consumer | Already Registered | S6 Implementation |
|-------|---------|-------------------|-------------------|
| `listing_archived` | Shortlist update | PP §2 (Async) ✓ | S6 implements the buyer-facing shortlist UI that displays the "archived" status |
| `listing_suspended` | Shortlist warning | PP §2 (Async) ✓ | S6 implements the buyer-facing shortlist UI that displays the "suspended" warning |
| `listing_reactivated` | Shortlist restore | PP §2 (Async) ✓ | S6 implements the buyer-facing shortlist UI that displays restored status |
| `erasure_completed` | Remove from shortlists + notify | PP §2 (Async) ✓ | S6 implements the shortlist removal UI + notification display |

**Key distinction:** The event consumer *handlers* are already registered (they write to `shortlist_items.displayStatus`). S6 provides the *UI* that reads that status and renders accordingly. No new `EVENT_CONSUMER_MATRIX` entries needed.

**Potential new consumer — `enquiry_responded`?** S5 emits `enquiry_responded` (PP §1.4). The buyer dashboard in S6 needs to update the "Enquiries Sent" list to show response status. This may require a PP-internal consumer (same domain, not cross-domain) or may be handled via direct DB read on page load. **Decision needed during drafting.** If event-driven: no matrix entry needed (domain-internal).

---

## 5. Schema Amendments

S6 requires one new table and potentially one new column on an existing table.

### 5.1 New Table: `search_history`

Resolves S1-6 downstream flag. Buyer search history for re-running saved searches and cross-role nudge evaluation.

```typescript
// New table — S6
export const searchHistory = pgTable("search_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query"),                                    // free-text search term
  filters: jsonb("filters").$type<SearchFilters>(),        // typed JSON, SearchFilters from PP §1.1
  resultCount: integer("result_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id, created_at DESC)
// Retention: 12 months per Ops §5. Cleanup via application-level batch delete or deferred action.
```

### 5.2 Existing Table Amendments

| Table | New Column | Type | Default | Source |
|-------|-----------|------|---------|--------|
| `shortlist_items` | `displayStatus` | `shortlistDisplayStatusEnum` (`"active"`, `"archived"`, `"suspended"`) | `"active"` | PP §9.1 `updateShortlistEntries` — buyer-facing display status for listing state changes |

**Note:** `shortlist_items` already has `status` (pgEnum `shortlistItemStatus` from S1-ST-7). The `displayStatus` column is distinct — it tracks the *listing's* lifecycle state for buyer display, not the shortlist item's own state. Verify during drafting whether a separate column is needed or whether the existing `status` can serve both purposes.

### 5.3 Cumulative Schema Snapshot After S6

```typescript
// shortlist_items — authoritative in S1 §2.2, amended by S6
id: serial
shortlistId: uuid (FK → shortlists.id, cascade)
listingId: uuid (FK → listings.id, cascade)
status: shortlistItemStatusEnum ("active", "removed")  // S1
displayStatus: shortlistDisplayStatusEnum ("active", "archived", "suspended")  // S6 — listing lifecycle state
createdAt: timestamp
// Unique: (shortlist_id, listing_id)
// Index: (listing_id)

// enquiry_records — authoritative in S1 §2.2, amended by S5
// S6 reads this table for buyer "Enquiries Sent" view. No S6 amendments.
id: uuid
senderAccountId: uuid (FK → users.id, set null)
senderEmail: text
senderName: text
senderCompany: text
listingId: uuid (FK → listings.id, cascade)
projectType: creditFormatEnum
message: text
budget: text
timeline: text
status: enquiryStatusEnum ("unread", "responded", "stale")  // S5-ST-14
submittedAt: timestamp
// Index: (listing_id, submitted_at DESC)
// Index: (sender_account_id)
// Index: (sender_email) WHERE sender_email IS NOT NULL AND sender_account_id IS NULL

// search_history — new in S6
id: uuid
accountId: uuid (FK → users.id, cascade)
query: text
filters: jsonb
resultCount: integer
createdAt: timestamp
// Index: (account_id, created_at DESC)
```

---

## 6. Upstream Flags to Resolve

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S1-6 | S1 §downstream flags | Buyer facet `searchHistory` table deferred to S6 — requires search UI. 12-month retention policy per Ops §5. | S6 implements the `search_history` table (§5.1 above) + tRPC routes for saving/querying. Add 12-month retention via batch cleanup. |
| S1-10 | S1 §downstream flags | Pending enquiry delivery on claim approval requires PP's `deliverPendingEnquiries(listingId, enquiryIds)` callback. | **Already resolved by S3** (S3 §3.2). S6 does NOT need to re-implement. S6 provides the buyer-side enquiry *submission* form; S3 handles delivery to claimant. |
| S2-2 | S2 §downstream flags | `deliverPendingEnquiries` stub registered in S2. Full implementation in S3 or S6. | **Already resolved by S3** (S3 §3.2). S6 inherits the working implementation. |
| S5-8 | S5 §downstream flags | Enquiry inbox: buyer experience (enquiry submission form, anonymous enquiry flow, shortlist integration) — S5 provides provider-side inbox, S6 provides buyer-side submission. | S6 implements: enquiry form (claimed listings), enquiry forwarding (unclaimed + email), contact fallback (unclaimed + no email), anonymous enquiry handling, "Enquiries Sent" dashboard view with response status tracking. |

**Summary:** 4 upstream flags. 2 already resolved (S1-10, S2-2). 2 require S6 implementation (S1-6, S5-8).

---

## 7. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| PP-Q5 | Analytics / product metrics tooling | **Partially addressable.** S6 implements `search_performed` event emission which feeds analytics. S6 does not resolve the tooling choice — that may defer to S9 or remain open. |
| — | `stale_enquiry_mark` deferred action needed? | S6 drafting decision: determine whether 14-day stale transition is a new deferred action or handled by extending S5's `enquiry_response_reminder` handler. |

No domain open questions are formally assigned to S6. PP-Q5 is the closest but is implementation-level and may resolve alongside S6 without a formal decision.

---

## 8. Drafting Reminders (from stress test patterns)

These recurring issues have appeared in 7 consecutive slices (S0–S5). Check each before finalising v1:

| # | Pattern | Check |
|---|---------|-------|
| 1 | **Three-part sync gap** | If S6 adds deferred actions: add to `DeferredActionParamsMap` (SI §2.1) + registered actions table (SI §2.2) + handler implementation in slice. Currently no new actions expected — verify during drafting. |
| 2 | **P1 payload compliance** | Every `emit()` call must use fields from `EventPayloadMap` (SI §1.2). S6 emits 5 events — verify each payload matches the interface spec exactly. `enquiry_submitted` especially: no PII. |
| 3 | **Prose-code contradictions** | Author prose descriptions and pseudocode together. S4/S5 both had contradictions caught in stress test. |
| 4 | **Schema amendment debt** | S6 adds `search_history` table and potentially `displayStatus` column. Document cumulative schema snapshot. |
| 5 | **N+1 query patterns** | Shortlist display requires joining `shortlist_items` → `listings` for display data. Use batch queries, not per-item lookups. |
| 6 | **UI-heavy slice consideration** | S6 is buyer-facing UI (search, profiles, shortlists, enquiries). S5 (also UI-heavy) had 40% pass rate on stress test. Consider 15 scenarios instead of 20 for stress test if boundaries are well-covered. |
| 7 | **Cross-domain read patterns** | S6 reads from D&L (listing data, engagement counters) and CR (`computeFeatureAccess` for gated contact visibility). These are legitimate query interface calls, not P1 violations. Document each cross-domain read. |

---

## 9. S6 Scope Summary (for drafter orientation)

**Core deliverables** (from tracker + concept design):

1. **Search implementation** — `searchProviders()` tRPC route (public), search results page, filter/sort UI, facet counts, zero-result handling, sponsored section, `search_performed` event emission. [Source: PP concept design §2]
2. **Listing profile page** — public profile rendering, claim/enquiry CTA logic, verification badge display, `profile_viewed` event emission, JSON-LD structured data. [Source: PP concept design §3]
3. **Enquiry submission** — enquiry form (claimed listings), forwarding (unclaimed + email), contact fallback (unclaimed + no email), disputed listing queueing, anonymous enquiry support, spam prevention, `enquiry_submitted` event emission. [Source: PP concept design §5, S5-8]
4. **Shortlist management** — create/rename/delete shortlists, add/remove listings, shortlist display with listing state indicators, `shortlist_added` event emission. [Source: PP concept design §7.2]
5. **Saved searches** — save/re-run searches, last 5 on dashboard. [Source: PP concept design §7.1]
6. **Search history** — `search_history` table, 12-month retention, buyer dashboard "Recent searches" display. [Source: S1-6]
7. **Buyer dashboard section** — "Your Searches & Shortlists" + "Enquiries Sent" sections in the unified dashboard. [Source: PP concept design §6.1]
8. **Contact attempt feedback** — "I reached them" / "I couldn't reach them" buttons on unclaimed listings without email, `contact_attempt` event emission. [Source: PP concept design §5.3, PP-28]
9. **Cross-role nudge** — `evaluateCrossRoleNudge()` for buyer-only accounts (5+ searches in same category → provider creation prompt). [Source: PP concept design §7.3]

**Out of scope for S6:**
- Provider dashboard (S5)
- Admin dashboard (S7)
- Conversion triggers / churn intervention (S8)
- Quality scoring algorithms (S9)
- Account closure orchestration (S10)
- Recommendation engine (V2)
