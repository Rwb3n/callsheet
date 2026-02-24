# S5 Stress Test — Part B (D&L + PP + Internal)

**Agent:** B
**Boundaries:** Data & Listings, Platform & Product, Internal Consistency, Downstream Flags
**Scenarios:** S5-ST-13 through S5-ST-20

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S5-ST-13 | `profile_edited` emission missing `accountId` — P1 violation | **High** | §8.1 | PP §1.7 | S5 emits `profile_edited` without `accountId`; PP spec requires it |
| S5-ST-14 | `enquiry_records` table has no `status` column — S5 queries and filters on nonexistent field | **High** | §5.1, §5.2 | S1 §2.2 | S1 schema defines no `status` column; S5 filters by `unread/responded/stale` |
| S5-ST-15 | `enquiry_response` email template missing from SI §5.2 inventory — total count inconsistency | Medium | §14 | SI §5.2 | S5 adds 1 template but SI inventory stays at 24; should become 25 |
| S5-ST-16 | Notification schema mismatch — S0 has `read: boolean`, S5 uses `readAt`, `dismissed`, `dismissedAt` | **High** | §6.1 | S0 §1.4 | S5 queries columns that do not exist on the `notifications` table |
| S5-ST-17 | `enquiry_responded` payload omits `accountId` — D&L consumer does not need it; pass | Pass | §5.2 | PP §1.4, D&L §2 | PP §1.4 defines no `accountId`; sole consumer (D&L) uses `listingId` + `enquiryId` only |
| S5-ST-18 | `getEngagementCounters` N+1 query pattern in dashboard overview contradicts loading strategy prose | Medium | §2.1, §2.2 | D&L §3.2 | Prose says "single query joins"; code does per-listing function calls in `Promise.all` |
| S5-ST-19 | Optimistic lock race — version check passes but `listing_archived` fires between check and commit | Low | §8.1 | D&L §1.3 | Theoretical; PostgreSQL row-level lock during UPDATE prevents stale mutation |
| S5-ST-20 | Upstream flag S2-5 resolution claims V1 uses content-addressed filenames — S2 already specifies this | Pass | §18 | S2 §4.3 | Resolution is accurate; S2 §4.3 confirms hash-based filenames and immutable cache headers |

---

### S5-ST-13: `profile_edited` emission missing `accountId`

**Severity:** High
**Slice section:** §8.1 (editListing mutation)
**Upstream reference:** PP interface spec §1.7 (`ProfileEditedEvent`)

**Problem:** S5 §8.1 emits `profile_edited` with the following payload:

```typescript
await emit(
  "profile_edited",
  {
    type: "profile_edited",
    listingId,
    changedFields,
    timestamp: new Date().toISOString(),
  },
  waitUntilFn,
)
```

PP §1.7 defines `ProfileEditedEvent` as:

```typescript
type ProfileEditedEvent = {
  type: "profile_edited"
  listingId: UUID
  accountId: UUID    // ← MISSING from S5 emission
  changedFields: string[]
  timestamp: ISO8601
}
```

The `accountId` field is part of the authoritative payload contract. D&L's P1 consumption table (D&L §2) lists `listingId` and `changedFields` as the fields D&L uses, so D&L is unaffected. However, the missing field violates the typed payload contract — `EventPayloadMap` (SI §1.2) expects `ProfileEditedEvent`, and the compiler will reject a payload missing `accountId`. Any future consumer expecting `accountId` would receive `undefined`.

The `accountId` is available in the mutation handler (`ctx.session.userId`), so the fix is a one-line addition.

**Fix — slice:**
- Section: §8.1, `editListing` mutation, `emit()` call
- Old: `{ type: "profile_edited", listingId, changedFields, timestamp: new Date().toISOString() }`
- New: `{ type: "profile_edited", listingId, accountId: ctx.session.userId, changedFields, timestamp: new Date().toISOString() }`

**Fix — sibling specs:** None. The payload type is correct in PP §1.7. The fix is slice-only.

**Acceptance criteria impact:** AC-32 ("Successful edit increments version and emits `profile_edited` with `changedFields` array") should be amended to: "...emits `profile_edited` with `accountId` and `changedFields` array".

---

### S5-ST-14: `enquiry_records` table has no `status` column

**Severity:** High
**Slice section:** §5.1 (getInbox), §5.2 (respondToEnquiry), §5.3 (enquiry_response_reminder handler)
**Upstream reference:** S1 §2.2 (`enquiry_records` schema)

**Problem:** S5 §5.1 queries `enquiryRecords.status` and filters by values `"all" | "unread" | "responded" | "stale"`. S5 §5.2 updates `enquiryRecords.status` to `"responded"`. S5 §5.3 updates `enquiryRecords.status` to `"stale"`.

S1 §2.2 defines `enquiry_records` with no `status` column:

```typescript
export const enquiryRecords = pgTable("enquiry_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderAccountId: uuid("sender_account_id")...,
  senderEmail: text("sender_email"),
  listingId: uuid("listing_id")...,
  subject: text("subject"),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", ...)...,
  respondedAt: timestamp("responded_at", ...),
  responseTimeMinutes: integer("response_time_minutes"),
})
```

S1 uses `respondedAt` (null = unread, non-null = responded) but has no explicit status enum. S5 introduces three states (`unread`, `responded`, `stale`) that require either: (a) a new `status` column on `enquiry_records`, or (b) deriving status from existing columns (`respondedAt IS NULL AND sentAt > now() - 7 days` = unread, `respondedAt IS NOT NULL` = responded, `respondedAt IS NULL AND sentAt <= now() - 7 days` = stale).

Option (b) avoids a schema addition but requires the stale derivation to be consistent with the `enquiry_response_reminder` handler, which currently writes `status: "stale"` — a column that does not exist. The `enquiry_response_reminder` handler would need to become a no-op for status tracking (stale is derived from time), and only handle the reminder email.

Option (a) adds an explicit `status` column. This is a migration on the S1 schema table.

Either way, S5 is broken as written. The code references a column that does not exist.

**Fix — slice:**
- Section: §16 (Schema Additions)
- Add: `status` column to `enquiry_records` via migration, OR document that status is derived from existing columns and rewrite §5.1 query logic accordingly
- Recommended: Add `status` column. The three states are an explicit S5 lifecycle, and future slices (S6 buyer-side, S9 enquiry analytics) benefit from a materialised status.
- New schema addition:

```typescript
// Migration: add status column to enquiry_records (S1 §2.2)
export const enquiryStatusEnum = pgEnum("enquiry_status", [
  "unread", "responded", "stale",
])
// Add to enquiry_records:
status: enquiryStatusEnum("status").notNull().default("unread"),
```

- §5.2 `respondToEnquiry`: `status: "responded"` update is now valid with the new column
- §5.3 `enquiry_response_reminder`: `status: "stale"` update is now valid
- §5.1 `getInbox`: filter by `status` column is now valid

**Fix — sibling specs:** S1 §2.2 needs amendment to note the deferred `status` column (downstream flag from S5), or S5 §16 must explicitly document the migration as an S1 table amendment.

**Acceptance criteria impact:** AC-17 ("Enquiry status filter correctly filters results") depends on this fix. Currently untestable.

---

### S5-ST-15: `enquiry_response` email template missing from SI §5.2 inventory

**Severity:** Medium
**Slice section:** §14 (Email Templates)
**Upstream reference:** SI §5.2 (Template Inventory), PP §4 (Email Template Inventory)

**Problem:** S5 §14 registers 1 new email template: `enquiry_response` (transactional, non-unsubscribable, PP-owned). S5 §14 also states: "Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 24."

The denominator "24" is the current SI §5.2 and PP §4 template inventory count. But S5 adds a new template (`enquiry_response`) that is NOT in either inventory. After S5, the total inventory should be 25 templates, not 24. The "15 of 24" should read "15 of 25" — or more precisely, SI §5.2 and PP §4 should be updated to include `enquiry_response` as the 25th template.

This is the same three-part sync pattern identified in S4-ST-1 (DeferredActionParamsMap): S5 adds infrastructure (template) but the upstream registry does not reflect the addition.

**Fix — slice:**
- Section: §14
- Old: "Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 24."
- New: "Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 25."

**Fix — sibling specs:**
- Document: `shared-infrastructure.md` §5.2
- Section: Platform Transactional table
- Change: Add row `| enquiry_response | Provider responds to enquiry | No |`. Update header to "25 templates".
- Document: `platform-and-product.md` §4.1
- Section: Platform Transactional table
- Change: Add row `| enquiry_response | Provider responds to enquiry | Transactional | No |`. Update header to "25 templates".

**Acceptance criteria impact:** None directly — template registration is infrastructure, not a testable AC. But implementers consulting SI §5.2 for the complete template list will miss `enquiry_response`.

---

### S5-ST-16: Notification schema mismatch — S0 `read: boolean` vs S5 `readAt`, `dismissed`, `dismissedAt`

**Severity:** High
**Slice section:** §6.1 (notification list, dismiss, markRead, getUnreadCount)
**Upstream reference:** S0 §1.4 (`notifications` table), SI §8.1 (`Notification` type)

**Problem:** S0 §1.4 defines the `notifications` table schema:

```typescript
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

SI §8.1 defines the `Notification` type with `read: boolean`.

S5 §6.1 uses four columns that do not exist on this table:

1. `notificationsTable.dismissed` — S5 §6.1 `list` query: `.where(eq(notificationsTable.dismissed, false))`
2. `notificationsTable.readAt` — S5 §6.1 `markRead` mutation: `.set({ readAt: new Date() })`; `getUnreadCount`: `.where(isNull(notificationsTable.readAt), ...)`
3. `notificationsTable.dismissedAt` — S5 §6.1 `dismiss` mutation: `.set({ dismissed: true, dismissedAt: new Date() })`

The S0 schema has only `read: boolean`. S5 requires:
- `readAt: timestamp` (replaces `read: boolean` — read state with timestamp)
- `dismissed: boolean` (soft-delete mechanism)
- `dismissedAt: timestamp` (audit trail for dismiss)

This is a structural gap — S5's notification router code will fail at compile time. Either S0's schema needs amendment (replace `read: boolean` with `readAt: timestamp | null` and add `dismissed`/`dismissedAt` columns), or S5 must add a migration in §16 and use SI §8 as the governing contract for what the notification table should contain.

Additionally, SI §8.1's `Notification` type has `read: boolean` but no `dismissed` or `readAt` fields. The SI type needs updating to match S5's requirements.

**Fix — slice:**
- Section: §16 (Schema Additions)
- Add migration to amend the `notifications` table:

```typescript
// Migration: amend notifications table (S0 §1.4)
// Replace: read: boolean → readAt: timestamp (nullable, null = unread)
// Add: dismissed: boolean, default false
// Add: dismissedAt: timestamp, nullable
```

- S5's code is correct as written once the schema is amended.

**Fix — sibling specs:**
- Document: `shared-infrastructure.md` §8.1
- Section: `Notification` type
- Change: Replace `read: boolean` with `readAt?: ISO8601`. Add `dismissed: boolean` (default false) and `dismissedAt?: ISO8601`.
- Document: `slices/slice-00-infrastructure.md` §1.4 (S0 schema)
- Change: Replace `read: boolean("read").notNull().default(false)` with `readAt: timestamp("read_at", { withTimezone: true })`. Add `dismissed: boolean("dismissed").notNull().default(false)` and `dismissedAt: timestamp("dismissed_at", { withTimezone: true })`. Update partial index from `WHERE read = false` to `WHERE read_at IS NULL AND dismissed = false`.

**Acceptance criteria impact:** AC-23, AC-24, AC-25, AC-26 all depend on this fix. AC-24 specifically tests soft-delete via `dismissed`, which does not exist in the current schema.

---

### S5-ST-17: `enquiry_responded` payload — `accountId` presence check

**Severity:** Pass
**Slice section:** §5.2 (respondToEnquiry)
**Upstream reference:** PP §1.4 (`EnquiryRespondedEvent`), D&L §2 (consumed events)

**Problem tested:** Does S5's `enquiry_responded` emission match PP §1.4's authoritative payload type? Does the payload need `accountId`?

**Finding:** PP §1.4 defines:

```typescript
type EnquiryRespondedEvent = {
  type: "enquiry_responded"
  listingId: UUID
  enquiryId: UUID
  responseTimeMinutes: number
  timestamp: ISO8601
}
```

S5 §5.2 emits:

```typescript
{
  type: "enquiry_responded",
  listingId: input.listingId,
  enquiryId: input.enquiryId,
  responseTimeMinutes: Math.round(responseTime / (1000 * 60)),
  timestamp: new Date().toISOString(),
}
```

The payload matches exactly. D&L §2 lists consumed fields as `listingId`, `enquiryId`, `responseTimeMinutes` — no `accountId` needed. The D&L P1 table confirms this. No issue.

---

### S5-ST-18: Dashboard overview N+1 query pattern contradicts loading strategy

**Severity:** Medium
**Slice section:** §2.1 (loading strategy), §2.2 (tRPC route)
**Upstream reference:** D&L §3.2 (`getEngagementCounters`)

**Problem:** S5 §2.1 states:

> "**Loading strategy:** Single query joins listings + engagement counters for all owned listings. Target: <500ms p95 for up to 50 listings per account."

S5 §2.2 implements the route as:

```typescript
const listings = await db.select()
  .from(listingsTable)
  .where(eq(listingsTable.accountId, ctx.session.userId))

const cards: ListingCardData[] = await Promise.all(
  listings.map(async (listing) => {
    const counters = getEngagementCounters(listing.id)      // 1 call per listing
    const strength = computeProfileStrength(listing.id)      // 1 call per listing
    return { ... }
  })
)
```

This is an N+1 pattern: 1 query for listings, then N calls to `getEngagementCounters` + N calls to `computeProfileStrength`. For an account with 50 listings, this is 1 + 50 + 50 = 101 calls. At D&L §5 NFR of <50ms p95 per engagement counter query, 50 parallel calls should complete in ~50ms (parallelised) but in practice, 50 concurrent DB queries from a single request may saturate the connection pool.

The prose says "single query joins" — this would mean a SQL join between `listings` and `engagements` tables (both are one-to-one), which is the correct implementation for the stated performance target. The code sample contradicts the prose.

Two resolution paths:
1. Amend the code to match the prose: use a SQL join (`listings JOIN engagements ON ...`) and compute profile strength in the same query or batch.
2. Amend the prose to match the code: document the N+1 pattern as acceptable at V1 scale (50 listings max, each call <50ms, parallelised via `Promise.all`).

D&L §3.2 exposes `getEngagementCounters(listingId: UUID)` as a per-listing function. A batch variant (`getEngagementCountersBatch(listingIds: UUID[])`) is not specified. If the join approach is chosen, S5 reads the `engagements` table directly (acceptable — PP owns the tRPC route surface, D&L owns the data; a read join is equivalent to calling the query interface).

**Fix — slice:**
- Section: §2.1
- Old: "**Loading strategy:** Single query joins listings + engagement counters for all owned listings."
- New: "**Loading strategy:** SQL join between `listings` and `engagements` (both keyed by `listing_id`) for all owned listings. Profile strength computed from the joined row. Single query, no per-listing function calls."
- Section: §2.2
- Old: `Promise.all(listings.map(async (listing) => { const counters = getEngagementCounters(listing.id); ... }))`
- New: Single Drizzle query joining `listingsTable` and `engagements` on `listingId`, with `computeProfileStrength` inlined from joined columns. If `computeProfileStrength` requires fields beyond the join (e.g., taxonomy tag count), add those as subqueries or a second batch query.

**Fix — sibling specs:** None. D&L §3.2's per-listing interface remains valid for non-batch callers. The join is an implementation optimisation within PP's route handler.

**Acceptance criteria impact:** AC-5 ("Dashboard overview loads in <500ms p95 for accounts with up to 50 listings") depends on this fix. The N+1 pattern may or may not meet the target, but the prose and code should be consistent regardless.

---

### S5-ST-19: Optimistic lock race — version check passes but `listing_archived` fires concurrently

**Severity:** Low
**Slice section:** §8.1 (editListing mutation)
**Upstream reference:** D&L §1.3 (`listing_archived` event)

**Problem tested:** S5 §8.1 uses `WHERE version = input.version` for optimistic concurrency. If a concurrent `listing_archived` event fires (setting `lifecycleStatus = "archived"`) between the version check and the UPDATE commit, could a provider edit be applied to an archived listing?

**Finding:** PostgreSQL's MVCC guarantees prevent this. The `UPDATE ... WHERE id = $1 AND version = $2` statement acquires a row-level lock. If another transaction archives the listing between the SELECT (which loaded the version) and the UPDATE, the UPDATE will see the new version (incremented by the archival transaction) and `rowCount` will be 0, correctly triggering the CONFLICT error.

The one scenario where this could fail is if `listing_archived` changes `lifecycleStatus` without incrementing `version`. S5 §16.1 adds a `version` column, and S5 §8.1 increments it on every profile edit. But archival (S1's `archiveListing`) does NOT increment `version` — it updates `lifecycleStatus` to `"archived"`. This means the version check PASSES (version unchanged), and the UPDATE succeeds, applying the edit to an archived listing.

However, this is a cosmetic issue at worst: the listing is archived (removed from search), and any edit to an archived listing's profile data has no user-visible effect. The profile edit succeeds but the listing remains archived. The `profile_edited` event fires, triggering quality score recalculation — but quality score changes on archived listings are irrelevant.

A guard could be added (`if (listing.lifecycleStatus === "archived") throw FORBIDDEN`), but S5 already has this pattern for admin-suspended listings (§2.1). The existing `getListing` call in the mutation handler could add an archival check.

**Fix — slice:**
- Section: §8.1, `editListing` mutation
- After ownership check (`listing.accountId !== ctx.session.userId`), add:

```typescript
if (listing.lifecycleStatus === "archived") {
  throw new TRPCError({ code: "FORBIDDEN", message: "cannot edit archived listing" })
}
if (listing.lifecycleStatus === "suspended") {
  throw new TRPCError({ code: "FORBIDDEN", message: "listing is suspended" })
}
```

This is defense-in-depth. The dashboard UI already greys out archived listings (§2.1), but the API should enforce the constraint independently.

**Fix — sibling specs:** None.

**Acceptance criteria impact:** No new AC needed — this is subsumed by AC-3's "admin-suspended listings show no reactivate action" pattern. Consider adding AC: "Editing an archived listing returns FORBIDDEN".

---

### S5-ST-20: Upstream flag S2-5 resolution accuracy

**Severity:** Pass
**Slice section:** §18 (Upstream Flag Resolutions)
**Upstream reference:** S2 §4.3 (Image Processing Pipeline)

**Problem tested:** S5 §18 claims to resolve S2-5 ("CDN cache purge for image replacement") with: "V1 uses content-addressed filenames (hash-based). No purge needed." Is this accurate per S2?

**Finding:** S2 §4.3 specifies:

> "Cache-Control: public, max-age=31536000, immutable (content-addressed filenames)"

S2 uses content-addressed (hash-based) filenames for all image variants. When a provider replaces an image, a new hash-based filename is generated — the old URL is never reused. No CDN cache purge is needed because the old URL simply becomes orphaned (cleaned up by R2 lifecycle rules or explicit deletion).

S5's resolution is accurate. The resolution correctly notes the conditional: "If filename reuse is introduced in a future slice, cache purge must be added." This is a valid guard.

No issue found.
