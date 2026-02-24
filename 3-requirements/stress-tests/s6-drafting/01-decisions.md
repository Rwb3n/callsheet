# S6 Drafting Decisions — Buyer Experience

**Status:** Resolved
**Generated:** 2026-02-14
**Inputs:** `s6-pre-draft-checklist.md` (§1, §5, §7), `shared-infrastructure.md` (v5 §2.1–§2.2), `slice-05-provider-experience.md` (v2 §5.3, §13, §16.3), `platform-and-product.md` (v5 §5.2)

---

## Summary Table

| # | Decision | Options Evaluated | Resolution | Impact |
|---|----------|-------------------|------------|--------|
| D1 | Stale enquiry transition timing | New deferred action at 14 days / Extend S5 reminder / Lazy eval | **No S6 action — S5 already resolves at 7 days** | No new deferred action. No SI amendments. Concept design's 14-day figure superseded by S5 implementation. |
| D2 | `shortlist_items` displayStatus column | Add denormalised column / Join at read time | **Join at read time** | No schema amendment. No new consumers. |
| D3 | `enquiry_responded` consumer for buyer view | New PP-internal consumer / Direct DB read | **Already handled by S5** | No new consumer. S6 reads `enquiry_records.status`. |
| D4 | PP-Q5 analytics tooling | Resolve in S6 / Defer | **Partially addressed, defer to S9** | PP-Q5 remains open. S6 emits `search_performed` as data source. |

---

## D1: Stale Enquiry Transition

**Resolution: No S6 action needed. S5 already marks enquiries stale at 7 days.**

The checklist (§1, §7) asks whether the 14-day stale transition requires a new `stale_enquiry_mark` deferred action. This question is moot. S5 §5.3 already implements the stale transition: the `enquiry_response_reminder` deferred action fires 7 days after enquiry delivery, checks `enquiry_records.status`, and if still `"unread"`, sets it to `"stale"` and sends the provider a reminder email. [Source: slice-05-provider-experience.md — §5.3, §13]

The concept design states "delivered/read → stale: 14 days with no response" [Source: platform-and-product.md — §5.2]. S5's stress-tested implementation resolved this at 7 days — combining the stale marking with the reminder email into a single deferred action. The 7-day implementation is authoritative; the concept design's 14-day figure is superseded.

**Enquiry status lifecycle (authoritative, implemented by S5):**

```
unread → responded   (provider responds — S5 §5.2 respondToEnquiry)
unread → stale       (7 days, no response — S5 §5.3 enquiry_response_reminder)
stale  → responded   (provider responds after stale — S5 §5.2, same handler)
```

S6 reads `enquiry_records.status` in the buyer's "Enquiries Sent" view. The three-state value (`unread`, `responded`, `stale`) is already persisted by S5. S6 adds no deferred actions, no status transitions, and no amendments to SI §2.1 or §2.2.

---

## D2: `shortlist_items` displayStatus Column

**Resolution: No column. Join to `listings.status` at read time.**

The checklist (§5.2) proposed a `displayStatus` column on `shortlist_items` to denormalise the listing's lifecycle state (`active`, `archived`, `suspended`). Two options:

| Option | Mechanism | Trade-off |
|--------|-----------|-----------|
| A. Add `displayStatus` column | Event consumers for `listing_archived`, `listing_suspended`, `listing_reactivated`, `erasure_completed` update `shortlist_items.displayStatus` | Sync risk: if a consumer fails, shortlist displays stale state. Requires 4 consumer handlers + new pgEnum. |
| B. Join at read time | `shortlist.getItems` joins `shortlist_items` → `listings` and reads `listings.status` | Single source of truth. No sync risk. Minimal cost: both tables indexed on PK. |

**Option B is correct.** The `shortlist.getItems` route already joins to `listings` for display data (name, slug, image, location, sector). Adding `listings.status` to that existing join costs nothing. No new column, no new enum, no new consumers, no sync risk.

The checklist's §4 notes that PP §2 already registers consumers for `listing_archived`/`listing_suspended`/`listing_reactivated` with handler description "update shortlist entries." The checklist interpreted this as updating a denormalised column. The correct reading is that these consumers handle search index consistency (removing/restoring from search results), not shortlist item metadata. S6's shortlist display reads the listing's current state directly.

**Schema impact:** No `displayStatus` column on `shortlist_items`. No `shortlistDisplayStatusEnum`. The cumulative schema snapshot in the pre-draft checklist §5.3 should be amended to remove the `displayStatus` line.

---

## D3: `enquiry_responded` Consumer

**Resolution: No new consumer. S5 already handles the transition.**

The checklist (§4) asks whether S6 needs a PP-internal consumer for `enquiry_responded` to update the buyer's "Enquiries Sent" view. It does not.

S5 §5.2 (`respondToEnquiry`) directly updates `enquiry_records.status` to `"responded"` when the provider responds. This is a direct DB write within the response handler, not an event-driven update. The `enquiry_responded` event is emitted *after* the status update for cross-domain consumers (engagement counters, analytics). [Source: slice-05-provider-experience.md — §5.2, AC-18]

S6's `enquiry.listSent` route reads `enquiry_records.status` — the value is already correct at read time. No consumer, no additional handler.

---

## D4: PP-Q5 — Analytics Tooling

**Resolution: Partially addressed. Defer formal resolution to S9.**

S6 implements `search_performed` event emission (PP §1.1) which is the primary data source for search analytics. S6 also emits `profile_viewed` (PP §1.2) and `contact_attempt` (PP §1.8). These events provide the raw signal that analytics tooling will consume.

S6 does not resolve the tooling choice (what aggregates, stores, and surfaces analytics data). That is S9's responsibility — Entity Intelligence consumes these events for quality scoring, perception signals, and cross-domain pattern detection. PP-Q5 remains open with a note that S6 provides the emission infrastructure.

**Downstream flag for S9:** PP-Q5 partially addressed by S6 event emissions (`search_performed`, `profile_viewed`, `contact_attempt`). S9 owns the analytics pipeline, aggregation, and tooling decision.

---

## Implications for Downstream Agents

**Schema agent:**
- New table: `search_history` (checklist §5.1 — unchanged).
- No `displayStatus` column on `shortlist_items`.
- No new pgEnums beyond `search_history` requirements.
- Cumulative snapshot: remove `displayStatus` line from `shortlist_items`.

**Router plan agent:**
- `shortlist.getItems` joins to `listings` for display status — document the join, not a column read.
- `enquiry.listSent` reads `enquiry_records.status` directly — no event consumer dependency.

**Content agents:**
- §3 (Enquiry Submission): enquiry status lifecycle is owned by S5. S6 submits enquiries and reads status. No status transitions in S6.
- §4 (Shortlist Management): listing state displayed via join, not denormalised column. Pseudocode for `shortlist.getItems` must include the `listings.status` join.
- §5 (Saved Searches & Search History): `search_history` table is new in S6. 12-month retention via batch cleanup.
- §7 (Contact Attempt Feedback): `contact_attempt` event emission — verify payload against PP §1.8.

**Template/deferred action count:** S6 adds **1 new deferred action** (`search_history_cleanup` — added by search content agent §5.2) and **0 new email templates**. Current totals after S6: 12 deferred actions (SI §2.2), 25 email templates (SI §5.2, unchanged).

**Downstream flags:** PP-Q5 partially addressed → flag for S9 with context on which events S6 emits.
