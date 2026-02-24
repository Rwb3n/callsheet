# S9 Stress Test — Part A (CR + Ops + SI Boundaries)

**Agent:** A
**Partition:** CR, Ops, SI interface boundaries — 12 scenarios
**Date:** 2026-02-15
**Slice version:** v1

---

## Summary Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S9-ST-A1 | Three-part sync: 17 new deferred actions missing from SI §2.1/§2.2 | High | §8 | SI §2.1/§2.2 | 17 new `DeferredActionParamsMap` entries and 17 registered action rows must be added to SI |
| S9-ST-A2 | `multi_listing_pricing_evaluation` SQL references non-existent tier `"professional"` | Medium | §4 | S1 §1.2 | SQL uses `'professional'` which is not a valid `SubscriptionTier` value |
| S9-ST-A3 | `principal_briefing` email template category `"internal"` not in `EmailCategory` union | Medium | §4, §9 | SI §5.1 | Category `"internal"` does not exist in SI §5.1 `EmailCategory` type |
| S9-ST-A4 | `conversion_milestone` consumer uses `event.milestone` as gate identifier but friction ratio computation uses feature gate names | Medium | §5, §6 | CR §1.1 | Mismatch between `ConversionMilestoneId` values and feature gate names used in friction ratio denominator |
| S9-ST-A5 | 7 new decision types missing from SI §9.2 registry | High | §1-§5 | SI §9.2 | SI §9.2 must add 7 new decision type entries for S9 |
| S9-ST-A6 | `subscription_ended` consumer does not branch on `event.origin` (P3) | Medium | §6 | Ops §1.2, SI §1.4 P3 | Handler records churn for all origins without distinguishing archival/closure from paddle |
| S9-ST-A7 | `churn_risk_detected` emission P1 compliance — proactive detection | Pass | §5 | CR §1.2 | Payload conforms to `ChurnRiskDetectedEvent` type |
| S9-ST-A8 | `operational_health_review` type mismatch between §4 and §5 definitions | Low | §4, §5 | — | Two `OperationalHealthReport` type definitions with divergent fields |
| S9-ST-A9 | 2 new notification types missing from SI §8.1 registry | Pass | §10 | SI §8.1 | Index.md §10 documents 2 new types; SI §8.1 extensibility note covers incremental addition |
| S9-ST-A10 | `decay_signal_detected` consumer calls `hasActiveTicket` — return type conformance | Pass | §6 | Ops §3.1 | Consumer correctly uses `ActiveTicketRecord.ticketId` |
| S9-ST-A11 | Downstream flags S9-1, S9-2, S9-3 accuracy audit | Pass | §13 | — | All 3 flags accurately describe V1 limitations with correct S10 targets |
| S9-ST-A12 | 4 new email templates missing from SI §5.2 registry | High | §9 | SI §5.2 | SI §5.2 must add 4 new template entries for S9 |

**Totals:** 3 High, 3 Medium, 1 Low, 5 Pass (42% pass rate)

---

## Findings

### S9-ST-A1: Three-part sync — 17 new deferred actions missing from SI §2.1/§2.2

**Severity:** High
**Slice section:** §8
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`, SI §2.2 registered actions table

**Problem:** S9 registers 17 new deferred action handlers (index.md §8 table). SI §2.1 `DeferredActionParamsMap` currently has 17 entries (S0-S8). The 17 new entries (`quality_score_recalculation`, `decay_liveness_check`, `enrichment_full_cycle`, `claim_abandonment_check`, `taxonomy_review_preparation`, `data_health_review`, `verification_calibration_review`, `provider_outreach_ranking`, `conversion_funnel_analysis`, `revenue_health_extended`, `multi_listing_pricing_evaluation`, `sponsored_placement_learning`, `operational_health_review`, `contractor_performance_review`, `principal_briefing_generation`, `proactive_churn_detection`, `learning_hypothesis_analysis`) do not yet exist in SI §2.1 or §2.2. This is the 10th consecutive three-part sync gap (S0-S9).

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

### S9-ST-A2: `multi_listing_pricing_evaluation` SQL references non-existent tier `"professional"`

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

### S9-ST-A3: `principal_briefing` email template category `"internal"` not in `EmailCategory` union

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

### S9-ST-A4: `conversion_milestone` consumer gate attribution uses `ConversionMilestoneId` as gate identifier, but friction ratio computation expects feature gate names

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

### S9-ST-A5: 7 new decision types missing from SI §9.2 registry

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

### S9-ST-A6: `subscription_ended` consumer does not branch on `event.origin` (P3 violation risk)

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

### S9-ST-A7: `churn_risk_detected` emission P1 compliance — proactive detection

**Severity:** Pass
**Slice section:** §5 (`05-entity-learning.md` §5.2.3)
**Upstream reference:** CR §1.2 `ChurnRiskDetectedEvent`

**Finding:** Correct. The `churn_risk_detected` emission in §5.2.1 pseudocode includes all 4 required fields: `type: "churn_risk_detected"`, `listingId`, `accountId`, `riskFactors: ChurnRiskFactor[]`, `timestamp`. The `riskFactors` array combines S8's reactive factors from `churn_risk_registry` with S9's proactive signals (`engagement_dropping`, `billing_cadence_switch_to_monthly`). Both proactive signal values are valid members of the `ChurnRiskFactor` union (CR §1.2 / CR §5). AC-74 explicitly tests payload conformance. No issue found.

---

### S9-ST-A8: `OperationalHealthReport` type mismatch between §4 and §5

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

### S9-ST-A9: 2 new notification types not yet in SI §8.1

**Severity:** Pass
**Slice section:** §10
**Upstream reference:** SI §8.1

**Finding:** Correct. S9 introduces 2 new notification types: `enrichment_confirmation_due` and `ceremony_action_required`. Index.md §10 documents both with triggers. SI §8.1 declares `NotificationType` as an extensible union with the comment "Extensible: slices add notification types incrementally." The fix-applier will add these 2 entries to SI §8.1 when applying fixes. The slice correctly accounts for them in the cumulative count (17 + 2 = 19). No structural issue — this is expected incremental registration.

---

### S9-ST-A10: `decay_signal_detected` consumer return type conformance with Ops `hasActiveTicket`

**Severity:** Pass
**Slice section:** §6 (`06-event-consumers.md` §6.3.3)
**Upstream reference:** Ops §3.1 `hasActiveTicket`

**Finding:** Correct. The consumer calls `hasActiveTicket(event.listingId)` which returns `ActiveTicketRecord | null` per Ops §3.1. The handler checks for non-null return and accesses `activeTicket.ticketId` (UUID), which is a valid field on `ActiveTicketRecord`. The `ActiveTicketRecord` type has `{ ticketId: UUID, category: string, openedAt: ISO8601 }`. The consumer writes `ticketId` into the `checkDetails` JSONB annotation. Type conformance is correct (check #13 passed). AC-91 explicitly tests the annotation behaviour.

---

### S9-ST-A11: Downstream flags S9-1, S9-2, S9-3 accuracy audit

**Severity:** Pass
**Slice section:** §13
**Upstream reference:** —

**Finding:** All 3 downstream flags are accurate:
- **S9-1** (enrichment cadence auto-adjustment): Correctly identifies that `enrichment_cadence_adjustment` decisions are logged but require principal review at V1. §2 implements the decision logging. S10 target is appropriate.
- **S9-2** (ceremony auto-apply graduation): Correctly identifies that `ceremony_outcome_evaluation` with `disposition: "auto_apply"` is not auto-applied at V1 — §4 `evaluateCeremonyOutcome` always returns `"escalate_to_principal"` for financial, user-visible, or first-time recommendations. Auto-apply only fires for low-risk precedented recommendations, but the downstream flag correctly notes S10 implements graduated auto-apply.
- **S9-3** (quality score algorithm versioning): Correctly identifies `algorithmVersion` field in schema (§11, `00-schema.md` §3.1) as the foundation for controlled rollout. S10 target is appropriate.

No missing downstream flags identified. All S10 dependencies are correctly scoped.

---

### S9-ST-A12: 4 new email templates missing from SI §5.2 registry

**Severity:** High
**Slice section:** §9
**Upstream reference:** SI §5.2

**Problem:** S9 introduces 4 new email templates: `decay_final_notice`, `enrichment_confirmation_request`, `credit_confirmation_outreach`, `principal_briefing`. SI §5.2 currently lists 26 templates (14 Platform Transactional + 5 Operations Compliance + 1 Subscription + 5 Commercial Conversion + 1 support_acknowledgment). The 4 new templates must be added to SI §5.2. The slice correctly claims "30 templates after S9" in the cumulative snapshot (§11). Note that template categorisation needs care:
- `decay_final_notice`: category `"listing_status"`, unsubscribable Yes (matches S7's `listing_decay_warning`)
- `enrichment_confirmation_request`: category `"listing_status"`, unsubscribable No (operational data accuracy — §4 explicitly states this)
- `credit_confirmation_outreach`: category `"listing_status"`, unsubscribable Yes
- `principal_briefing`: category `"transactional"` (per S9-ST-A3 fix), unsubscribable No

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2
- Change: Add 4 new templates under appropriate groupings:

**Operations / Intelligence (add to existing Operations section or create new Intelligence section):**

| Template ID | Trigger | Unsubscribable |
|---|---|---|
| `decay_final_notice` | Unresolved high/critical decay signal >90 days | Yes |
| `enrichment_confirmation_request` | Claimed listing with no edits for >12 months | No |
| `credit_confirmation_outreach` | Credit `verifiedAt` between 330-365 days ago | Yes |
| `principal_briefing` | Monthly principal briefing generation | No |

Update template count from 26 to 30 in §5.2 header: `type EmailTemplateId = /* union of 30 template IDs — see §5.2 */`

**Acceptance criteria impact:** None (SI document change)

---

## Summary

### Key Themes

1. **Three-part sync (S9-ST-A1, A5, A12):** 3 High findings, all three-part sync gaps. 17 deferred actions, 7 decision types, and 4 email templates must be added to SI. This is the 10th consecutive occurrence of deferred action sync gaps (S0-S9). The notification types (A9) are pre-covered by SI's extensibility note but should still be explicitly added during fix application.

2. **Content agent divergence (S9-ST-A8):** Pattern #14 recurrence. §4 and §5 independently define `OperationalHealthReport` with different field structures. Low severity because §5 is clearly more complete and AC-82 references the correct fields. Designating §5 as authoritative and making §4 reference it eliminates the ambiguity.

3. **Conversion gate attribution mismatch (S9-ST-A4):** Medium but structurally important. The friction ratio computation depends on per-gate conversion counts that cannot be populated from `ConversionMilestoneEvent` alone — the event carries milestone IDs, not feature gate names. Without the fix, friction ratios would always produce false escalations (Infinity ratios). This is a compile-time-silent but runtime-significant error because the `metadata?.triggerGate` extraction falls back to `"unknown"`.

4. **Enum/type boundary violations (S9-ST-A2, A3):** Two instances of pseudocode referencing values outside their upstream type definitions. `"professional"` is not a `SubscriptionTier` value; `"internal"` is not an `EmailCategory` value. Both would be caught at compile time by TypeScript, but they indicate the content agents did not cross-reference the S1 enum definition and SI §5.1 type definition respectively.

5. **P3 compliance (S9-ST-A6):** The `subscription_ended` intelligence consumer intentionally processes all origins (valid for analytics), but the handler lacks documentation explaining why it differs from CR's origin-branched consumer. Adding a comment and amending AC-98 to mention `event.origin` resolves the ambiguity.

### Downstream Flag Audit

All 3 downstream flags (S9-1, S9-2, S9-3) are accurate and correctly scoped to S10. No missing downstream flags identified.

### Sibling Spec Changes Required

| Document | Section | Change | Triggered By |
|----------|---------|--------|--------------|
| `shared-infrastructure.md` | §2.1 | +17 `DeferredActionParamsMap` entries | S9-ST-A1 |
| `shared-infrastructure.md` | §2.2 | +17 registered action rows | S9-ST-A1 |
| `shared-infrastructure.md` | §5.2 | +4 email templates, count 26→30 | S9-ST-A12 |
| `shared-infrastructure.md` | §8.1 | +2 notification types, count 17→19 | S9-ST-A9 (Pass but needs fix-applier action) |
| `shared-infrastructure.md` | §9.2 | +7 decision types, count 19→26 | S9-ST-A5 |

No changes to CR, Ops, D&L, or PP interface specs.

### Slice Fixes Required

| Section | Fix | Triggered By |
|---------|-----|--------------|
| §4 `04-ceremony-automation.md` | Replace `'professional'` with `'partner'` in SQL | S9-ST-A2 |
| §4 `04-ceremony-automation.md` | Reference §5 for `OperationalHealthReport` type | S9-ST-A8 |
| §4 `04-ceremony-automation.md` + §9 index.md | Change `principal_briefing` category from `"internal"` to `"transactional"` | S9-ST-A3 |
| §5 `05-entity-learning.md` §5.4.3 | Fix gate attribution to correlate with `conversion_trigger_evaluation` decision logs instead of non-existent `event.metadata` | S9-ST-A4 |
| §6 `06-event-consumers.md` §6.2.2 | Add P3 rationale comment for all-origin churn recording | S9-ST-A6 |
| §6 `06-event-consumers.md` §6.2.3 | Update attribution logic to use trigger decision log correlation | S9-ST-A4 |
| index.md §15 AC-65 | Add `category: "transactional"` to AC text | S9-ST-A3 |
| index.md §15 AC-90 | Amend to reflect trigger-decision-log correlation for gate attribution | S9-ST-A4 |
| index.md §15 AC-98 | Add `event.origin` mention and all-origin rationale | S9-ST-A6 |
