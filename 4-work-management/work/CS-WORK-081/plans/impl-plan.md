## Implementation Plan — CS-WORK-081: Event consumers — D&L perception

**IO profile:** db-read-write, deferred-action-schedule
**Blocked by:** CS-WORK-075 (done), CS-WORK-076 (done), CS-WORK-077 (done) — all clear
**Spec sources:** `06-event-consumers.md` (§6.1, §6.3.1, §6.3.3), `data-and-listings.md` §1.7, `operations.md` §3.1
**Effort:** medium (9 AC, 10 consumer handlers + barrel + tests)

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-86 | `profile_viewed` dedup: same viewer+listing within 1hr = single engagement | needs-impl | `deduplicateProfileView` exists in `quality/dedup.ts` — consumers call it |
| AC-87 | `account_closed` cancels decay/enrichment deferred actions, deletes enrichment_schedules | pre-satisfied | `src/domains/data-and-listings/consumers/account-closed.ts` already does exactly this. Intelligence consumer is duplicate logic — need to verify if AC requires *separate* intelligence consumer or if existing D&L consumer covers it. |
| AC-89 | `contact_attempt` unreachable → decay signal; reached → no-op | needs-impl | `evaluateDecayResponse` exists but has complex params (not just signal). Consumer must build full params. |
| AC-91 | `decay_signal_detected` → `hasActiveTicket` check → annotate checkDetails | needs-impl | `hasActiveTicket` at `operations/support/queries.ts`. `decaySignals` table in `intelligence.ts`. |
| AC-92 | `listing_created` → schedule quality_score_recalculation + enrichment schedule | needs-impl | Existing D&L `listing_created` handler is a no-op. Intelligence consumer adds real logic. |
| AC-95 | `profile_edited` → schedule quality_score_recalculation + reset freshness | needs-impl | Existing D&L `profile_edited` handler handles listing_update_reminder. Intelligence consumer adds quality recalc. |
| AC-96 | `claim_approved` → quality recalc + enrichment cadence upgrade + L2/L3 hypothesis | needs-impl | No existing intelligence consumer. `updateHypothesisTracking` doesn't exist — needs creation. |
| AC-97 | `shortlist_added` → record quality calibration perception signal | needs-impl | `shortlist_added` matrix is empty `[]`. No existing consumers. |
| AC-100 | `enquiry_submitted` → enquiry analytics + quality signal + outreach prioritisation | needs-impl | Existing D&L consumers handle engagement. Intelligence consumer adds analytics/quality/outreach. |

**Pre-satisfied:** 1 / 9 (AC-87 — existing D&L `account_closed` consumer already cancels enrichment + deletes schedules)
**Needs implementation:** 8 / 9

### AC-87 Pre-Satisfaction Analysis

The existing D&L consumer at `src/domains/data-and-listings/consumers/account-closed.ts` already:
- Cancels `decay_liveness_check` pending actions per listing
- Cancels `enrichment_full_cycle` pending actions per listing
- Deletes `enrichment_schedules` rows

The AC says: "cancels all pending decay_liveness_check and enrichment_full_cycle deferred actions for every listing in event.listingsArchived, deletes enrichment_schedules rows". This matches the existing D&L consumer exactly.

**Decision:** Write a test for AC-87 that verifies the existing D&L consumer's behaviour. The intelligence consumer for `account_closed` can either be a thin wrapper that delegates to the same logic, or we skip creating a separate intelligence consumer since the D&L one covers it. Given the spec §6.1.8 explicitly lists it as an intelligence consumer, create the intelligence consumer but have it delegate. Alternatively: the spec says "10 handlers" in CS-WORK-081 scope, and the existing D&L consumer was registered from prior work. The intelligence consumer is a *new* registration that does the same work from the intelligence domain. Since the existing D&L consumer already handles this, the intelligence consumer should be a no-op (avoid double-cancellation). **Write a unit test that verifies the no-op + documents the delegation to D&L.**

### Type Alignment

- **Event payload types:** All 9 event types already defined in `types.ts` with correct fields. No modifications needed.
- **Consumer matrix:** Need to add 10 new entries (the 9 from AC scope + `search_performed` intelligence consumer which has no explicit AC but is listed in deliverables). `shortlist_added` is currently `[]`, `conversion_milestone` is `[]`.
- **Scheduler types:** `quality_score_recalculation`, `decay_liveness_check`, `enrichment_full_cycle` already in `DeferredActionParamsMap`. No additions needed.
- **`evaluateDecayResponse` signature:** Takes `{ listingId, signal, existingSignals, hasActiveSupportTicket, deps }` — NOT a simple signal. The contact_attempt consumer must build this full params object including loading existing signals and checking active ticket.
- **`scheduleEnrichment` does not exist.** Must create a helper that inserts `enrichment_schedules` rows and schedules initial `decay_liveness_check` deferred actions per check type. Pattern: use `getApplicableCheckTypes(cadenceTier)` + `getCadenceMap(cadenceTier)` from `detection.ts`.
- **`recordQualityCalibrationSignal` does not exist.** Must create — writes to `perception_aggregates` with `aggregateType: "quality_calibration"`.
- **`updateHypothesisTracking` does not exist.** Must create — writes to `perception_aggregates` with `aggregateType: "hypothesis_tracking"`.
- **`updateProviderOutreachPrioritisation` does not exist.** Must create — writes to `perception_aggregates` with `aggregateType: "outreach_prioritisation"`.
- **`aggregateEnquiryAnalytics`** — `computeEnquiryResponseInsights` exists in `analytics/enquiry-response.ts` but takes DB reads. The consumer needs a simpler "increment enquiry count" version.
- **`aggregateViewerDemographics`** — `aggregateViewerDemographic` exists (singular) in `analytics/viewer-demographics.ts`.
- **`aggregateSearchTerms`** — `aggregateSearchTerm` exists (singular) in `analytics/search-terms.ts`.

### Implementation Order

1. **Create helper functions** — `scheduleEnrichmentForListing`, `recordQualityCalibrationSignal`, `updateHypothesisTracking`, `updateProviderOutreachPrioritisation` in `src/domains/intelligence/consumers/helpers.ts`
2. **Create 10 consumer handler files** — one per event, following the `EventHandler<T>` pattern from D&L consumers
3. **Create barrel export** — `src/domains/intelligence/consumers/index.ts` with `registerIntelligenceConsumers`
4. **Add matrix entries** — update `EVENT_CONSUMER_MATRIX` in `types.ts` with 10 new intelligence entries
5. **Unit tests** — `dl-consumers.test.ts` for AC-86, AC-89, AC-92, AC-95, AC-96, AC-97, AC-100
6. **Integration tests** — `dl-consumers.integration.test.ts` for AC-87, AC-91

### Deliverables (annotated)

- [ ] `src/domains/intelligence/consumers/helpers.ts` — **NEW.** Shared helper functions.
- [ ] `src/domains/intelligence/consumers/profile-edited.ts` — **NEW.** AC-95.
- [ ] `src/domains/intelligence/consumers/listing-created.ts` — **NEW.** AC-92.
- [ ] `src/domains/intelligence/consumers/claim-approved.ts` — **NEW.** AC-96.
- [ ] `src/domains/intelligence/consumers/profile-viewed.ts` — **NEW.** AC-86.
- [ ] `src/domains/intelligence/consumers/search-performed.ts` — **NEW.** No explicit AC, delegates to analytics.
- [ ] `src/domains/intelligence/consumers/shortlist-added.ts` — **NEW.** AC-97.
- [ ] `src/domains/intelligence/consumers/contact-attempt.ts` — **NEW.** AC-89.
- [ ] `src/domains/intelligence/consumers/account-closed.ts` — **NEW.** AC-87 (no-op, D&L consumer handles).
- [ ] `src/domains/intelligence/consumers/enquiry-submitted.ts` — **NEW.** AC-100.
- [ ] `src/domains/intelligence/consumers/decay-signal-detected.ts` — **NEW.** AC-91.
- [ ] `src/domains/intelligence/consumers/index.ts` — **NEW.** Barrel + registration.
- [ ] `src/domains/intelligence/consumers/__tests__/dl-consumers.test.ts` — **NEW.** Unit tests.
- [ ] `src/domains/intelligence/consumers/__tests__/dl-consumers.integration.test.ts` — **NEW.** Integration tests.
- [ ] `src/lib/events/types.ts` — **MODIFY.** Add 10 matrix entries.

### Key Patterns (from D&L consumer sibling)

1. **Handler factory:** `export function xxxHandler(deps): EventHandler<"event_name">` returns `{ domain, eventType, mode: "async", handler }`.
2. **Registration:** `bus.on(handler(deps))`. Barrel exports `registerXxxConsumers(bus, deps)`.
3. **Deps pattern:** Typed deps bag `{ db: Db, schedulerDb: SchedulerDb }`. Only include what's needed per handler.
4. **Error handling:** Per spec, wrap in try/catch. But existing D&L consumers do NOT wrap in try/catch — the bus itself handles errors via `logError`. Follow existing pattern (no try/catch in handler body) since the bus's error wrapper is the SI §1.5 implementation.
5. **`scheduleDeferredAction`** takes `(schedulerDb, { action, params, executeAt, retryPolicy, onFailure, createdBy })`.
6. **`cancelDeferredAction`** takes `(schedulerDb, { action, filterParams, cancelledBy })`.

### Critical Design Decisions

1. **`evaluateDecayResponse` in contact_attempt consumer:** The spec pseudocode suggests a simple `evaluateDecayResponse(decaySignal)` call, but the actual function requires `{ listingId, signal, existingSignals, hasActiveSupportTicket, deps }`. The consumer must load existing signals from DB and check `hasActiveTicket`. This makes the contact_attempt consumer an **integration-test candidate** (needs DB), not pure unit test. However, the WORK.md says AC-89 is Unit. **Resolution:** Mock the DB interactions and test the branching logic (unreachable vs reached) as a unit test. The full path through `evaluateDecayResponse` is already integration-tested in CS-WORK-077.

2. **`scheduleEnrichmentForListing` helper:** Creates `enrichmentSchedules` rows for all applicable check types at the given cadence tier, plus schedules initial `decay_liveness_check` deferred actions. Uses `getApplicableCheckTypes(tier)` and `getCadenceMap(tier)` from detection.ts.

3. **Intelligence consumer domain:** All consumers use `domain: "intelligence"` in their EventHandler, NOT `"data-and-listings"`. This distinguishes them from existing D&L consumers in the matrix.

4. **No `intelligence` in Domain type yet.** Must add `"intelligence"` to the `Domain` union in `types.ts`.

### UUID-vs-Text Audit

- `account_closed` consumer receives `event.accountId` (text — Better Auth). No SQL joins against this field needed — only uses `event.listingsArchived` (UUIDs) to match `enrichmentSchedules.listingId` (UUID). Safe.
- `decay_signal_detected` consumer annotates `decaySignals.checkDetails` via `decaySignals.listingId` (UUID) matched against `event.listingId` (UUID). Safe.
- `claim_approved` consumer uses `event.listingId` (UUID). Safe.
- No cross-table uuid-vs-text comparisons in any consumer.
