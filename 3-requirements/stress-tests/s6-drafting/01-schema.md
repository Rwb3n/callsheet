# S6 Schema Foundation

**Phase:** 1 (Foundations)
**Agent:** Schema
**Written:** 2026-02-14
**Inputs:** `s6-pre-draft-checklist.md` §5, `slice-01-data-model.md` §1–§2, `slice-05-provider-experience.md` §16, `platform-and-product.md` §1.1 (`SearchFilters`)

---

## 1. New Tables

### 1.1 search_history

Resolves upstream flag S1-6. Stores buyer search history for dashboard display ("Recent searches"), saved search comparison, and cross-role nudge evaluation (`evaluateCrossRoleNudge` reads category frequency from this table). 12-month retention per Ops §5.

```typescript
// src/db/schema/buyer.ts

export const searchHistory = pgTable("search_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query"),                                       // nullable — buyer may filter without typing a search term
  filters: jsonb("filters").$type<SearchFilters>(),           // typed JSON; SearchFilters from PP interface spec §1.1
  resultCount: integer("result_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id, created_at DESC) — dashboard queries: "last N searches for this account"
```

**`SearchFilters` type** (authoritative in PP interface spec §1.1 — summary only):

```typescript
// Authoritative in platform-and-product.md §1.1 — summary only
type SearchFilters = {
  sectors?: string[]
  serviceAreas?: string[]
  specialisations?: string[]
  location?: string               // region or postcode
}
```

**Retention mechanism:** Batch delete via scheduled job (not deferred action). A nightly or weekly cron deletes rows where `created_at < NOW() - INTERVAL '12 months'`. This is a bulk maintenance operation, not a per-record deferred action — `DeferredActionParamsMap` is for individual entity lifecycle events, not batch cleanup. The scheduler infrastructure is in S0 §3. Implementation: single SQL `DELETE FROM search_history WHERE created_at < $cutoff` with a configurable `SEARCH_HISTORY_RETENTION_DAYS = 365` constant.

**Row volume estimate:** At V1 scale (~200 accounts), assuming 10 searches/account/month = 2,000 rows/month. 12-month retention = ~24,000 rows max. No partitioning needed.

---

## 2. Existing Table Amendments

### 2.1 shortlist_items — No Amendment Required

**Decision: Do NOT add a `displayStatus` column.**

The pre-draft checklist §5.2 flagged a potential `displayStatus` column (`shortlistDisplayStatusEnum`: "active", "archived", "suspended") to track the listing's lifecycle state for buyer display. This column is unnecessary for two reasons:

**Reason 1 — S1-ST-7 already covers these states.** The `shortlistItemStatusEnum` (S1 §1.1) has four values: `"active"`, `"archived"`, `"suspended"`, `"removed"`. The S1 stress test specifically added `"archived"` and `"suspended"` to the enum for this purpose. The existing `status` column already encodes both the item's own lifecycle (`active` → `removed` when buyer removes) and the listing's lifecycle state (`active` → `archived`/`suspended` when listing state changes). The PP interface spec §2 consumers for `listing_archived`, `listing_suspended`, and `listing_reactivated` (all tagged `[XP-15]`) write to this column.

**Reason 2 — A separate column creates sync risk without benefit.** If `displayStatus` existed alongside `status`, every listing state change event consumer would need to update `displayStatus` while leaving `status` unchanged, and every buyer removal action would update `status` while leaving `displayStatus` unchanged. Two columns tracking overlapping state on the same row is a consistency hazard. The single `status` column with four values is unambiguous: `active` (listing live, item in shortlist), `archived` (listing archived by provider), `suspended` (listing suspended by admin), `removed` (item removed by buyer).

**Consumer mapping (existing — no S6 changes):**

| Event | Consumer Action | `shortlist_items.status` Transition |
|-------|----------------|-------------------------------------|
| `listing_archived` | Mark in buyer shortlists [XP-15] | `active` → `archived` |
| `listing_suspended` | Mark in buyer shortlists [XP-15] | `active` → `suspended` |
| `listing_reactivated` | Restore in buyer shortlists [XP-15] | `archived`/`suspended` → `active` |
| `erasure_completed` | Permanently remove [XP-15] | Row deleted (FK cascade from `listings.id`) |

S6 reads `shortlist_items.status` to render the correct display state in the shortlist UI. No join to `listings.status` needed for display — the event consumers keep `shortlist_items.status` current.

### 2.2 enquiry_records — No Amendment

S6 reads `enquiry_records` for the "Enquiries Sent" buyer dashboard view. The table is authoritative in S1 §2.2 with S5's `status` column addition (S5 §16.3). S6 adds no columns.

### 2.3 saved_searches — No Amendment

S6 reads `saved_searches` for the "Saved Searches" buyer dashboard view and re-run functionality. The table is authoritative in S1 §2.2. S6 adds no columns.

**Type alignment note:** S1 §2.2 types `saved_searches.filters` as `Record<string, unknown>`. S6's search implementation uses `SearchFilters` (PP §1.1). At implementation time, the `saved_searches.filters` column type annotation should be tightened to `$type<SearchFilters>()` for consistency with `search_history.filters`. This is a type annotation change, not a schema migration — the underlying `jsonb` column is unchanged. Flag for S6 implementation.

---

## 3. pgEnum Additions

**None.** S6 introduces no new enums. All required enums already exist:

| Enum | Defined In | S6 Usage |
|------|-----------|----------|
| `shortlistItemStatusEnum` | S1 §1.1 (S1-ST-7) | Read for shortlist display state |
| `enquiryStatusEnum` | S5 §16.3 | Read for "Enquiries Sent" status display |
| `lifecycleStatusEnum` | S1 §1.1 | Read via `listings.lifecycleStatus` for profile page display |
| `verificationTierEnum` | S1 §1.1 | Read via `verifications.tier` for badge display |
| `subscriptionTierEnum` | S1 §1.1 | Read via `listings.subscriptionTier` for feature gating context |

---

## 4. Cumulative Schema Snapshot After S6

All tables S6 touches, showing full column state after all amendments through S6.

### 4.1 search_history (NEW — S6)

```typescript
export const searchHistory = pgTable("search_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query"),                                       // nullable
  filters: jsonb("filters").$type<SearchFilters>(),           // PP §1.1
  resultCount: integer("result_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id, created_at DESC)
// Retention: 12 months, batch delete via scheduled job
```

### 4.2 shortlist_items (NO AMENDMENT — authoritative in S1 §2.2)

```typescript
export const shortlistItems = pgTable("shortlist_items", {
  id: serial("id").primaryKey(),
  shortlistId: uuid("shortlist_id").notNull().references(() => shortlists.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  status: shortlistItemStatusEnum("status").notNull().default("active"),  // [S1-ST-7]: "active" | "archived" | "suspended" | "removed"
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
})
// Unique: (shortlist_id, listing_id)
// Index: (listing_id) — for shortlist updates on listing state changes
```

S6 reads `status` to render shortlist items with correct display state. Writes only on buyer actions: `shortlist_added` (insert row with `status = "active"`) and shortlist item removal (`status` → `"removed"`).

### 4.3 enquiry_records (NO AMENDMENT — authoritative in S1 §2.2, amended by S5 §16.3)

```typescript
export const enquiryRecords = pgTable("enquiry_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderAccountId: uuid("sender_account_id").references(() => users.id, { onDelete: "set null" }),
  senderEmail: text("sender_email"),                          // for anonymous enquiries (no account)
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body").notNull(),
  status: enquiryStatusEnum("status").notNull().default("unread"),  // S5 §16.3: "unread" | "responded" | "stale"
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  responseTimeMinutes: integer("response_time_minutes"),
})
// Index: (sender_account_id) WHERE sender_account_id IS NOT NULL
// Index: (listing_id, sent_at DESC)
// Index: (sender_email) WHERE sender_email IS NOT NULL AND sender_account_id IS NULL
```

S6 reads this table for the buyer "Enquiries Sent" dashboard view, filtering by `sender_account_id = currentUser.id`. S6 reads `status` to display response state. S6 inserts new rows on enquiry submission. S6 does not modify existing rows.

### 4.4 saved_searches (NO AMENDMENT — authoritative in S1 §2.2)

```typescript
export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query"),
  filters: jsonb("filters").$type<Record<string, unknown>>(),  // see §2.3 type alignment note
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)
```

S6 reads for "Saved Searches" dashboard display. S6 writes on save action. S6 re-runs saved searches by extracting `query` + `filters` and passing to `searchProviders()`.

---

## 5. Cross-Domain Read Dependencies

Tables S6 reads from but does not own or amend. Listed for completeness — these are query interface calls, not schema amendments.

| Table | Owner | S6 Read Purpose |
|-------|-------|----------------|
| `listings` | D&L (S1 §1.2) | Profile page rendering, search results, shortlist display joins |
| `verifications` | D&L (S1 §1.3) | Verification badge on profile page and search results |
| `qualityScores` | D&L (S1 §1.4) | Search ranking (quality_boost component) |
| `engagements` | D&L (S1 §1.6) | Profile page engagement display (for verified listings) |
| `listingTaxonomyTags` | D&L (S1 §1.7) | Search filtering by sector/service area/specialisation, facet counts |
| `taxonomySectors` / `taxonomyServiceAreas` / `taxonomySpecialisations` | D&L (S1 §1.7) | Filter UI label display, facet count labels |
| `credits` | D&L (S1 §1.8) | Profile page credits section |
| `mediaItems` | D&L (S1 §1.9) | Profile page gallery/portfolio display |
| `socialProfiles` | D&L (S1 §1.10) | Profile page social links |
| `accreditations` | D&L (S1 §1.11) | Profile page accreditations display |
| `searchSynonyms` | D&L (S1 §3.3) | Query expansion in `searchProviders()` |
| `shortlists` | S1 §2.2 | Shortlist management (parent table for shortlist_items) |
| `accountProfiles` | S1 §2.1 | Buyer dashboard display name |
