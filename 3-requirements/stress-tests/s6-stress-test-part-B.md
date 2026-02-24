# S6 Stress Test — Part B (D&L + PP Boundaries)

**Agent:** B
**Boundaries:** Data & Listings, Platform & Product
**Date:** 2026-02-14
**Scenarios:** 8

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S6-ST-B1 | Shortlist lifecycle display: internal contradiction between join-based and consumer-written approaches | High | `04-shortlist-dashboard.md` §4.1 vs `00-schema.md` §2.1 vs `index.md` §10 | PP §2, D&L §1.3/§1.4/§1.5 | Contradictory statements — §4.1/§4.5 say lifecycle read via join to `listings.lifecycleStatus`, §2.1/index §10 say PP consumers write `shortlist_items.status` |
| S6-ST-B2 | `enquiry_submitted` consumer list incomplete in §3.5 — omits CR `first_enquiry` conversion trigger consumer | Medium | `03-enquiry-submission.md` §3.5 | PP §1.3 | Slice consumer table lists only D&L; PP §1.3 also lists CR as consumer |
| S6-ST-B3 | `search_performed` event P1 payload — `filters` typed as `SearchFilters` but emitted as `{}` when undefined | Medium | `01-search.md` §1.8, `00-router-plan.md` §2.1 | PP §1.1 | Emission uses `input.filters ?? {}` which produces `Record<string, never>`, not `SearchFilters` |
| S6-ST-B4 | `getEngagementCounters` call signature: S6 calls for unclaimed-excluded listings but D&L spec does not document unclaimed-listing behaviour | Low | `02-listing-profile.md` §2.3 | D&L §3.2 | S6 guards `verificationTier !== "unclaimed"` before calling; D&L spec does not document error/empty behaviour for unclaimed listings |
| S6-ST-B5 | ISR revalidation trigger list: S6 §2.1 lists 5 events + `verification_tier_changed` (6 total); SI §7.2 lists 7 including `profile_edited` | Pass | `02-listing-profile.md` §2.1 | SI §7.2 | Correct — S6 lists 6 event-bus triggers; `profile_edited` is inline ISR (not event-bus), documented in SI §7.2 note. Counts align. |
| S6-ST-B6 | `search_performed` D&L consumption — S6 §1.8 says D&L consumes for zero-result tracking; D&L §2 confirms | Pass | `01-search.md` §1.8 | D&L §2 | Correct — D&L §2 lists `search_performed` with action "Log zero-result queries for quarterly taxonomy review" (Async) |
| S6-ST-B7 | Email templates: `new_enquiry` and `enquiry_forwarded` both listed in PP §4.1 with correct template IDs and category | Pass | `03-enquiry-submission.md` §3.7 | PP §4.1 | Correct — both templates registered as Platform Transactional in PP §4.1 |
| S6-ST-B8 | `pending_enquiries.forwardedAt` — S6 Branch D sets `null` but D&L spec does not document the meaning of null `forwardedAt` for dispute-queued enquiries | Low | `03-enquiry-submission.md` §3.9 | D&L (S1 §1.12) | S6 relies on `forwardedAt: null` to distinguish forwarded (Branch B) from silently queued (Branch D) — no spec documents this semantic |

## Detailed Findings

### S6-ST-B1: Shortlist lifecycle display — internal contradiction between join-based and consumer-written approaches

**Severity:** High
**Slice section:** `04-shortlist-dashboard.md` §4.1, §4.4, §4.5 vs `00-schema.md` §2.1 vs `index.md` §10
**Upstream reference:** PP §2 (consumers for `listing_archived`, `listing_suspended`, `listing_reactivated`), D&L §1.3, §1.4, §1.5

**Problem:** S6 contains two mutually exclusive descriptions of how shortlist items reflect listing lifecycle state. In `04-shortlist-dashboard.md` §4.1, §4.4, and §4.5, the slice says `shortlist_items.status` tracks only item-level state (`active`/`removed`), listing lifecycle state is read via JOIN to `listings.lifecycleStatus`, and "no consumer writes to `shortlist_items` are needed." But in `00-schema.md` §2.1, the consumer mapping table explicitly states that `listing_archived` transitions `shortlist_items.status` from `active` → `archived`, `listing_suspended` does `active` → `suspended`, and `listing_reactivated` restores to `active` — which are PP consumers already registered in PP §2 (`[XP-15]`). The `index.md` §10 event consumer table reinforces the consumer-written model, stating "S6 reads `shortlist_items.status` for display; consumer already writes the value." These are not two compatible approaches — they are contradictory. The join-based model says consumers do not write; the consumer-mapping model says they do. PP §2 is authoritative: it registers `listing_archived`, `listing_suspended`, and `listing_reactivated` async consumers that mark shortlist items. The join-based approach in §4.4 and §4.5 must be corrected to align with the PP-registered consumer model.

**Fix — slice:**
- Section: `04-shortlist-dashboard.md` §4.1, paragraph 2
- Old: `The shortlist_items.status column tracks only the item's own lifecycle within the shortlist: active (in shortlist) or removed (buyer removed). The archived and suspended values in shortlistItemStatusEnum (S1-ST-7) exist in the enum but are unused by S6 — listing state is read from listings.lifecycleStatus via join, not written to shortlist_items.status by event consumers.`
- New: `The shortlist_items.status column tracks both the item's own lifecycle (active → removed by buyer) and the listing's lifecycle state (active → archived/suspended by PP event consumers [XP-15]). S6 reads shortlist_items.status to render the correct display state — PP consumers registered in PP §2 update this column asynchronously on listing_archived, listing_suspended, and listing_reactivated events.`

- Section: `04-shortlist-dashboard.md` §4.4, the `shortlist.getItems` query WHERE clause
- Old: `WHERE si.shortlist_id = shortlistId AND si.status = 'active'`
- New: `WHERE si.shortlist_id = shortlistId AND si.status != 'removed'`
- Rationale: The query must return archived and suspended items (to display dimmed with badges) in addition to active items. Filtering to `status = 'active'` would hide items that PP consumers have transitioned to `archived` or `suspended`, making the §4.4 display rules unreachable.

- Section: `04-shortlist-dashboard.md` §4.5, replace entire section
- Old: The current text stating "Neither requires S6 to register new consumers or update shortlist_items rows" and describing the join-based approach
- New: Rewrite to state that PP consumers (registered in PP §2) update `shortlist_items.status` on lifecycle events. S6 reads the status column directly. The join to `listings` is retained for display data (name, slug, headline) but lifecycle state comes from `shortlist_items.status`, not `listings.lifecycleStatus`. `erasure_completed` still cascades via FK.

- Section: `04-shortlist-dashboard.md` §4.4, the `ShortlistItemWithListing` type
- Old: `lifecycleStatus: LifecycleStatus // from listings table via join — NOT a shortlist_items column`
- New: Remove `lifecycleStatus` from the joined listing fields. Add `status` from `shortlist_items.status` to the item-level fields: `status: "active" | "archived" | "suspended" | "removed"`. Use this for display rendering.

**Fix — sibling specs:** None — PP §2 is already correct. The consumers are registered.

**Acceptance criteria impact:**
- AC-31 amended: `shortlist.getItems` returns listing display data via single JOIN; items with `status` of `archived`/`suspended` included in results with lifecycle badge. `WHERE si.status != 'removed'` filter (not `= 'active'`).
- AC-32 amended: Shortlist items for archived listings render based on `shortlist_items.status = 'archived'` (consumer-written), not `listings.lifecycleStatus` join.

---

### S6-ST-B2: `enquiry_submitted` consumer list in §3.5 omits CR conversion trigger consumer

**Severity:** Medium
**Slice section:** `03-enquiry-submission.md` §3.5
**Upstream reference:** PP §1.3

**Problem:** S6 §3.5 documents only one consumer of `enquiry_submitted` (D&L engagement metric update). PP §1.3 lists three consumers: D&L (engagement metric), D&L (unclaimed enquiry queue), and CR (`first_enquiry` conversion trigger [CR-X-10]). The CR consumer is absent from S6's consumer table in §3.5. While S6 is not responsible for registering cross-domain consumers, the consumer table in the content section is a reference for implementers to verify event emission completeness. Omitting CR from the table could lead an implementer to believe the event has no Commercial significance and remove fields needed by CR. The fix is to list all consumers from the authoritative PP §1.3 source.

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

**Acceptance criteria impact:** None — no new AC needed. Consumer list is reference documentation.

---

### S6-ST-B3: `search_performed` emission — `filters` default produces incorrect type

**Severity:** Medium
**Slice section:** `01-search.md` §1.8, `00-router-plan.md` §2.1
**Upstream reference:** PP §1.1 (`SearchPerformedEvent`)

**Problem:** S6 emits `search_performed` with `filters: input.filters ?? {}`. When `input.filters` is undefined (no filters applied), this emits `filters: {}` — an empty object of type `Record<string, never>`. The authoritative `SearchPerformedEvent` type in PP §1.1 types `filters` as `SearchFilters`, which has four optional properties. An empty `{}` is technically assignable to `SearchFilters` (all fields optional), so the compiler does not catch this. However, D&L consumes `filters` for zero-result tracking (D&L §2) and reads `filters.sectors`, `filters.serviceAreas`, etc. If D&L's consumer code accesses these properties on `{}`, the result is `undefined` — safe at runtime but semantically ambiguous (does `undefined` mean "no filter applied" or "property missing from payload"?). The fix is to emit `filters` as a properly shaped `SearchFilters` object with explicit undefined fields, or document that `{}` is a valid representation of "no filters" that consumers must handle.

**Fix — slice:**
- Section: `01-search.md` §1.8, emission note after the code block
- Old: (no note on empty filters semantics)
- New: Add note: "When no filters are applied, `filters` is emitted as `{}`. This is valid `SearchFilters` (all properties optional). Consumers must treat missing properties as 'no filter applied' — not as an error. D&L's zero-result tracking checks `resultCount === 0` as the primary signal; filter values provide context, not trigger conditions."

**Fix — sibling specs:** None — PP §1.1 `SearchFilters` already has all optional fields.

**Acceptance criteria impact:** None — AC-8 (index.md) already states `filters` is `SearchFilters`. Adding the note clarifies edge behaviour.

---

### S6-ST-B4: `getEngagementCounters` — D&L spec does not document unclaimed-listing behaviour

**Severity:** Low
**Slice section:** `02-listing-profile.md` §2.3
**Upstream reference:** D&L §3.2

**Problem:** S6 §2.3 guards the `getEngagementCounters` call with `listing.verificationTier !== "unclaimed"` before invoking the query. This guard is correct — unclaimed listings have no meaningful engagement data (no provider has claimed ownership to generate engagement events). However, D&L §3.2 does not document what `getEngagementCounters` returns for an unclaimed listing. If the guard is accidentally removed during implementation, the D&L query may return zeroes (safe) or throw (unsafe). The D&L spec should document the expected return for unclaimed listings to make the contract explicit.

**Fix — slice:** No change needed — S6's guard is correct.

**Fix — sibling specs:**
- Document: `interfaces/data-and-listings.md`
- Section: §3.2
- Change: Add note after the function signature: "Returns zero-initialised counters for unclaimed listings. Callers may choose to skip the call for unclaimed listings (no engagement data exists), but the interface does not reject them."

**Acceptance criteria impact:** None.

---

### S6-ST-B8: `pending_enquiries.forwardedAt` semantics for Branch D (disputed) undocumented

**Severity:** Low
**Slice section:** `03-enquiry-submission.md` §3.9
**Upstream reference:** D&L, S1 §1.12

**Problem:** S6 §3.9 writes `forwardedAt: hasContactEmail ? new Date() : null` when queuing in `pending_enquiries`. For Branch B (unclaimed + email), `forwardedAt` is the timestamp of the email forward. For Branch D (disputed), `forwardedAt` is `null` because no email is sent (dispute status is hidden from the buyer). The `pending_enquiries` table in S1 §1.12 defines `forwardedAt` as a nullable timestamp but does not document its semantic meaning — specifically that `null` distinguishes "silently queued (disputed or no email)" from "forwarded via email." S3's `deliverPendingEnquiries` may need this distinction when delivering queued enquiries after dispute resolution (to avoid sending a duplicate forward notification for enquiries that were never forwarded). The fix is a documentation note, not a schema change.

**Fix — slice:**
- Section: `03-enquiry-submission.md` §3.9, after the `queuePendingEnquiry` pseudocode
- Old: (no note on `forwardedAt` semantics)
- New: Add note: "`forwardedAt` is non-null for Branch B (email forwarded to listing's contactEmail) and null for Branch D (disputed — no forward sent). S3's `deliverPendingEnquiries` can use this to distinguish forwarded-and-queued from silently-queued enquiries."

**Fix — sibling specs:** None required — the S1 §1.12 comment "null if no email available" covers the schema intent. The S6 note provides the implementation context.

**Acceptance criteria impact:** None — no new AC needed. Documentation only.

## Summary

S6's D&L and PP boundary surfaces are largely correct — 3 of 8 scenarios pass. The one High finding is an internal contradiction within S6 itself: three content files describe mutually exclusive approaches to shortlist lifecycle display (join-based vs consumer-written `shortlist_items.status`). PP §2 is authoritative — the consumer-written model is correct, and the `shortlist.getItems` query filter and display logic must align with it. The two Medium findings are a missing CR consumer in the enquiry submission consumer table and an unspecified empty-filters edge case in `search_performed` emission. Both are documentation gaps, not structural faults. Event emission payloads for all 5 S6 events match their authoritative PP §1 type definitions.
