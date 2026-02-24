# S5 Stress Test — Provider Experience

**Slice:** `slices/slice-05-provider-experience.md` (v1)
**Tested against:** `shared-infrastructure.md` (v4), `data-and-listings.md` (v4), `operations.md` (v3), `platform-and-product.md` (v4), `commercial-and-revenue.md` (v2)
**Date:** 2026-02-14
**Scenarios:** 20 (raw from agents), 18 unique (2 duplicates removed), +2 added during merge/validation = 20 total
**Severity distribution:** 6 High, 4 Medium, 2 Low, 8 Pass
**Total fixes:** 12

**Duplicates removed:**
- S5-ST-3 (Agent A) ≡ S5-ST-15 (Agent B): `enquiry_response` template missing from SI/PP inventory → kept as S5-ST-3 (High)
- S5-ST-5 (Agent A) ≡ S5-ST-16 (Agent B): Notification schema mismatch → kept as S5-ST-5 (High, Agent B's deeper analysis)

---

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S5-ST-1 | DeferredActionParamsMap missing S5 entries | High | §13 | SI §2.1 | `listing_update_reminder` and `enquiry_response_reminder` not in SI `DeferredActionParamsMap` |
| S5-ST-2 | SI §2.2 registered actions table missing S5 rows | High | §13 | SI §2.2 | Two deferred actions not in the registered actions table |
| S5-ST-3 | `enquiry_response` template missing from SI §5.2 and PP §4 inventory | High | §14 | SI §5.2, PP §4 | Template not registered; total should be 25 not 24 |
| S5-ST-4 | `PaymentService.getCustomerPortalUrl` not in SI §10.1 | Medium | §7.3 | SI §10.1 | S5 extends PaymentService but SI does not document the method |
| S5-ST-5 | Notification schema mismatch — `read: boolean` vs `readAt`/`dismissed`/`dismissedAt` | High | §6.1 | SI §8.1, S0 §1.4 | S0 schema has `read: boolean`; S5 uses `readAt`, `dismissed`, `dismissedAt` — three columns that do not exist |
| S5-ST-6 | S5 notification types vs SI §8.1 — all 7 present | Pass | §15 | SI §8.1 | All 7 notification types exist in SI §8.1 |
| S5-ST-7 | `computeFeatureAccess` P4 import — simplified signature | Pass | §1.3, §11 | CR §4.2 | Correctly imports `computeFeatureAccess(tier: SubscriptionTier)` per CR-ST-9 |
| S5-ST-8 | `mapFeatureAccessToUI` missing `prioritySupport` field | Medium | §11 | CR §4.2 | `prioritySupport` in `FeatureAccess` not mapped to `UIFeatureMap` |
| S5-ST-9 | Analytics tier table vs TIER_LIMITS — field alignment | Pass | §3.1 | CR §4.1 | Tier summary table matches `TIER_LIMITS` exactly |
| S5-ST-10 | Account closure initiation matches SI §13.2 and PP §5 | Pass | §10.2 | SI §13.2, PP §5 | Correctly delegates to orchestrated flow engine |
| S5-ST-11 | `getSubscriptionStatus` data source — intra-PP call | Pass | §7.1 | Ops §3 | S4 tRPC route, not cross-domain query. Correctly scoped |
| S5-ST-12 | EVENT_CONSUMER_MATRIX — `profile_edited` handler expansion undocumented | Medium | §12, §9.2 | SI §1.5 | S5 adds 90-day reminder to existing PP consumer; expanded scope not documented |
| S5-ST-13 | `profile_edited` emission missing `accountId` — P1 violation | High | §8.1 | PP §1.7 | Payload missing `accountId`; compiler will reject against `EventPayloadMap` |
| S5-ST-14 | `enquiry_records` table has no `status` column | High | §5.1, §5.2 | S1 §2.2 | S1 schema has no `status`; S5 queries and updates nonexistent column |
| S5-ST-15 | `enquiry_responded` payload matches PP §1.4 exactly | Pass | §5.2 | PP §1.4 | No `accountId` needed by any consumer |
| S5-ST-16 | Dashboard overview N+1 query contradicts loading strategy | Medium | §2.1, §2.2 | D&L §3.2 | Prose says "single query joins"; code does per-listing calls in `Promise.all` |
| S5-ST-17 | Optimistic lock race with concurrent archival | Low | §8.1 | D&L §1.3 | Archival doesn't increment version; edit to archived listing succeeds silently |
| S5-ST-18 | Upstream flag S2-5 resolution accuracy | Pass | §18 | S2 §4.3 | Content-addressed filenames confirmed. Resolution is accurate |
| S5-ST-19 | Upstream flag S4-1/S4-2 resolution completeness | Pass | §18 | S4 §3.1 | S4-1 resolved (subscription panel). S4-2 partially resolved (notification surface only, intervention logic deferred to S8). Accurate |
| S5-ST-20 | Enquiry response email sent to null `senderEmail` after GDPR erasure | Low | §5.2 | PP §1.9, D&L §1.9 | `respondToEnquiry` sends email to `enquiry[0].senderEmail` without null check; post-erasure anonymised enquiries have null senderEmail |

---

### S5-ST-1: DeferredActionParamsMap missing S5 deferred actions

**Severity:** High
**Slice section:** §13
**Upstream reference:** SI §2.1 (`DeferredActionParamsMap`)

**Problem:** S5 §13 registers two deferred actions — `listing_update_reminder` and `enquiry_response_reminder` — and documents the `DeferredActionParamsMap` extension with correct types. However, SI §2.1 `DeferredActionParamsMap` (currently 9 entries, last additions from S4-ST-1) does not include these entries. Without adding them, the TypeScript compiler will reject `scheduleDeferredAction("listing_update_reminder", ...)` calls at build time. This is the sixth occurrence of the three-part sync pattern (S0, S2, S3, S4, cross-interface, now S5).

**Fix — slice:**
- No slice change needed. S5 §13 correctly documents the extension.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add two entries:
  ```
  listing_update_reminder: { listingId: UUID }
  enquiry_response_reminder: { enquiryId: UUID; listingId: UUID }
  ```

**Acceptance criteria impact:** None — S5 ACs already test the deferred actions (AC-35, AC-36, AC-37, AC-20, AC-21).

---

### S5-ST-2: SI §2.2 registered actions table missing S5 rows

**Severity:** High
**Slice section:** §13
**Upstream reference:** SI §2.2 (Registered Actions by Domain)

**Problem:** SI §2.2 registered actions table contains 9 actions. S5 §13 specifies two additions with owner, schedule, retry, and onFailure values. These rows are not yet in SI §2.2. Second part of the three-part sync pattern.

**Fix — slice:**
- No slice change needed. S5 §13 already documents the intended rows.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.2 (Registered Actions by Domain table)
- Change: Add two rows:
  ```
  | Platform | `listing_update_reminder` | 90 days after profile edit (recurring via self-scheduling) | `once` | `log` |
  | Platform | `enquiry_response_reminder` | 7 days after enquiry delivery | `once` | `log` |
  ```

**Acceptance criteria impact:** None.

---

### S5-ST-3: `enquiry_response` template missing from SI §5.2 and PP §4 inventory

**Severity:** High
**Slice section:** §14, §5.4
**Upstream reference:** SI §5.2 (Template Inventory — 24 templates), PP §4 (Email Template Inventory — 24 templates)

**Problem:** S5 §14 registers 1 new email template: `enquiry_response` (transactional, non-unsubscribable, PP-owned). SI §5.2 and PP §4 currently list 24 templates; `enquiry_response` is not among them. After adding it, the master inventory should be 25. S5 §14 claims "15 of 24" — should read "15 of 25".

The existing templates `listing_update_reminder` and `enquiry_reminder` are correctly noted as already registered in SI §5.2 / PP §4. Only `enquiry_response` is genuinely new.

**Fix — slice:**
- Section: §14
- Old: `Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 24.`
- New: `Template count after S5: S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 25.`

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2 Platform Transactional table
- Change: Add row `| enquiry_response | Provider responds to enquiry | No |`. Update header from "24 templates" to "25 templates". Update `EmailTemplateId` comment.
- Document: `interfaces/platform-and-product.md`
- Section: §4.1 Platform Transactional table
- Change: Add row `| enquiry_response | Provider responds to enquiry via dashboard | Transactional | No |`. Update summary from "24 templates" to "25 templates".

**Acceptance criteria impact:** AC-18 tests the enquiry response flow including email send.

---

### S5-ST-4: `PaymentService.getCustomerPortalUrl` not documented in SI §10.1

**Severity:** Medium
**Slice section:** §7.3
**Upstream reference:** SI §10.1 (`PaymentService`)

**Problem:** S5 §7.3 extends `PaymentService` with `getCustomerPortalUrl`. SI §10.1 currently defines `PaymentService` with three methods (`createCheckoutSession`, `cancelSubscription`, `listSubscriptions`). S5 flags this as downstream flag S5-9, but the fix should be applied during the stress test fix phase rather than deferred — the service abstraction layer is incomplete without it, and test mocks (SI §10.2) will not include the method.

**Fix — slice:**
- Section: §19, downstream flag S5-9
- Old: `S5-9 | PaymentService.getCustomerPortalUrl — SI §10.1 amendment for customer portal URL generation | SI update | §7.3`
- New: Remove S5-9 from downstream flags (resolved by stress test fix). Add note in §7.3: "Applied to SI §10.1 during S5 stress test."

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §10.1 `PaymentService`
- Change: Add method:
  ```typescript
  getCustomerPortalUrl(params: {
    paddleCustomerId: string
  }): Promise<string>
  ```

**Acceptance criteria impact:** AC-30 tests the Paddle portal link.

---

### S5-ST-5: Notification schema mismatch — `read: boolean` vs `readAt`/`dismissed`/`dismissedAt`

**Severity:** High
**Slice section:** §6.1 (notification list, dismiss, markRead, getUnreadCount)
**Upstream reference:** SI §8.1 (`Notification` type), S0 §1.4 (`notifications` table schema)

**Problem:** S0 §1.4 defines the `notifications` table with `read: boolean("read").notNull().default(false)`. SI §8.1 defines the `Notification` type with `read: boolean`. S5 §6.1 uses four columns that do not exist:

1. `notificationsTable.dismissed` — `list` query filters on `dismissed === false`
2. `notificationsTable.readAt` — `markRead` mutation sets `readAt: new Date()`
3. `notificationsTable.dismissedAt` — `dismiss` mutation sets `dismissed: true, dismissedAt: new Date()`
4. `getUnreadCount` uses `isNull(notificationsTable.readAt)` instead of `eq(read, false)`

S5 requires separate read and dismiss states: a notification can be read but still visible; dismiss removes it from the list. The simple `read: boolean` model is insufficient. S5's notification router code will fail at compile time.

**Fix — slice:**
- Section: §16 (Schema Additions)
- Add: Notification table migration:
  ```typescript
  // Migration: amend notifications table (S0 §1.4)
  // Remove: read: boolean
  // Add: readAt: timestamp("read_at", { withTimezone: true })  — null = unread
  // Add: dismissed: boolean("dismissed").notNull().default(false)
  // Add: dismissedAt: timestamp("dismissed_at", { withTimezone: true })
  ```

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §8.1 `Notification` type
- Change: Replace `read: boolean` with:
  ```typescript
  readAt?: ISO8601           // null = unread
  dismissed: boolean         // true = soft-deleted from list, default false
  dismissedAt?: ISO8601
  ```
  Remove `read: boolean`.
- Document: `slices/slice-00-infrastructure.md`
- Section: §1.4 (`notifications` table)
- Change: Replace `read: boolean("read").notNull().default(false)` with `readAt: timestamp("read_at", { withTimezone: true })`. Add `dismissed: boolean("dismissed").notNull().default(false)` and `dismissedAt: timestamp("dismissed_at", { withTimezone: true })`. Update partial index from `WHERE read = false` to `WHERE read_at IS NULL AND dismissed = false`.

**Acceptance criteria impact:** AC-23, AC-24, AC-25, AC-26 all depend on this fix.

---

### S5-ST-8: `mapFeatureAccessToUI` missing `prioritySupport` field

**Severity:** Medium
**Slice section:** §11
**Upstream reference:** CR §4.2 (`FeatureAccess = TierLimits & { ... }`)

**Problem:** CR §4.1 `TierLimits` includes `prioritySupport: boolean` (Partner-only). S5 §11's `UIFeatureMap` maps analytics, profile editor, and search visibility fields from `FeatureAccess` but omits `prioritySupport`. The four always-true fields (`directContactVisible`, `organicSearchVisible`, `enquiriesEnabled`, `basicAnalytics`) are reasonably omitted. But `prioritySupport` is a tier-differentiating boolean that should display on the subscription panel (§7.1) as a Partner feature. Without mapping, Partner subscribers see no dashboard indicator of priority support.

**Fix — slice:**
- Section: §11 `UIFeatureMap` type
- Old: (no `prioritySupport` mapping)
- New: Add to `UIFeatureMap`:
  ```typescript
  support: {
    prioritySupport: FeatureGateUIState
  }
  ```
  Add to `mapFeatureAccessToUI` return:
  ```typescript
  support: {
    prioritySupport: access.prioritySupport ? "available" : "locked",
  },
  ```

**Acceptance criteria impact:** AC-42 (`mapFeatureAccessToUI` returns correct gate states per tier) — fix ensures `prioritySupport` is covered.

---

### S5-ST-12: `profile_edited` consumer handler expansion undocumented

**Severity:** Medium
**Slice section:** §12, §9.2
**Upstream reference:** SI §1.5 (`EVENT_CONSUMER_MATRIX`)

**Problem:** S5 §12 claims "No new `EVENT_CONSUMER_MATRIX` entries required." This is technically correct — PP already has an async consumer for `profile_edited` registered in S1 §10. However, S5 §9.2 expands that consumer handler with 90-day reminder logic (cancel/reschedule deferred action). The expanded scope is not documented in S5 §12's consumer table or S1's registration. A developer implementing S1's consumer table would code only the quality score recalc trigger and silently lose S5's reminder scheduling.

**Fix — slice:**
- Section: §12
- Old: (no mention of `profile_edited`)
- New: Add note below the table: "**S5 consumer extension:** S5 extends PP's `profile_edited` consumer (registered in S1 §10) with 90-day reminder scheduling (§9.2). The consumer handler now performs two actions: (1) quality score recalc trigger (S1), (2) listing update reminder cancel/reschedule (S5). Both are async. No new `EVENT_CONSUMER_MATRIX` entry needed."

**Fix — sibling specs (recommended):**
- Document: `slices/slice-01-data-model.md`
- Section: S1's `profile_edited` PP consumer table row
- Change: Add note: "Extended by S5 §9.2 with 90-day listing update reminder scheduling."

**Acceptance criteria impact:** AC-35 and AC-36 test the reminder scheduling.

---

### S5-ST-13: `profile_edited` emission missing `accountId`

**Severity:** High
**Slice section:** §8.1 (`editListing` mutation)
**Upstream reference:** PP §1.7 (`ProfileEditedEvent`)

**Problem:** S5 §8.1 emits `profile_edited` with `{ type, listingId, changedFields, timestamp }`. PP §1.7 defines `ProfileEditedEvent` with `accountId: UUID` — present in the authoritative type. The emission payload is missing `accountId`. The compiler will reject this against `EventPayloadMap` (SI §1.2). The `accountId` is available in the handler (`ctx.session.userId`), so the fix is a one-line addition.

**Fix — slice:**
- Section: §8.1, `editListing` mutation, `emit()` call
- Old: `{ type: "profile_edited", listingId, changedFields, timestamp: new Date().toISOString() }`
- New: `{ type: "profile_edited", listingId, accountId: ctx.session.userId, changedFields, timestamp: new Date().toISOString() }`

**Fix — sibling specs:** None. PP §1.7 is correct.

**Acceptance criteria impact:** AC-32 should be amended: "...emits `profile_edited` with `accountId` and `changedFields` array".

---

### S5-ST-14: `enquiry_records` table has no `status` column

**Severity:** High
**Slice section:** §5.1, §5.2, §5.3
**Upstream reference:** S1 §2.2 (`enquiry_records` schema)

**Problem:** S5 §5.1 queries and filters on `enquiryRecords.status` (`"unread" | "responded" | "stale"`). S5 §5.2 updates status to `"responded"`. S5 §5.3 updates status to `"stale"`. S1 §2.2 defines `enquiry_records` with no `status` column — only `respondedAt` (null = unread, non-null = responded). The three-state lifecycle (`unread`, `responded`, `stale`) is an S5 addition not reflected in S1's schema.

Status could be derived from existing columns (`respondedAt IS NULL AND sentAt > now() - 7d` = unread), but the `enquiry_response_reminder` handler writes `status: "stale"` — a materialised state that avoids recomputation and is clearer for S6 (buyer-side) and S9 (enquiry analytics). An explicit column is preferred.

**Fix — slice:**
- Section: §16 (Schema Additions)
- Add migration for `enquiry_records`:
  ```typescript
  export const enquiryStatusEnum = pgEnum("enquiry_status", [
    "unread", "responded", "stale",
  ])
  // Add to enquiry_records (S1 §2.2):
  status: enquiryStatusEnum("status").notNull().default("unread"),
  ```

**Fix — sibling specs:**
- Document: `slices/slice-01-data-model.md`
- Section: §2.2 `enquiry_records`
- Change: Add downstream flag noting S5 adds a `status` column, or add the column directly with a note "Added by S5 for enquiry lifecycle tracking."

**Acceptance criteria impact:** AC-17 ("Enquiry status filter correctly filters results") depends on this fix.

---

### S5-ST-16: Dashboard overview N+1 query contradicts loading strategy

**Severity:** Medium
**Slice section:** §2.1, §2.2
**Upstream reference:** D&L §3.2 (`getEngagementCounters`)

**Problem:** S5 §2.1 states "Single query joins listings + engagement counters for all owned listings." S5 §2.2 code does `Promise.all(listings.map(listing => { getEngagementCounters(listing.id); computeProfileStrength(listing.id) }))` — an N+1 pattern. For 50 listings: 1 + 50 + 50 = 101 calls.

The prose and code are contradictory. D&L §3.2 exposes `getEngagementCounters(listingId)` per-listing; no batch variant exists. If the join approach is chosen, S5 reads the `engagements` table directly (acceptable — PP owns the route surface).

**Fix — slice:**
- Section: §2.1
- Old: "**Loading strategy:** Single query joins listings + engagement counters for all owned listings."
- New: "**Loading strategy:** SQL join between `listings` and `engagements` tables (both keyed by `listing_id`) for all owned listings. Profile strength computed from joined row. Single query, no per-listing function calls."
- Section: §2.2
- Old: `Promise.all(listings.map(async (listing) => { const counters = getEngagementCounters(listing.id); const strength = computeProfileStrength(listing.id); ... }))`
- New: Single Drizzle query joining `listingsTable`, `engagements`, and `qualityScores` on `listingId`. Map columns to `ListingCardData` directly from the join result.

**Acceptance criteria impact:** AC-5 ("Dashboard overview loads in <500ms p95 for up to 50 listings") depends on consistent loading strategy.

---

### S5-ST-17: Optimistic lock race with concurrent archival

**Severity:** Low
**Slice section:** §8.1 (`editListing` mutation)
**Upstream reference:** D&L §1.3 (`listing_archived`)

**Problem:** Archival changes `lifecycleStatus` to `"archived"` but does NOT increment `version`. A concurrent profile edit would pass the version check and succeed on an archived listing. The edit has no user-visible effect (listing is out of search), but the `profile_edited` event fires unnecessarily. S5 §2.1 already shows the guard pattern for admin-suspended listings. Adding `lifecycleStatus` guards for archived and suspended listings is defense-in-depth.

**Fix — slice:**
- Section: §8.1, `editListing` mutation, after ownership check
- Add:
  ```typescript
  if (listing.lifecycleStatus === "archived" || listing.lifecycleStatus === "suspended") {
    throw new TRPCError({ code: "FORBIDDEN", message: "cannot edit listing in current state" })
  }
  ```

**Acceptance criteria impact:** Consider adding AC: "Editing an archived or suspended listing returns FORBIDDEN." Alternatively, subsume under AC-3's pattern.

---

### S5-ST-20: Enquiry response email sent to null `senderEmail` after GDPR erasure

**Severity:** Low
**Slice section:** §5.2 (`respondToEnquiry` mutation)
**Upstream reference:** PP §1.9 (`ErasureCompletedEvent` — PP anonymises outbound enquiries), D&L §1.9

**Problem:** S5 §5.2 sends an `enquiry_response` email to `enquiry[0].senderEmail` without null-checking. PP's `erasure_completed` consumer (PP §2, PP-ST-8) anonymises outbound buyer enquiries, setting `senderEmail` to null. If a provider responds to an anonymised enquiry, the email send call receives `null` as the `to` parameter, causing a runtime failure in `EmailService.send()`.

The probability is low — it requires (1) a buyer's account being GDPR-erased, (2) the buyer having previously sent an enquiry, (3) the provider attempting to respond after erasure. But the fix is trivial.

**Fix — slice:**
- Section: §5.2, `respondToEnquiry` mutation, before email send
- Add guard:
  ```typescript
  // Send response email to enquirer (skip if anonymised)
  if (enquiry[0].senderEmail) {
    await ctx.services.email.send({
      template: "enquiry_response",
      to: enquiry[0].senderEmail,
      data: { listingName: listing.name, responseMessage: input.responseMessage, providerName: listing.name },
    })
  }
  ```

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-18 should note: "If enquiry sender has been anonymised (senderEmail null), email send is skipped but response is still recorded."

---

## Summary

S5 is the most UI-heavy slice so far and introduces relatively few new domain-level contracts — its primary function is surfacing data from S1–S4 through dashboard routes. The stress test found 6 High, 4 Medium, and 2 Low issues requiring 12 fixes.

The dominant pattern: **upstream registry sync gaps**. S5-ST-1/2 (DeferredActionParamsMap and registered actions) and S5-ST-3 (email template inventory) are the same three-part sync pattern found in every prior slice that adds deferred actions or templates. This is now the sixth consecutive occurrence — a tooling opportunity for post-requirements-phase automation.

The most impactful finding is **S5-ST-5** (notification schema mismatch): S5's notification router uses `readAt`, `dismissed`, and `dismissedAt` columns that don't exist in S0's schema or SI's type. This requires coordinated amendments to SI §8.1, S0 §1.4, and S5 §16.

**S5-ST-13** (`profile_edited` missing `accountId`) is a straightforward P1 compliance fix — one line. **S5-ST-14** (`enquiry_records.status` column, High) is a schema gap — S5 code references a column that does not exist in S1's schema, the same failure class as S5-ST-5 and S5-ST-13.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S5-1 | Correct | Churn intervention UI to S8 — accurately scoped |
| S5-2 | Correct | Sponsored placement badge to S8 |
| S5-3 | Correct | Competitor benchmarking data to S9 |
| S5-4 | Correct | Viewer demographics data to S9 |
| S5-5 | Correct | Enquiry response insights to S9 |
| S5-6 | Correct | Top search terms to S9 |
| S5-7 | Correct | Quality scoring calibration to S9 |
| S5-8 | Correct | Buyer enquiry submission to S6 |
| S5-9 | **Resolved by stress test** | `PaymentService.getCustomerPortalUrl` applied to SI §10.1 (S5-ST-4). Remove from downstream flags. |

### Upstream Flag Resolution Audit

| Flag | Claimed Resolution | Verdict |
|------|-------------------|---------|
| S1-4 | Partially resolved — UI panel provided, data pipeline deferred to S9 | **Correct** |
| S1-5 | Partially resolved — UI panel provided, data pipeline deferred to S9 | **Correct** |
| S2-5 | Resolved — content-addressed filenames, no purge needed | **Correct** (verified S2 §4.3) |
| S4-1 | Resolved — subscription panel implemented | **Correct** |
| S4-2 | Partially resolved — notification surface only, intervention logic deferred to S8 | **Correct** |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `interfaces/shared-infrastructure.md` | §2.1 | Add `listing_update_reminder` and `enquiry_response_reminder` to `DeferredActionParamsMap` | S5-ST-1 |
| `interfaces/shared-infrastructure.md` | §2.2 | Add 2 rows to registered actions table (Platform owner) | S5-ST-2 |
| `interfaces/shared-infrastructure.md` | §5.2 | Add `enquiry_response` template; update count 24→25 | S5-ST-3 |
| `interfaces/platform-and-product.md` | §4.1 | Add `enquiry_response` template; update count 24→25 | S5-ST-3 |
| `interfaces/shared-infrastructure.md` | §10.1 | Add `getCustomerPortalUrl` to `PaymentService` | S5-ST-4 |
| `interfaces/shared-infrastructure.md` | §8.1 | Replace `read: boolean` with `readAt?: ISO8601`, add `dismissed: boolean`, `dismissedAt?: ISO8601` | S5-ST-5 |
| `slices/slice-00-infrastructure.md` | §1.4 | Amend `notifications` table schema: replace `read` with `readAt`, add `dismissed`, `dismissedAt` | S5-ST-5 |
| `slices/slice-01-data-model.md` | §10 | Add note to `profile_edited` PP consumer: "Extended by S5 §9.2" | S5-ST-12 |
| `slices/slice-01-data-model.md` | §2.2 | Note S5 adds `status` column to `enquiry_records` | S5-ST-14 |
