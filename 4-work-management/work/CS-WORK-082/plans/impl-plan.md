## Implementation Plan — CS-WORK-082: Event consumers — CR/Ops and matrix wiring

**IO profile:** db-read-write, deferred-action-schedule
**Blocked by:** CS-WORK-075 (done), CS-WORK-080 (done), CS-WORK-081 (done) — all clear
**Spec sources:** `06-event-consumers.md` §6.2–§6.4

### AC Summary

| AC | Description (short) | Status | Evidence / Notes |
|----|---------------------|--------|-----------------|
| AC-85 | All 15 intelligence consumers in EVENT_CONSUMER_MATRIX with correct IDs, mode async, domain | needs-impl | 10 exist from CS-WORK-081. Need +5 (CR/Ops). |
| AC-88 | subscription_tier_changed consumer upgrades enrichment to paid cadence on upgrade | needs-impl | — |
| AC-90 | conversion_milestone consumer records per-gate attribution via decision log correlation | needs-impl | `conversion_trigger_evaluation` decisions logged by `src/domains/commercial/conversion-triggers.ts:532` |
| AC-93 | All 15 consumers wrap body in try/catch, logConsumerError on error, no propagation | partial | 10 D&L handlers already follow pattern. 5 new handlers need same pattern. |
| AC-94 | EVENT_CONSUMER_MATRIX contains exactly 15 new entries after S9 | needs-impl | 10 exist. Need +5 entries. |
| AC-98 | subscription_ended consumer creates churn_analysis_log for ALL origins, paddle-only win-back attribution | needs-impl | — |
| AC-99 | winback_delivery_result consumer records status against original listingId | needs-impl | — |
| AC-101 | enquiry_responded consumer computes response time delta and updates perception_aggregates | needs-impl | `computeEnquiryResponseInsights` exists at `src/domains/data-and-listings/analytics/enquiry-response.ts` |

**Pre-satisfied:** 0 / 8
**Needs implementation:** 8 / 8 (AC-93 partial — 10/15 handlers already compliant)

### Type Alignment

1. **EnquiryRespondedEvent missing `timestamp`** — payload has `listingId`, `enquiryId`, `responseTimeMinutes` but no `timestamp`. The `enquiry_responded` consumer can use `new Date().toISOString()` as current time instead.
2. **`churn_analysis_log.accountId` is `uuid` type** — `SubscriptionEndedEvent.accountId` is text (Better Auth). Must use raw SQL `::uuid` cast, or store in `metadata` JSONB, or leave `accountId` null and use `accountHash` or `metadata`. Safest: leave `accountId` null, put text accountId in `metadata`.
3. **`decision_logs.listingId` is `uuid` type** — `ConversionMilestoneEvent.listingId` is a listing UUID from the DB, so this is safe.
4. **`DecisionLogDb.findByDomainAndType`** returns only `{ id, domain, decisionType }` — insufficient for AC-90 (need `inputs`, `listingId`, `createdAt`). The conversion_milestone consumer must query `decision_logs` directly via `db` to get the most recent `conversion_trigger_evaluation` for a listing.
5. **`winback_delivery_result` has no existing matrix entries** — empty array. Need to add 1 entry.
6. **`conversion_milestone` has no existing matrix entries** — empty array. Need to add 1 entry.
7. **`enquiry_responded` has 1 existing entry** (`responseMetrics` from D&L). Need to add 1 intelligence entry.
8. **`subscription_tier_changed` has 4 existing entries.** Need to add 1 intelligence entry.
9. **`subscription_ended` has 3 existing entries.** Need to add 1 intelligence entry.
10. **`account_closed` intelligence entry** — current consumer name is `enrichmentSuspensionNoop` (from CS-WORK-081). This is correct — no change needed.

### Implementation Order

1. **5 consumer handler files** — one per event (subscription-tier-changed, subscription-ended, conversion-milestone, winback-delivery-result, enquiry-responded)
2. **Update barrel** — `src/domains/intelligence/consumers/index.ts` — import + register 5 new handlers
3. **Update EVENT_CONSUMER_MATRIX** — add 5 entries in `src/lib/events/types.ts`
4. **Wire singleton** — verify `src/lib/events/singleton.ts` passes needed deps (db, schedulerDb already available; may need decisionLogDb for conversion_milestone — evaluate)
5. **Unit tests** — `cr-ops-consumers.test.ts` covering AC-88, AC-90, AC-93, AC-98, AC-99, AC-101
6. **Integration test** — `matrix-wiring.integration.test.ts` covering AC-85, AC-94 (count all intelligence entries = 15)
7. **Type check + full test run**

### Deliverables

- [ ] `src/domains/intelligence/consumers/subscription-tier-changed.ts` — NEW
- [ ] `src/domains/intelligence/consumers/subscription-ended.ts` — NEW
- [ ] `src/domains/intelligence/consumers/conversion-milestone.ts` — NEW
- [ ] `src/domains/intelligence/consumers/winback-delivery-result.ts` — NEW
- [ ] `src/domains/intelligence/consumers/enquiry-responded.ts` — NEW
- [ ] `src/domains/intelligence/consumers/index.ts` — MODIFY (add 5 imports + registrations)
- [ ] `src/lib/events/types.ts` — MODIFY (add 5 matrix entries)
- [ ] `src/domains/intelligence/consumers/__tests__/cr-ops-consumers.test.ts` — NEW
- [ ] `src/domains/intelligence/consumers/__tests__/matrix-wiring.integration.test.ts` — NEW

### Key Patterns (from sibling CS-WORK-081)

- **Handler factory:** `export function xxxHandler(deps: XxxDeps): EventHandler<"event_name">` returns `{ domain: "intelligence", eventType, mode: "async", handler }`.
- **Deps pattern:** Minimal deps bag. `{ db: Db }` for read/write. Add `schedulerDb: SchedulerDb` only if scheduling deferred actions.
- **No try/catch in handler body** — the `InProcessEventBus` wraps async handlers in try/catch via `logError`. The SI §1.3 pattern is satisfied by the bus infrastructure. Sibling handlers (profile-viewed, claim-approved, etc.) do NOT have explicit try/catch. AC-93 tests that errors don't propagate — this is guaranteed by bus.emit() catching async errors.
- **Unit test pattern:** `createMockDb()` + `createMockSchedulerDb()` from `dl-consumers.test.ts`. Handler called directly via `.handler(event)`.

### Handler Design Notes

**subscription-tier-changed (AC-88):**
- Check tier rank: `{ free: 0, standard: 1, premium: 2, partner: 3 }`.
- On upgrade: call `scheduleEnrichmentForListing(db, schedulerDb, listingId, "paid")`.
- On downgrade: log revenue perception signal to `perception_aggregates` (aggregate type: `revenue_signal`).
- Deps: `{ db, schedulerDb }`.

**subscription-ended (AC-98):**
- Insert `churn_analysis_log` row for ALL origins.
- `accountId` field is `uuid` type in schema but event carries text — use null for `accountId`, store in `metadata: { accountId: event.accountId }`.
- Paddle-only branch: insert additional `metadata.winbackAttributionEvent = true` marker.
- Deps: `{ db }`.

**conversion-milestone (AC-90):**
- Query `decision_logs` directly (not via DecisionLogDb) for most recent `conversion_trigger_evaluation` where `listingId` matches.
- Extract `triggerType` from decision's `inputs` field, fallback to `"organic"`.
- Insert perception_aggregates row with aggregate type `conversion_attribution`.
- Deps: `{ db }`.

**winback-delivery-result (AC-99):**
- Insert `perception_aggregates` row (aggregate type: `winback_effectiveness`) with status + timestamp.
- Simple — no cross-domain reads.
- Deps: `{ db }`.

**enquiry-responded (AC-101):**
- Call `computeEnquiryResponseInsights(db, event.listingId)` from existing `enquiry-response.ts`.
- This recomputes the full insights aggregate and upserts to `perception_aggregates`.
- Deps: `{ db }`.
