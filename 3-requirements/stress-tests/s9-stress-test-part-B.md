# S9 Stress Test — Part B (D&L + PP Boundaries)

**Agent:** B
**Partition:** D&L interface + PP interface (8 scenarios)
**Date:** 2026-02-15
**Slice version:** v1
**Interface specs tested against:** D&L v5, PP v6, SI v8

---

## Summary Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S9-ST-B1 | `profile_viewed` dedup uses fields absent from `ProfileViewedEvent` payload | High | §1.4, §6.1.4 | PP §1.2 | `viewerAccountId` (§1.4) and `sessionId` (§6.1.4) do not exist on `ProfileViewedEvent` |
| S9-ST-B2 | `decay_signal_severity` pgEnum missing `"low"` value present in D&L §1.7 contract | Medium | §2 (00-schema.md §1) | D&L §1.7 | pgEnum has 3 values; event contract has 4 (includes `"low"`) |
| S9-ST-B3 | `account_closed` enrichment suspension: §2.6 vs §6.1.8 internal contradiction (Pattern #14) | Medium | §2.6, §6.1.8 | PP §1.9 | §2.6 queries DB by `accountId` (P1 violation); §6.1.8 correctly uses `event.listingsArchived` |
| S9-ST-B4 | 17 new deferred actions missing from SI §2.1 `DeferredActionParamsMap` | High | §8 | SI §2.1, §2.2 | 10th consecutive three-part sync gap — 17 S9 actions not in SI |
| S9-ST-B5 | `computeCompetitorBenchmark` S8-ST-3 compliance — `TaxonomyTag[]` usage | Pass | §3.4 | D&L §3.1 | Correct. Signature and logic both use `TaxonomyTag[]` arrays, not listing IDs |
| S9-ST-B6 | `quality_score_changed` event P1 payload conformance | Pass | §1.3 | D&L §1.8 | Correct. Emission payload matches `QualityScoreChangedEvent` exactly |
| S9-ST-B7 | `decay_signal_detected` event P1 payload — `signal.type` field name vs pgEnum naming | Medium | §2.2 | D&L §1.7 | Payload uses `signal.type` (string); pgEnum uses `signalType`. AC-33 references mismatch |
| S9-ST-B8 | `decay_final_notice` email template marked non-unsubscribable but category is `listing_status` which IS unsubscribable | Medium | §2.7, §9 | SI §5.2, §5.3 | Category `listing_status` has `Can Unsubscribe = Yes` per SI §5.3. Non-unsubscribable conflicts. |

**Totals:** 2 High, 4 Medium, 0 Low, 2 Pass.

---

## S9-ST-B1: `profile_viewed` dedup uses fields absent from `ProfileViewedEvent` payload

**Severity:** High
**Slice section:** §1.4, §6.1.4
**Upstream reference:** PP §1.2 `ProfileViewedEvent`

**Problem:** S9 implements `profile_viewed` P2 deduplication using two different field names that do not exist on the authoritative `ProfileViewedEvent` payload. In §1.4, the pseudocode accesses `event.viewerAccountId` for the dedup check against the `engagements` table. In §6.1.4, the consumer handler accesses `event.sessionId` for a hash-based dedup key. The authoritative payload type in PP §1.2 is: `{ type, listingId, source, timestamp }`. No `viewerAccountId`, no `sessionId`. The `sessionId` field exists on `SearchPerformedEvent` (PP §1.1) but not on `ProfileViewedEvent`. AC-11 in index.md tests `viewerAccountId`; AC-86 tests `sessionId`. Both reference fields that do not exist on the event contract.

This is a structural gap that blocks implementation: deduplication cannot work with fields that are not on the payload. Additionally, §1.4 and §6.1.4 disagree with each other on which field to use, making this also a Pattern #14 (content agent divergence) occurrence.

Two possible fixes: (a) add `viewerAccountId?: UUID` and `sessionId?: string` to `ProfileViewedEvent` in PP §1.2 (sibling spec change), or (b) implement dedup using only existing payload fields (e.g., IP-hash injected at the PP emission point, stored in an internal-only field). Option (a) is cleaner — PP already has richer internal event data (PP-ST-11 confirms PP retains richer internal event). Adding the cross-domain dedup field to the contract makes P2 enforcement explicit.

**Fix — slice:**
- Section: §1.4
- Old: `eq(engagements.lastViewerAccountId, event.viewerAccountId)`
- New: `eq(engagements.lastViewerAccountId, event.viewerAccountId)` (retain after sibling spec fix adds field)

- Section: §6.1.4
- Old: `const isDuplicate = event.sessionId ? await checkViewDeduplication(event.listingId, event.sessionId, event.timestamp) : false`
- New: `const isDuplicate = event.viewerAccountId ? await checkViewDeduplication(event.listingId, event.viewerAccountId, event.timestamp) : false`

- Section: §6.1.4
- Old: `if (event.sessionId) { await recordViewDeduplicationMarker(event.listingId, event.sessionId, event.timestamp) }`
- New: `if (event.viewerAccountId) { await recordViewDeduplicationMarker(event.listingId, event.viewerAccountId, event.timestamp) }`

- Section: index.md AC-86
- Old: `same sessionId + same listingId within 1 hour`
- New: `same viewerAccountId + same listingId within 1 hour`

- Section: index.md AC-11
- Old: (already uses `viewerAccountId`) — no change needed

**Fix — sibling specs:**
- Document: `interfaces/platform-and-product.md`
- Section: §1.2 `ProfileViewedEvent`
- Change: Add `viewerAccountId?: UUID` to the payload type. Update PP P1 fields table for `profile_viewed` to include `viewerAccountId`. The field is optional because anonymous (unauthenticated) viewers have no account ID — dedup falls back to no-dedup for anonymous views as §1.4 already describes.

- Document: `interfaces/data-and-listings.md`
- Section: §2 "Fields Used by D&L" table for `profile_viewed`
- Change: Add `viewerAccountId` alongside existing `listingId`, `source`.

**Acceptance criteria impact:** AC-86 text corrected (`sessionId` → `viewerAccountId`). AC-11 unchanged (already correct). No new AC.

---

## S9-ST-B2: `decay_signal_severity` pgEnum missing `"low"` value present in D&L §1.7 contract

**Severity:** Medium
**Slice section:** §2 (`00-schema.md` §1)
**Upstream reference:** D&L §1.7 `DecaySignalDetectedEvent`

**Problem:** The `DecaySignalDetectedEvent` payload in D&L §1.7 defines `signal.severity` as `"low" | "medium" | "high" | "critical"`. S9's `decay_signal_severity` pgEnum in `00-schema.md` §1 declares only 3 values: `"critical"`, `"high"`, `"medium"`. The `"low"` severity value is absent from the schema. If a decay signal with `"low"` severity were stored or emitted, the PostgreSQL enum constraint would reject the insert, or the event payload would carry a value that S9's code never produces but the interface contract allows.

S9's `02-decay-enrichment.md` §2.1 assigns severity values of `"high"`, `"medium"`, or `"critical"` — none of the check types produce `"low"`. The `stale_listing` signal type (present in the `decay_signal_type` enum) has no corresponding check in §2.1, and it is the most likely candidate for a `"low"` severity signal (time-based decay without a hard failure). The contract permits `"low"` but the implementation cannot store it.

Two options: (a) add `"low"` to the pgEnum for forward compatibility with the contract, or (b) propose amending D&L §1.7 to remove `"low"` from the severity union since no S9 check type produces it. Option (a) is safer — it preserves forward compatibility and avoids a sibling spec change.

**Fix — slice:**
- Section: `00-schema.md` §1
- Old:
```typescript
export const decaySignalSeverityEnum = pgEnum("decay_signal_severity", [
  "critical",    // blocks search visibility, immediate action required
  "high",        // provider outreach, 14-day resolution window
  "medium",      // quality score impact, 30-day resolution window
])
```
- New:
```typescript
export const decaySignalSeverityEnum = pgEnum("decay_signal_severity", [
  "critical",    // blocks search visibility, immediate action required
  "high",        // provider outreach, 14-day resolution window
  "medium",      // quality score impact, 30-day resolution window
  "low",         // minor data quality concern, no notification, quality score only
])
```

- Section: `02-decay-enrichment.md` §2.2
- Old: (flowchart shows only 3 severity branches: critical, high, medium)
- New: Add `low` branch: "Insert signal. No notification. Quality score impact only via §1. action: log_only". (Same behaviour as `medium` branch — both log only.)

**Fix — sibling specs:** None. D&L §1.7 already includes `"low"` — the slice aligns to the contract.

**Acceptance criteria impact:** None. Existing AC test severity assignment for specific check types, which remain correct. The `"low"` branch uses the same `log_only` action as `medium`.

---

## S9-ST-B3: `account_closed` enrichment suspension internal contradiction (Pattern #14)

**Severity:** Medium
**Slice section:** §2.6, §6.1.8
**Upstream reference:** PP §1.9 `AccountClosedEvent`

**Problem:** Two sections describe the `account_closed` enrichment suspension handler with different data access patterns. §2.6 (`02-decay-enrichment.md`) queries the database: `const listings = await getListingsByAccountId(event.accountId)`. §6.1.8 (`06-event-consumers.md`) iterates the event payload: `for (const listingId of event.listingsArchived)`. The index.md scope statement says "§6 is authoritative for consumer handler code; §1–§5 are authoritative for the decision logic those consumers invoke." §6.1.8 is therefore authoritative for the handler code.

The §2.6 approach performs a DB read in the consumer handler to obtain listing IDs, which violates P1 (payload self-containment). The `AccountClosedEvent` payload (PP §1.9) carries `listingsArchived: UUID[]` — the listing IDs needed for enrichment suspension. The §6.1.8 approach correctly uses this P1-compliant payload field.

**Fix — slice:**
- Section: §2.6 (`02-decay-enrichment.md`)
- Old:
```
handleAccountClosedEnrichmentSuspension(event: AccountClosedEvent):
  // 1. Get all listings for the closed account
  const listings = await getListingsByAccountId(event.accountId)
  if listings.length == 0: return

  const listingIds = listings.map(l => l.id)
```
- New:
```
handleAccountClosedEnrichmentSuspension(event: AccountClosedEvent):
  // 1. Use P1-compliant listing IDs from event payload
  const listingIds = event.listingsArchived
  if listingIds.length == 0: return
```

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None. AC-32 and AC-87 both describe correct behaviour (cancel deferred actions, delete enrichment schedules). The fix aligns the §2.6 pseudocode to match §6.1.8 and the AC.

---

## S9-ST-B4: 17 new deferred actions missing from SI §2.1 `DeferredActionParamsMap`

**Severity:** High
**Slice section:** §8 (index.md)
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`, SI §2.2 Registered Actions

**Problem:** S9 registers 17 new deferred action types (listed in index.md §8). None of these entries appear in SI §2.1 `DeferredActionParamsMap` or in SI §2.2 Registered Actions table. This is the 10th consecutive three-part sync gap (S0–S9). The fix-applier adds SI patches after stress test fixes are applied, so this finding is expected at v1 but must be tracked for the fix-applier to resolve.

The 17 missing entries:

1. `quality_score_recalculation: { listingId: UUID }`
2. `decay_liveness_check: { listingId: UUID, checkType: EnrichmentCheckType }`
3. `enrichment_full_cycle: { listingId: UUID }`
4. `claim_abandonment_check: Record<string, never>`
5. `taxonomy_review_preparation: Record<string, never>`
6. `data_health_review: Record<string, never>`
7. `verification_calibration_review: Record<string, never>`
8. `provider_outreach_ranking: Record<string, never>`
9. `conversion_funnel_analysis: Record<string, never>`
10. `revenue_health_extended: Record<string, never>`
11. `multi_listing_pricing_evaluation: Record<string, never>`
12. `sponsored_placement_learning: Record<string, never>`
13. `operational_health_review: Record<string, never>`
14. `contractor_performance_review: Record<string, never>`
15. `principal_briefing_generation: Record<string, never>`
16. `proactive_churn_detection: Record<string, never>`
17. `learning_hypothesis_analysis: Record<string, never>`

The §2.2 table also needs 17 new rows with domain, trigger, delay, retry, and on-failure columns.

Additionally, S9 uses `pre_claim_snapshot_cleanup` (defined in S2) in the `claim_abandonment_check` handler. This is already registered in SI from S2, so no action needed for that one.

**Fix — slice:** No slice fix needed. The slice correctly declares its 17 deferred actions in §8.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add all 17 entries listed above to the type map.

- Document: `interfaces/shared-infrastructure.md`
- Section: §2.2 Registered Actions
- Change: Add 17 rows with domain, trigger, delay, retry, and on-failure per index.md §8 table.

**Acceptance criteria impact:** None directly. SI §2.1 consistency is a contract concern, not a slice AC.

---

## S9-ST-B5: `computeCompetitorBenchmark` S8-ST-3 compliance — `TaxonomyTag[]` usage

**Severity:** Pass
**Slice section:** §3.4
**Upstream reference:** D&L §3.1

**Finding:** Correct. `computeCompetitorBenchmark` in §3.4 accepts `taxonomyTags: TaxonomyTag[]` (not listing IDs). The function signature, inline comment ("NOT listing IDs"), and AC-42 all explicitly reference the S8-ST-3 fix. The competitor identification logic extracts `serviceArea` values from the passed `TaxonomyTag[]` array for the SQL overlap query. N+1 avoidance is also correct — batch `WHERE listingId IN (...)` queries replace per-competitor `getEngagementCounters` calls (AC-44).

---

## S9-ST-B6: `quality_score_changed` event P1 payload conformance

**Severity:** Pass
**Slice section:** §1.3
**Upstream reference:** D&L §1.8 `QualityScoreChangedEvent`

**Finding:** Correct. The emission in §1.3 `evaluateQualityScoreBand` produces payload `{ type: "quality_score_changed", listingId, previousComposite, newComposite, changedDimensions }` which matches `QualityScoreChangedEvent` in D&L §1.8 exactly. The `changedDimensions` field is `string[]` (dimension names that changed value), consistent with the spec. AC-10 verifies this conformance.

---

## S9-ST-B7: `decay_signal_detected` event P1 payload — `signal.type` field naming ambiguity

**Severity:** Medium
**Slice section:** §2.2
**Upstream reference:** D&L §1.7 `DecaySignalDetectedEvent`

**Problem:** The `DecaySignalDetectedEvent` payload in D&L §1.7 defines `signal: { type: string; severity: ... }`. S9's emission in §2.2 constructs the payload as:

```typescript
emit("decay_signal_detected", {
    type: "decay_signal_detected",
    listingId,
    signal: { type: signal.signalType, severity: signal.severity },
    activeSupportTicket: undefined,
})
```

The outer `type` field (event discriminator) and the inner `signal.type` field (decay signal type) share the same field name `type`. This is not technically a bug — the contract specifies `signal.type` as a nested property — but creates implementation confusion. More importantly, S9's `decay_signal_detected` consumer in §6.3.3 accesses `event.signal.type` in the WHERE clause: `eq(decaySignals.signalType, event.signal.type)`. The `signalType` column on `decay_signals` stores values from the `decay_signal_type` pgEnum, while `event.signal.type` is typed as `string` in the contract. If these diverge (e.g., a signal type not in the pgEnum is emitted), the UPDATE would match zero rows silently.

AC-33 says "payload matches D&L §1.7 `DecaySignalDetectedEvent` type: `{ type, listingId, signal: { type, severity }, activeSupportTicket? }`" — this is correct but the prose uses `type` for both fields without disambiguation. No functional error, but the naming overlap warrants a clarifying note.

**Fix — slice:**
- Section: §2.2
- Old: (no disambiguation note)
- New: Add note after emission pseudocode: "**Naming note:** The outer `type` field is the event discriminator (`"decay_signal_detected"`). The inner `signal.type` field is the decay signal type (e.g., `"website_dead"`, `"email_bounced"`). Both are named `type` per the D&L §1.7 contract. Implementers must reference the nested path `event.signal.type` for the decay signal type, not the outer `event.type`."

**Fix — sibling specs:** None. The contract naming is established and changing it would break existing consumers (Ops, PP).

**Acceptance criteria impact:** None. AC-33 is factually correct. The fix adds a disambiguation note, not an AC change.

---

## S9-ST-B8: `decay_final_notice` email marked non-unsubscribable but `listing_status` category IS unsubscribable

**Severity:** Medium
**Slice section:** §2.7, §9 (index.md)
**Upstream reference:** SI §5.2, §5.3

**Problem:** S9's `decay_final_notice` email template (§2.7) is defined with category `listing_status` and `Unsubscribable: No` (it states "operational — listing at risk of archival"). However, SI §5.3 defines the `listing_status` category with `Can Unsubscribe = Yes`. The existing `listing_decay_warning` template (S7, SI §5.2 Ops Compliance section) also has category `listing_status` and `Unsubscribable: Yes`.

If `decay_final_notice` is truly non-unsubscribable (because it warns of imminent archival), it should use category `transactional` — the only category where `Can Unsubscribe = No` is structurally correct per SI §5.3 (aside from `subscription` which is semantically wrong). The alternative is to accept that `listing_status` emails can be unsubscribed from, meaning a provider who has opted out will not receive the final decay notice and their listing will be archived without this specific warning.

Option (a): Change category to `transactional` (non-unsubscribable by design). This is appropriate because the email warns about an impending data action (listing archival), similar to `dsar_acknowledgment` or `dsar_completion`.

Option (b): Accept `listing_status` / `Unsubscribable: Yes`. The provider has already been warned via `listing_decay_warning` (S7) which is also unsubscribable. If they opted out after the first warning, the 90-day final notice follows the same preference. Archival proceeds regardless.

Option (a) is recommended. A final notice before archival is functionally a transactional notification about an action the entity is about to take on the provider's listing.

**Fix — slice:**
- Section: §2.7 (`02-decay-enrichment.md`)
- Old: `**Category:** listing_status` / `**Unsubscribable:** No (operational — listing at risk of archival)`
- New: `**Category:** transactional` / `**Unsubscribable:** No`

- Section: index.md §9 template table
- Old: `| decay_final_notice | listing_status | ...`
- New: `| decay_final_notice | transactional | ...`

**Fix — sibling specs:** None. The template is new in S9 and not yet registered in SI §5.2.

**Acceptance criteria impact:** None. No AC references the email category directly.

---

## Key Themes

1. **Pattern #14 recurrence (content agent divergence):** S9-ST-B1 and S9-ST-B3 are both Pattern #14 instances. B1 shows §1.4 vs §6.1.4 divergence on which field to use for dedup. B3 shows §2.6 vs §6.1.8 divergence on data access pattern. The index.md scope statement (§6 authoritative for handler code) mitigates B3, but B1 is structural because both sections reference non-existent fields.

2. **Three-part sync gap (10th consecutive):** S9-ST-B4 continues the unbroken streak. S9 adds 17 new deferred actions — the largest single-slice addition. Fix-applier must patch SI §2.1 and §2.2.

3. **Contract-schema alignment:** S9-ST-B2 highlights that S9's pgEnum for decay severity is narrower than the D&L §1.7 contract. The `"low"` value is in the contract but not the schema. Forward compatibility requires alignment.

4. **Event payload field availability:** S9-ST-B1 is the highest-impact finding. Deduplication is a core S9 feature (resolves flag S1-8) but depends on a field that does not exist on the cross-domain event contract. This requires a sibling spec change to PP §1.2.

## Downstream Flag Audit (D&L + PP Flags)

| Flag | Claimed Resolution | Verified? | Notes |
|------|-------------------|-----------|-------|
| S1-2 | §1 quality scoring algorithms | Yes | `computeQualityScore` with 5 dimensions, composite 0-100. Fully specified. |
| S1-4 | §3 search terms + trend data | Yes | Aggregated from `search_performed` into `perception_aggregates`. |
| S1-8 | §1 profile_viewed P2 dedup | **Partial** | Logic specified, but dedup field (`viewerAccountId`) not on event payload (S9-ST-B1). Blocked until PP §1.2 amended. |
| S1-11 | §2 account_closed enrichment suspension | Yes | §6.1.8 handler cancels deferred actions correctly. §2.6 has P1 violation (B3) but §6 is authoritative. |
| S2-3 | §1 profile strength meter wiring | Yes | `quality_score_explanations`-driven recommendations replace S2 fallback. |
| S2-4 | §3 generic taxonomy suggestions | Yes | `computeTaxonomySuggestions` from co-occurrence analysis. |
| S3-7 | §1 claim abandonment detection | Yes | `claim_abandonment_check` daily batch, >90 days revert. Self-perpetuating. |
| S5-3 | §3 competitor benchmarking | Yes | `computeCompetitorBenchmark` with `TaxonomyTag[]`. S8-ST-3 compliant. |
| S5-4 | §3 viewer demographics | Yes | Aggregated `profile_viewed` events by entity type, sector, location. |
| S5-5 | §3 enquiry response insights | Yes | Response rate, median response time, conversion estimates. |
| S5-6 | §3 top search terms per listing | Yes | Aggregated from `search_performed` events. |
| S5-7 | §1 quality scoring calibration | Yes | S9 computes calibrated scores; S5 renders them. |
| S6-3 | §3 search analytics pipeline | Yes | Term frequencies, zero-result detection, taxonomy gap identification. |
| S6-4 | §3 PP-Q5 analytics tooling | Yes | In-database aggregation via `perception_aggregates`. |
| S6-5 | §1 engagement event quality signals | Yes | `profile_viewed` and `shortlist_added` as perception inputs. |

**Result:** 14 of 15 flags fully verified. 1 flag (S1-8) partially blocked by S9-ST-B1 (dedup field missing from event payload).

## Sibling Spec Changes Required

| Document | Section | Change | Triggered By |
|----------|---------|--------|-------------|
| `interfaces/platform-and-product.md` | §1.2 `ProfileViewedEvent` | Add `viewerAccountId?: UUID` | S9-ST-B1 |
| `interfaces/platform-and-product.md` | §2 P1 fields table | Add `viewerAccountId` for `profile_viewed` | S9-ST-B1 |
| `interfaces/data-and-listings.md` | §2 "Fields Used by D&L" table | Add `viewerAccountId` for `profile_viewed` | S9-ST-B1 |
| `interfaces/shared-infrastructure.md` | §2.1 `DeferredActionParamsMap` | Add 17 new entries | S9-ST-B4 |
| `interfaces/shared-infrastructure.md` | §2.2 Registered Actions | Add 17 new rows | S9-ST-B4 |
