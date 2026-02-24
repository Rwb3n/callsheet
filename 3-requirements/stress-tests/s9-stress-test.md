# S9 Stress Test — Entity Intelligence

**Slice:** `slices/slice-09-entity-intelligence/` (v1)
**Tested against:** SI v8, D&L v5, Ops v4, PP v6, CR v3
**Date:** 2026-02-15
**Scenarios:** 19 (20 raw, 1 dedup)
**Severity distribution:** 4 High, 8 Medium, 1 Low, 6 Pass
**Total fixes:** 13

---

## Scenario Summary

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S9-ST-1 | Three-part sync: 17 new deferred actions missing from SI §2.1/§2.2 | High | §8 | SI §2.1/§2.2 | 17 new `DeferredActionParamsMap` entries and 17 registered action rows must be added to SI. Found by both Agent A and Agent B. |
| S9-ST-2 | `profile_viewed` dedup uses fields absent from `ProfileViewedEvent` payload | High | §1.4, §6.1.4 | PP §1.2 | `viewerAccountId` (§1.4) and `sessionId` (§6.1.4) do not exist on `ProfileViewedEvent` |
| S9-ST-3 | 7 new decision types missing from SI §9.2 registry | High | §1-§5 | SI §9.2 | SI §9.2 must add 7 new decision type entries for S9 |
| S9-ST-4 | 4 new email templates missing from SI §5.2 registry | High | §9 | SI §5.2 | SI §5.2 must add 4 new template entries for S9 |
| S9-ST-5 | `multi_listing_pricing_evaluation` SQL references non-existent tier `"professional"` | Medium | §4 | S1 §1.2 | SQL uses `'professional'` which is not a valid `SubscriptionTier` value |
| S9-ST-6 | `principal_briefing` email template category `"internal"` not in `EmailCategory` union | Medium | §4, §9 | SI §5.1 | Category `"internal"` does not exist in SI §5.1 `EmailCategory` type |
| S9-ST-7 | `conversion_milestone` consumer gate attribution uses `ConversionMilestoneId` as gate identifier, but friction ratio computation expects feature gate names | Medium | §5, §6 | CR §1.1 | Mismatch between `ConversionMilestoneId` values and feature gate names used in friction ratio denominator |
| S9-ST-8 | `subscription_ended` consumer does not branch on `event.origin` (P3) | Medium | §6 | Ops §1.2, SI §1.4 P3 | Handler records churn for all origins without distinguishing archival/closure from paddle |
| S9-ST-9 | `decay_signal_severity` pgEnum missing `"low"` value present in D&L §1.7 contract | Medium | §2 (00-schema.md §1) | D&L §1.7 | pgEnum has 3 values; event contract has 4 (includes `"low"`) |
| S9-ST-10 | `account_closed` enrichment suspension: §2.6 vs §6.1.8 internal contradiction (Pattern #14) | Medium | §2.6, §6.1.8 | PP §1.9 | §2.6 queries DB by `accountId` (P1 violation); §6.1.8 correctly uses `event.listingsArchived` |
| S9-ST-11 | `decay_signal_detected` event P1 payload — `signal.type` field naming ambiguity | Medium | §2.2 | D&L §1.7 | Payload uses `signal.type` (string); pgEnum uses `signalType`. Naming overlap warrants clarification |
| S9-ST-12 | `decay_final_notice` email marked non-unsubscribable but `listing_status` category IS unsubscribable | Medium | §2.7, §9 | SI §5.2, §5.3 | Category `listing_status` has `Can Unsubscribe = Yes` per SI §5.3. Non-unsubscribable conflicts. |
| S9-ST-13 | `operational_health_review` type mismatch between §4 and §5 definitions | Low | §4, §5 | — | Two `OperationalHealthReport` type definitions with divergent fields |
| S9-ST-14 | `churn_risk_detected` emission P1 compliance — proactive detection | Pass | §5 | CR §1.2 | Payload conforms to `ChurnRiskDetectedEvent` type |
| S9-ST-15 | 2 new notification types not yet in SI §8.1 | Pass | §10 | SI §8.1 | SI §8.1 extensibility note covers incremental addition |
| S9-ST-16 | `decay_signal_detected` consumer calls `hasActiveTicket` — return type conformance | Pass | §6 | Ops §3.1 | Consumer correctly uses `ActiveTicketRecord.ticketId` |
| S9-ST-17 | Downstream flags S9-1, S9-2, S9-3 accuracy audit | Pass | §13 | — | All 3 flags accurately describe V1 limitations with correct S10 targets |
| S9-ST-18 | `computeCompetitorBenchmark` S8-ST-3 compliance — `TaxonomyTag[]` usage | Pass | §3.4 | D&L §3.1 | Correct. Signature and logic both use `TaxonomyTag[]` arrays, not listing IDs |
| S9-ST-19 | `quality_score_changed` event P1 payload conformance | Pass | §1.3 | D&L §1.8 | Correct. Emission payload matches `QualityScoreChangedEvent` exactly |

---

## Findings

### S9-ST-1: Three-part sync — 17 new deferred actions missing from SI §2.1/§2.2

**Severity:** High
**Slice section:** §8
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`, SI §2.2 registered actions table
**Note:** Found independently by both Agent A and Agent B. This is the 10th consecutive three-part sync gap (S0-S9).

**Problem:** S9 registers 17 new deferred action handlers (index.md §8 table). SI §2.1 `DeferredActionParamsMap` currently has 17 entries (S0-S8). The 17 new entries (`quality_score_recalculation`, `decay_liveness_check`, `enrichment_full_cycle`, `claim_abandonment_check`, `taxonomy_review_preparation`, `data_health_review`, `verification_calibration_review`, `provider_outreach_ranking`, `conversion_funnel_analysis`, `revenue_health_extended`, `multi_listing_pricing_evaluation`, `sponsored_placement_learning`, `operational_health_review`, `contractor_performance_review`, `principal_briefing_generation`, `proactive_churn_detection`, `learning_hypothesis_analysis`) do not yet exist in SI §2.1 or §2.2. This is the 10th consecutive three-part sync gap (S0-S9).

Additionally, S9 uses `pre_claim_snapshot_cleanup` (defined in S2) in the `claim_abandonment_check` handler. This is already registered in SI from S2, so no action needed for that one.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1
- Change: Add 17 new entries to `DeferredActionParamsMap`:
  ```
  quality_score_recalculation: { listingId: UUID }
  decay_liveness_check: { listingId: UUID, checkType: EnrichmentCheckType }
  enrichment_full_cycle: { listingId: UUID }
  claim_abandonment_check: Record<string, never>
  taxonomy_review_preparation: Record<string, never>
  data_health_review: Record<string, never>
  verification_calibration_review: Record<string, never>
  provider_outreach_ranking: Record<string, never>
  conversion_funnel_analysis: Record<string, never>
  revenue_health_extended: Record<string, never>
  multi_listing_pricing_evaluation: Record<string, never>
  sponsored_placement_learning: Record<string, never>
  operational_health_review: Record<string, never>
  contractor_performance_review: Record<string, never>
  principal_briefing_generation: Record<string, never>
  proactive_churn_detection: Record<string, never>
  learning_hypothesis_analysis: Record<string, never>
  ```
- Section: §2.2
- Change: Add 17 new rows to registered actions table matching the schedule, retry, and onFailure values in S9 index.md §8.

**Acceptance criteria impact:** None (SI document change, not slice AC)

---

### S9-ST-2: `profile_viewed` dedup uses fields absent from `ProfileViewedEvent` payload

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

**Acceptance criteria impact:** AC-86 text corrected (`sessionId` -> `viewerAccountId`). AC-11 unchanged (already correct). No new AC.

---

### S9-ST-3: 7 new decision types missing from SI §9.2 registry

**Severity:** High
**Slice section:** §1-§5
**Upstream reference:** SI §9.2

**Problem:** S9 introduces 7 new decision types: `quality_score_band_evaluation` (§1), `decay_response_evaluation` (§2), `enrichment_cadence_adjustment` (§2), `taxonomy_promotion_evaluation` (§4), `ceremony_outcome_evaluation` (§4), `proactive_churn_detection` (§5), `conversion_threshold_adjustment` (§5). SI §9.2 currently lists 19 decision types (5 D&L, 4 Ops, 3 PP, 6 CR after S8). The 7 new types must be added to SI §9.2 to maintain the three-part sync. The slice correctly claims "7 new decision types" in the cumulative snapshot (§11), but SI must be updated for the registry to be authoritative.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §9.2
- Change: Add 7 new entries:

| Domain | Decision Types (new) |
|--------|---------------------|
| D&L | `quality_score_band_evaluation`, `decay_response_evaluation`, `enrichment_cadence_adjustment`, `taxonomy_promotion_evaluation` |
| Operations | (none — `ceremony_outcome_evaluation` is cross-domain, logged with per-ceremony domain mapping) |
| Commercial | `proactive_churn_detection`, `conversion_threshold_adjustment` |
| Cross-domain | `ceremony_outcome_evaluation` (logged with `ceremonyDomainMap` per §4 — domain varies per ceremony type) |

Note: `ceremony_outcome_evaluation` uses `ceremonyDomainMap` to assign the domain dynamically. SI §9.2 should list it under the domain that most frequently uses it, or introduce a "Cross-domain" row. Alternatively, list it under each domain that uses it with a shared note.

**Acceptance criteria impact:** None (SI document change)

---

### S9-ST-4: 4 new email templates missing from SI §5.2 registry

**Severity:** High
**Slice section:** §9
**Upstream reference:** SI §5.2

**Problem:** S9 introduces 4 new email templates: `decay_final_notice`, `enrichment_confirmation_request`, `credit_confirmation_outreach`, `principal_briefing`. SI §5.2 currently lists 26 templates (14 Platform Transactional + 5 Operations Compliance + 1 Subscription + 5 Commercial Conversion + 1 support_acknowledgment). The 4 new templates must be added to SI §5.2. The slice correctly claims "30 templates after S9" in the cumulative snapshot (§11). Note that template categorisation needs care:
- `decay_final_notice`: category `"transactional"` (per S9-ST-12 fix), unsubscribable No
- `enrichment_confirmation_request`: category `"listing_status"`, unsubscribable No (operational data accuracy — §4 explicitly states this)
- `credit_confirmation_outreach`: category `"listing_status"`, unsubscribable Yes
- `principal_briefing`: category `"transactional"` (per S9-ST-6 fix), unsubscribable No

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2
- Change: Add 4 new templates under appropriate groupings:

**Operations / Intelligence (add to existing Operations section or create new Intelligence section):**

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `decay_final_notice` | Unresolved high/critical decay signal >90 days | No |
| `enrichment_confirmation_request` | Claimed listing with no edits for >12 months | No |
| `credit_confirmation_outreach` | Credit `verifiedAt` between 330-365 days ago | Yes |
| `principal_briefing` | Monthly principal briefing generation | No |

Update template count from 26 to 30 in §5.2 header: `type EmailTemplateId = /* union of 30 template IDs — see §5.2 */`

**Acceptance criteria impact:** None (SI document change)

---

### S9-ST-5: `multi_listing_pricing_evaluation` SQL references non-existent tier `"professional"`

**Severity:** Medium
**Slice section:** §4 (`04-ceremony-automation.md` — `handleMultiListingPricingEvaluation`)
**Upstream reference:** S1 §1.2 `subscriptionTierEnum`

**Problem:** The `handleMultiListingPricingEvaluation` pseudocode contains the SQL predicate `AND subscription_tier IN ('standard', 'professional', 'premium')`. The `subscription_tier` pgEnum (S1 §1.2) defines values `"free", "standard", "premium", "partner"`. There is no `"professional"` tier. This query would return zero rows at runtime for any listing on the partner tier, silently under-counting multi-listing paid accounts. The correct predicate should reference `'partner'` instead of `'professional'`. This is a Pattern #15 (runtime silent failure) — the ceremony would produce `insufficient_data` at the 20-account threshold even when enough multi-listing accounts exist.

**Fix — slice:**
- Section: §4 (`04-ceremony-automation.md` — `handleMultiListingPricingEvaluation`)
- Old: `AND subscription_tier IN ('standard', 'professional', 'premium')`
- New: `AND subscription_tier IN ('standard', 'premium', 'partner')`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None (AC-63 tests threshold check order, not SQL predicate values; however existing AC would catch this at integration test time)

---

### S9-ST-6: `principal_briefing` email template category `"internal"` not in `EmailCategory` union

**Severity:** Medium
**Slice section:** §4 (`04-ceremony-automation.md` — `handlePrincipalBriefingGeneration`), §9 (template table)
**Upstream reference:** SI §5.1 `EmailCategory` type

**Problem:** The `principal_briefing` email template in index.md §9 lists its category as `"internal"`. The `handlePrincipalBriefingGeneration` pseudocode in §4 calls `sendEmail({ template: "principal_briefing", ... })` without specifying the category explicitly, and the template table describes it as category `"internal"`. However, SI §5.1 defines `EmailCategory` as the union `"transactional" | "enquiry_notification" | "listing_status" | "profile_nudge" | "subscription" | "conversion_marketing"`. The value `"internal"` does not exist in this union. At compile time, TypeScript would reject this value. The principal briefing email should use `"transactional"` (always-on, no unsubscribe — the principal cannot unsubscribe from their own briefing).

**Fix — slice:**
- Section: §9 (index.md template table)
- Old: `| principal_briefing | internal |`
- New: `| principal_briefing | transactional |`
- Section: §4 (`04-ceremony-automation.md` — `handlePrincipalBriefingGeneration`, the `sendEmail` call)
- Old: (no explicit category in pseudocode — implied `"internal"`)
- New: Add `category: "transactional"` to the `sendEmail` params

**Fix — sibling specs:** None (SI §5.1 `EmailCategory` type is correct; the slice must conform to it).

**Acceptance criteria impact:** AC-65 should specify the email category. Amend: "... sends `principal_briefing` email template with `category: "transactional"` to the principal ..."

---

### S9-ST-7: `conversion_milestone` consumer gate attribution uses `ConversionMilestoneId` as gate identifier, but friction ratio computation expects feature gate names

**Severity:** Medium
**Slice section:** §5 (`05-entity-learning.md` §5.4), §6 (`06-event-consumers.md` §6.2.3)
**Upstream reference:** CR §1.1 `ConversionMilestoneId`, CR §4.1 `TierLimits`, Ops §3.4 `FeatureGateFrictionSummary`

**Problem:** The `conversion_milestone` consumer (§6.2.3) records per-gate conversion attribution using `event.milestone` as the gate identifier. `ConversionMilestoneId` values are `"first_subscription" | "first_upgrade" | "premium_reached" | "partner_reached"`. However, the friction ratio computation (§5.4.2 `computeFrictionRatios`) iterates over `frictionSummary.gates` from Ops `getFeatureGateFrictionSummary`, which returns gates named after feature gate categories (e.g., `"trendAnalytics"`, `"viewerDemographics"`) — these are the names of features in `TierLimits`. The conversion attribution stored under `ConversionMilestoneId` keys (e.g., `"first_subscription"`) will never match the feature gate names from the friction summary. The denominator for per-gate friction ratios will always be 0, producing `Infinity` ratios for every gate with tickets — triggering false CR-X-6 escalations.

§5.4.3 attempts to extract `triggerGate` from `event.metadata?.triggerGate`, but `ConversionMilestoneEvent` (CR §1.1) has no `metadata` field. The payload is `{ type, listingId, accountId, milestone, milestoneLabel, timestamp }`. The `triggerGate` extraction would always resolve to `"unknown"`.

**Fix — slice:**
- Section: §5 (`05-entity-learning.md` §5.4.3)
- Old: `triggerGate = event.metadata?.triggerGate ?? "unknown"`
- New: The conversion milestone event does not carry the triggering feature gate. Gate-level conversion attribution requires correlating the milestone with the conversion trigger that fired before it (from `conversion_trigger_evaluation` decision logs). The attribution logic should query `decision_logs WHERE decisionType = "conversion_trigger_evaluation" AND inputs.listingId = event.listingId AND created_at < event.timestamp ORDER BY created_at DESC LIMIT 1` and extract the trigger type from the matched decision log's inputs. The trigger type (e.g., `"analytics_teaser"`) maps to the feature gate name that prompted the conversion.
- Section: §6 (`06-event-consumers.md` §6.2.3 handler pseudocode)
- Old: `await recordPerGateConversionAttribution({ listingId: event.listingId, accountId: event.accountId, milestone: event.milestone, timestamp: event.timestamp })`
- New: `const triggerDecision = await getMostRecentConversionTrigger(event.listingId, event.timestamp); await recordPerGateConversionAttribution({ listingId: event.listingId, accountId: event.accountId, gate: triggerDecision?.inputs?.triggerType ?? "organic", milestone: event.milestone, timestamp: event.timestamp })`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-90 needs amendment: "consumer records per-gate conversion attribution by correlating `event.milestone` with the most recent `conversion_trigger_evaluation` decision log for the listing. `updateConversionCounts` increments the correct trigger-type bucket."

---

### S9-ST-8: `subscription_ended` consumer does not branch on `event.origin` (P3 violation risk)

**Severity:** Medium
**Slice section:** §6 (`06-event-consumers.md` §6.2.2)
**Upstream reference:** Ops §1.2 `SubscriptionEndedEvent`, SI §1.4 P3 (context defensiveness)

**Problem:** The `subscription_ended` consumer handler in §6.2.2 calls `recordChurnAnalysisEntry` and `refineWinbackAttributionWindow` for all events. The handler correctly branches on `event.origin === "paddle"` before calling `refineWinbackAttributionWindow`, which is P3-compliant for the win-back path. However, `recordChurnAnalysisEntry` receives all events including `origin: "archival"` and `origin: "closure"`. CR's own consumer (CR §2, S8 §10) branches on origin: `"paddle"` -> schedule win-back, `"archival"/"closure"` -> churn log only. S9's intelligence consumer records the same churn data without distinguishing context.

This is not a structural gap because the intelligence consumer's purpose is analytics (recording all churn regardless of origin is valid for revenue health computation). However, the handler should document that it intentionally records churn for all origins (including archival and closure) for analytics purposes, unlike CR's reactive consumer which filters by origin for win-back scheduling. Without this note, the handler appears to be a P3 oversight. Additionally, AC-98 states "Does NOT schedule win-back" but does not mention the origin branching rationale.

**Fix — slice:**
- Section: §6 (`06-event-consumers.md` §6.2.2 handler, after the `recordChurnAnalysisEntry` call)
- Old: (no comment on origin handling)
- New: Add a comment: `// Note: Records churn for ALL origins (paddle, archival, closure) intentionally. // S9 analytics needs complete churn data regardless of origin. // This differs from CR's reactive consumer (S8) which branches on origin for win-back scheduling.`
- Section: AC-98 (index.md §15)
- Old: `subscription_ended consumer creates churn_analysis_log entry with event.reason and event.previousTier. Does NOT schedule win-back (S8 handles win-back scheduling).`
- New: `subscription_ended consumer creates churn_analysis_log entry with event.reason, event.origin, and event.previousTier for ALL origins (paddle, archival, closure). Branches on event.origin === "paddle" for win-back attribution refinement only. Does NOT schedule win-back (S8 handles win-back scheduling).`

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-98 amended (see above).

---

### S9-ST-9: `decay_signal_severity` pgEnum missing `"low"` value present in D&L §1.7 contract

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

### S9-ST-10: `account_closed` enrichment suspension internal contradiction (Pattern #14)

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

### S9-ST-11: `decay_signal_detected` event P1 payload — `signal.type` field naming ambiguity

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

### S9-ST-12: `decay_final_notice` email marked non-unsubscribable but `listing_status` category IS unsubscribable

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

### S9-ST-13: `OperationalHealthReport` type mismatch between §4 and §5 definitions

**Severity:** Low
**Slice section:** §4 (`04-ceremony-automation.md` §4.4), §5 (`05-entity-learning.md` §5.6)
**Upstream reference:** —

**Problem:** Two definitions of `OperationalHealthReport` exist in the slice. In §4 (`04-ceremony-automation.md` — `handleOperationalHealthReview`), the type is:
```typescript
type OperationalHealthReport = {
  hypotheses: { id, trend, currentValue, confoundWarning }[]
  healthTrends: { supportTickets30d, taskCompletionRate, decaySignals30d, qualityChanges30d }
}
```

In §5 (`05-entity-learning.md` §5.6), the type is:
```typescript
type OperationalHealthReport = {
  hypotheses: { id, trend, confoundWarning }[]  // missing currentValue
  supportTicketTrends: { openCount, closedCount, avgResolutionDays, topCategories }  // expanded
  taskCompletionRates: { totalTasks, completedTasks, completionRate, avgCompletionDays }  // expanded
  signalSummary: { decisionLogsThisPeriod, escalationsThisPeriod, ceremonyRunsThisPeriod }  // new
}
```

The §5 definition is richer and more complete (includes `topCategories`, `avgResolutionDays`, `signalSummary`). The §4 definition is a compressed summary. This is a Pattern #14 (content agent divergence) instance — two content agents independently defined the same type. The authoritative definition should be in §5 (which owns the handler implementation), with §4 referencing it.

**Fix — slice:**
- Section: §4 (`04-ceremony-automation.md` — `handleOperationalHealthReview` and its output type)
- Old: The full `OperationalHealthReport` type definition and the simplified pseudocode
- New: Replace the type definition with a reference: `// Authoritative type: §5 (05-entity-learning.md §5.6) OperationalHealthReport`. Update the pseudocode to match §5's field structure, or add a note that §4's pseudocode is a simplified representation and §5 is authoritative for handler code.

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-82 references the correct (§5) field set. No change needed.

---

### S9-ST-14: `churn_risk_detected` emission P1 compliance — proactive detection

**Severity:** Pass
**Slice section:** §5 (`05-entity-learning.md` §5.2.3)
**Upstream reference:** CR §1.2 `ChurnRiskDetectedEvent`

**Finding:** Correct. The `churn_risk_detected` emission in §5.2.1 pseudocode includes all 4 required fields: `type: "churn_risk_detected"`, `listingId`, `accountId`, `riskFactors: ChurnRiskFactor[]`, `timestamp`. The `riskFactors` array combines S8's reactive factors from `churn_risk_registry` with S9's proactive signals (`engagement_dropping`, `billing_cadence_switch_to_monthly`). Both proactive signal values are valid members of the `ChurnRiskFactor` union (CR §1.2 / CR §5). AC-74 explicitly tests payload conformance. No issue found.

---

### S9-ST-15: 2 new notification types not yet in SI §8.1

**Severity:** Pass
**Slice section:** §10
**Upstream reference:** SI §8.1

**Finding:** Correct. S9 introduces 2 new notification types: `enrichment_confirmation_due` and `ceremony_action_required`. Index.md §10 documents both with triggers. SI §8.1 declares `NotificationType` as an extensible union with the comment "Extensible: slices add notification types incrementally." The fix-applier will add these 2 entries to SI §8.1 when applying fixes. The slice correctly accounts for them in the cumulative count (17 + 2 = 19). No structural issue — this is expected incremental registration.

---

### S9-ST-16: `decay_signal_detected` consumer calls `hasActiveTicket` — return type conformance

**Severity:** Pass
**Slice section:** §6 (`06-event-consumers.md` §6.3.3)
**Upstream reference:** Ops §3.1 `hasActiveTicket`

**Finding:** Correct. The consumer calls `hasActiveTicket(event.listingId)` which returns `ActiveTicketRecord | null` per Ops §3.1. The handler checks for non-null return and accesses `activeTicket.ticketId` (UUID), which is a valid field on `ActiveTicketRecord`. The `ActiveTicketRecord` type has `{ ticketId: UUID, category: string, openedAt: ISO8601 }`. The consumer writes `ticketId` into the `checkDetails` JSONB annotation. Type conformance is correct (check #13 passed). AC-91 explicitly tests the annotation behaviour.

---

### S9-ST-17: Downstream flags S9-1, S9-2, S9-3 accuracy audit

**Severity:** Pass
**Slice section:** §13
**Upstream reference:** —

**Finding:** All 3 downstream flags are accurate:
- **S9-1** (enrichment cadence auto-adjustment): Correctly identifies that `enrichment_cadence_adjustment` decisions are logged but require principal review at V1. §2 implements the decision logging. S10 target is appropriate.
- **S9-2** (ceremony auto-apply graduation): Correctly identifies that `ceremony_outcome_evaluation` with `disposition: "auto_apply"` is not auto-applied at V1 — §4 `evaluateCeremonyOutcome` always returns `"escalate_to_principal"` for financial, user-visible, or first-time recommendations. Auto-apply only fires for low-risk precedented recommendations, but the downstream flag correctly notes S10 implements graduated auto-apply.
- **S9-3** (quality score algorithm versioning): Correctly identifies `algorithmVersion` field in schema (§11, `00-schema.md` §3.1) as the foundation for controlled rollout. S10 target is appropriate.

No missing downstream flags identified. All S10 dependencies are correctly scoped.

---

### S9-ST-18: `computeCompetitorBenchmark` S8-ST-3 compliance — `TaxonomyTag[]` usage

**Severity:** Pass
**Slice section:** §3.4
**Upstream reference:** D&L §3.1

**Finding:** Correct. `computeCompetitorBenchmark` in §3.4 accepts `taxonomyTags: TaxonomyTag[]` (not listing IDs). The function signature, inline comment ("NOT listing IDs"), and AC-42 all explicitly reference the S8-ST-3 fix. The competitor identification logic extracts `serviceArea` values from the passed `TaxonomyTag[]` array for the SQL overlap query. N+1 avoidance is also correct — batch `WHERE listingId IN (...)` queries replace per-competitor `getEngagementCounters` calls (AC-44).

---

### S9-ST-19: `quality_score_changed` event P1 payload conformance

**Severity:** Pass
**Slice section:** §1.3
**Upstream reference:** D&L §1.8 `QualityScoreChangedEvent`

**Finding:** Correct. The emission in §1.3 `evaluateQualityScoreBand` produces payload `{ type: "quality_score_changed", listingId, previousComposite, newComposite, changedDimensions }` which matches `QualityScoreChangedEvent` in D&L §1.8 exactly. The `changedDimensions` field is `string[]` (dimension names that changed value), consistent with the spec. AC-10 verifies this conformance.

---

## Summary

### Key Themes

1. **Three-part sync (S9-ST-1, S9-ST-3, S9-ST-4):** 3 High findings, all three-part sync gaps. 17 deferred actions, 7 decision types, and 4 email templates must be added to SI. This is the 10th consecutive occurrence of deferred action sync gaps (S0-S9). The largest single-slice addition: S9 adds 17 deferred actions (doubling the SI registry from 17 to 34). The notification types (S9-ST-15, Pass) are pre-covered by SI's extensibility note but should still be explicitly added during fix application.

2. **Pattern #14 recurrence — content agent divergence (S9-ST-2, S9-ST-10, S9-ST-13):** Three instances. S9-ST-2 is the highest-impact: §1.4 and §6.1.4 independently chose different non-existent fields for profile view dedup (`viewerAccountId` vs `sessionId`), and neither field exists on the event contract. S9-ST-10 shows §2.6 querying DB while §6.1.8 correctly uses event payload (P1 violation). S9-ST-13 shows two divergent type definitions for `OperationalHealthReport`. The index.md scope rule (§6 authoritative for handler code) resolves S9-ST-10 and S9-ST-13. S9-ST-2 requires a sibling spec change because neither field exists on the contract.

3. **Conversion gate attribution mismatch (S9-ST-7):** Medium but structurally important. The friction ratio computation depends on per-gate conversion counts that cannot be populated from `ConversionMilestoneEvent` alone — the event carries milestone IDs, not feature gate names. Without the fix, friction ratios would always produce false escalations (Infinity ratios). This is a compile-time-silent but runtime-significant error because the `metadata?.triggerGate` extraction falls back to `"unknown"`.

4. **Enum/type boundary violations (S9-ST-5, S9-ST-6, S9-ST-9):** Three instances of schema or pseudocode referencing values outside their upstream type definitions. `"professional"` is not a `SubscriptionTier` value (S9-ST-5). `"internal"` is not an `EmailCategory` value (S9-ST-6). `"low"` is in the D&L contract but not the pgEnum (S9-ST-9). Two of three would be caught at compile time by TypeScript; the third (S9-ST-5) is a SQL string literal that would fail silently at runtime (Pattern #15).

5. **Email category/unsubscribe consistency (S9-ST-6, S9-ST-12):** Two findings exposing email category misalignment. `principal_briefing` used a non-existent category; `decay_final_notice` used a category whose unsubscribe policy contradicts the intended behaviour. Both resolved by assigning category `"transactional"`.

6. **P3 documentation (S9-ST-8):** The `subscription_ended` intelligence consumer intentionally processes all origins (valid for analytics), but the handler lacked documentation explaining why it differs from CR's origin-branched consumer. Adding a comment and amending AC-98 to mention `event.origin` resolves the ambiguity.

7. **Event payload field availability (S9-ST-2, S9-ST-11):** S9-ST-2 is the highest-impact finding overall. Deduplication is a core S9 feature (resolves upstream flag S1-8) but depends on a field that does not exist on the cross-domain event contract. Requires PP §1.2 sibling spec amendment. S9-ST-11 is a naming clarity issue, not a structural gap.

### Upstream Flag Resolution Verification

Agent B verified 15 upstream flags claimed as resolved by S9. **14 of 15 fully verified. 1 partially blocked:**

| Flag | Claimed Resolution | Verified? | Notes |
|------|-------------------|-----------|-------|
| S1-2 | §1 quality scoring algorithms | Yes | `computeQualityScore` with 5 dimensions, composite 0-100. Fully specified. |
| S1-4 | §3 search terms + trend data | Yes | Aggregated from `search_performed` into `perception_aggregates`. |
| S1-8 | §1 profile_viewed P2 dedup | **Partial** | Logic specified, but dedup field (`viewerAccountId`) not on event payload (S9-ST-2). Blocked until PP §1.2 amended. |
| S1-11 | §2 account_closed enrichment suspension | Yes | §6.1.8 handler cancels deferred actions correctly. §2.6 has P1 violation (S9-ST-10) but §6 is authoritative. |
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

### Downstream Flag Audit

All 3 downstream flags (S9-1, S9-2, S9-3) are accurate and correctly scoped to S10. No missing downstream flags identified.

| Flag | Description | Target | Verified |
|------|-------------|--------|----------|
| S9-1 | Enrichment cadence auto-adjustment | S10 | Yes — `enrichment_cadence_adjustment` decisions logged but require principal review at V1 |
| S9-2 | Ceremony auto-apply graduation | S10 | Yes — `ceremony_outcome_evaluation` with `disposition: "auto_apply"` not auto-applied at V1 |
| S9-3 | Quality score algorithm versioning | S10 | Yes — `algorithmVersion` field in schema as foundation for controlled rollout |

### Sibling Spec Changes Required

| Document | Section | Change | Triggered By |
|----------|---------|--------|--------------|
| `interfaces/shared-infrastructure.md` | §2.1 | +17 `DeferredActionParamsMap` entries | S9-ST-1 |
| `interfaces/shared-infrastructure.md` | §2.2 | +17 registered action rows | S9-ST-1 |
| `interfaces/shared-infrastructure.md` | §5.2 | +4 email templates, count 26->30 | S9-ST-4 |
| `interfaces/shared-infrastructure.md` | §8.1 | +2 notification types, count 17->19 | S9-ST-15 (Pass but needs fix-applier action) |
| `interfaces/shared-infrastructure.md` | §9.2 | +7 decision types, count 19->26 | S9-ST-3 |
| `interfaces/platform-and-product.md` | §1.2 `ProfileViewedEvent` | Add `viewerAccountId?: UUID` | S9-ST-2 |
| `interfaces/platform-and-product.md` | §2 P1 fields table | Add `viewerAccountId` for `profile_viewed` | S9-ST-2 |
| `interfaces/data-and-listings.md` | §2 "Fields Used by D&L" table | Add `viewerAccountId` for `profile_viewed` | S9-ST-2 |

No changes to CR or Ops interface specs.

### Slice Fixes Required

| Section | Fix | Triggered By |
|---------|-----|--------------|
| §1.4 | Retain `viewerAccountId` reference (validated after PP §1.2 amendment) | S9-ST-2 |
| §2 `00-schema.md` §1 | Add `"low"` to `decaySignalSeverityEnum` | S9-ST-9 |
| §2.2 `02-decay-enrichment.md` | Add `"low"` severity branch to flowchart | S9-ST-9 |
| §2.2 `02-decay-enrichment.md` | Add `signal.type` naming disambiguation note | S9-ST-11 |
| §2.6 `02-decay-enrichment.md` | Replace DB query with P1-compliant `event.listingsArchived` | S9-ST-10 |
| §2.7 `02-decay-enrichment.md` + §9 index.md | Change `decay_final_notice` category from `"listing_status"` to `"transactional"` | S9-ST-12 |
| §4 `04-ceremony-automation.md` | Replace `'professional'` with `'partner'` in SQL | S9-ST-5 |
| §4 `04-ceremony-automation.md` | Reference §5 for `OperationalHealthReport` type | S9-ST-13 |
| §4 `04-ceremony-automation.md` + §9 index.md | Change `principal_briefing` category from `"internal"` to `"transactional"` | S9-ST-6 |
| §5 `05-entity-learning.md` §5.4.3 | Fix gate attribution to correlate with `conversion_trigger_evaluation` decision logs instead of non-existent `event.metadata` | S9-ST-7 |
| §6 `06-event-consumers.md` §6.1.4 | Replace `sessionId` with `viewerAccountId` for dedup | S9-ST-2 |
| §6 `06-event-consumers.md` §6.2.2 | Add P3 rationale comment for all-origin churn recording | S9-ST-8 |
| §6 `06-event-consumers.md` §6.2.3 | Update attribution logic to use trigger decision log correlation | S9-ST-7 |
| index.md §15 AC-65 | Add `category: "transactional"` to AC text | S9-ST-6 |
| index.md §15 AC-86 | Replace `sessionId` with `viewerAccountId` | S9-ST-2 |
| index.md §15 AC-90 | Amend to reflect trigger-decision-log correlation for gate attribution | S9-ST-7 |
| index.md §15 AC-98 | Add `event.origin` mention and all-origin rationale | S9-ST-8 |
