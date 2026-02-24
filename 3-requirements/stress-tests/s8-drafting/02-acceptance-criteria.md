# S8 Consolidated Acceptance Criteria

**Extracted from:** 6 content files
**Total AC:** 86

---

### §1 Conversion Trigger Engine (13 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-1 | `view_milestone` fires at 50, 100, 200 profile views for free-tier listings. Each milestone fires exactly once. State records `lastViewMilestoneFired` with the crossed threshold. | Integration |
| AC-2 | `view_milestone` respects 7-day cooldown between milestone emails. A listing crossing 50 and 100 within 5 days receives the 50-milestone email immediately and the 100-milestone email after the cooldown expires. | Integration |
| AC-3 | `first_enquiry` fires exactly once when `getEngagementCounters(listingId).enquiriesReceived === 1` for a free-tier listing. Subsequent enquiries do not re-trigger. | Integration |
| AC-4 | `competitor_upgraded` respects 30-day cooldown and maxFirings=3. After 3 firings, further competitor upgrades in the same sector do not trigger. Anonymity threshold (pool >= 20) is enforced. | Integration |
| AC-5 | `analytics_teaser` fires on 14-day cooldown for free-tier listings with `profileViews > 0`. `social_proof` fires on 30-day cooldown when sector has >= 3 paid listings. `engagement_summary` fires on 7-day cooldown when any engagement data exists. | Integration |
| AC-6 | Endowment CTA displays "See who's viewing your profile" on the free-tier analytics section when `profileViews >= 5`. Category fallback displays aggregate data when `profileViews < 5` but `categoryStats.monthlySearches > 20`. `endowmentCtaShown` is set only by the primary variant, not the fallback. | Integration |
| AC-7 | All `conversion_milestone` emissions match `ConversionMilestoneEvent` payload type (CR §1.1): `type`, `listingId`, `accountId`, `milestone` (typed `ConversionMilestoneId`), `milestoneLabel`, `timestamp`. | Unit |
| AC-8 | Email merge fields for `conversion_view_milestone` include `listingName`, `milestoneValue`, `upgradeUrl`. Merge fields for `conversion_analytics_teaser` include `listingName`, `viewCount`, `shortlistCount`, `upgradeUrl`. Merge fields for `conversion_social_proof` include `listingName`, `competitorName` (anonymised), `upgradeUrl`. Merge fields for `conversion_engagement_summary` include `listingName`, `viewCount`, `enquiryCount`, `upgradeUrl`. | Unit |
| AC-9 | All conversion emails use `category: "conversion_marketing"`. `EmailService.send()` returns `status: "suppressed"` for unsubscribed providers. Trigger state is still updated even when email is suppressed. | Integration |
| AC-10 | `evaluateUpgradeSuggestion` returns the highest-priority unfired trigger as an `UpgradeSuggestion` for free-tier listings. Returns `null` for non-free-tier listings or when no triggers are eligible. Ownership check ensures `ctx.session.accountId` matches `listings.accountId`. | Integration |
| AC-11 | `getConversionTriggerState` returns default zero-state when no `commercial_state` row exists. Returns full trigger tracking fields when row exists. Ownership check enforced. | Integration |
| AC-12 | `claim_approved` consumer resets all conversion trigger state: all `*Fired` counters to 0/false, all `last*At` timestamps to null, `endowmentCtaShown` to false. Churn fields (`lastChurnEventAt`, `lastChurnReason`, `effectivePriceAtSubscription`) are preserved. | Integration |
| AC-13 | Every trigger evaluation is logged as `conversion_trigger_evaluation` decision type with inputs (triggerType, listingId, subscriptionTier) and output (fired, reason). | Integration |

---

### §2 Churn Detection & Intervention (8 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-14 | When `subscription_ended` fires with `origin: "paddle"` and `reason: "cancellation"`, the consumer calls `evaluateChurnIntervention` with engagement data from `getEngagementCounters(listingId)` and returns one of `show_retention_data | accept | grace_period`. | Integration |
| AC-15 | When `evaluateChurnIntervention` returns `show_retention_data`, the response contains `enquiries > 0 OR views > 50` and S5 can render the retention UI. If the provider confirms cancellation, churn is logged and win-back is scheduled. | Integration |
| AC-16 | When `subscription_ended` fires with `reason: "grace_period_expired"`, the consumer logs churn with `reason: "payment_failure"` and emits `churn_risk_detected` with `riskFactors` containing `"payment_at_risk"`. | Integration |
| AC-17 | For each of the 5 `ChurnRiskFactor` values (`low_quality_paid`, `payment_at_risk`, `quality_declining`, `engagement_dropping`, `billing_cadence_switch_to_monthly`), `churn_risk_detected` is emitted with the correct factor from the documented detection signal. | Integration |
| AC-18 | `churn_risk_detected` emission matches `EventPayloadMap` exactly: `{ type, listingId, accountId, riskFactors: ChurnRiskFactor[], timestamp }`. No extra fields, no missing fields (P1). | Unit |
| AC-19 | `pending_cancellation_created` is emitted on all 3 trigger paths (voluntary cancellation, account closure, listing archival) with correct `CancellationReason` value and `paddleSubscriptionId` from the listing. | Integration |
| AC-20 | Every churn path writes to `churn_analysis_log` with correct `eventType: "churn"`, `reason` matching `CancellationReason`, `subscriptionTier` from event payload or local state, and `annualRevenue` as negative value matching `PRICING` config. | Integration |
| AC-21 | Every `evaluateChurnIntervention` invocation produces a `DecisionLog` entry with `decisionType: "churn_intervention"`, capturing inputs and output. | Integration |

---

### §3 Win-Back Evaluation & Delivery (7 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-22 | `win_back_evaluation` deferred action is scheduled at exactly 60 days after `subscription_ended` only when `event.origin === "paddle"`. Not scheduled for `origin: "archival"` or `"closure"`. | Integration |
| AC-23 | `evaluateWinBack` returns `no_action` with reason `"listing_not_active"` when `lifecycleStatus !== "active"`, and `"listing_ownership_changed"` when current owner differs from `cancelledAccountId`. | Integration |
| AC-24 | `evaluateWinBack` returns `send_email` with fully populated `mergeFields` (subject, body, listingName, and at least one of enquiryCount/viewCount) when engagement thresholds are met (enquiries > 3 OR views > 100). | Integration |
| AC-25 | `winback_eligible` emission matches `EventPayloadMap` exactly: `{ type, listingId, cancelledAccountId, mergeFields: { subject, body, listingName, enquiryCount?, viewCount? }, timestamp }` (P1). | Unit |
| AC-26 | Pending `win_back_evaluation` deferred actions are cancelled on `claim_approved` (for the reclaimed listing), `erasure_completed` (for all affected listings), and `account_closed` (for all listings in `listingsArchived`). | Integration |
| AC-27 | When a former subscriber resubscribes within 90 days of a `win_back_sent` log entry, a `win_back_converted` entry is written to `churn_analysis_log` with attribution metadata. | Integration |
| AC-28 | Every `evaluateWinBack` invocation produces a `DecisionLog` entry with `decisionType: "winback_evaluation"`, capturing inputs and output. | Integration |

---

### §4 Sponsored Placement (10 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-29 | `commercial.getSponsoredListings` returns `SponsoredListingResult[]` with 0–3 entries. Each entry has `listingId: UUID`, `position: number` (0-indexed), `isSponsored: true`. | Integration |
| AC-30 | Only listings with `subscriptionTier` in `["premium", "partner"]`, `lifecycleStatus === "active"`, `accountId !== null`, and taxonomy overlap with the query's `sectorId`/`serviceAreaIds` appear as candidates. | Integration |
| AC-31 | Candidates with `qualityScores.composite < 50` are excluded. | Integration |
| AC-32 | Slot count follows the progression: 0 slots if < 3 qualified candidates, 1 if 3–5, 2 if 6–10, 3 if > 10. | Unit |
| AC-33 | Rotation offset is deterministic: same listing ID + same UTC date produces the same offset. Different dates produce different offsets. | Unit |
| AC-34 | Listings exceeding 3x mean impressions for the queried service area in the 30-day window are excluded from selection. | Integration |
| AC-35 | Each sponsored listing served produces one `sponsored_impressions` row per relevant service area with correct `listingId`, `serviceAreaId`, and `impressionDate`. | Integration |
| AC-36 | `sponsored_impressions` rows older than 90 days are deleted during fairness cap evaluation. | Integration |
| AC-37 | Anonymous users (no `ctx.session`) do not receive sponsored listings — PP conditionally skips the call. | Integration |
| AC-38 | Every invocation logs a `sponsored_placement_selection` decision with `candidateCount`, `qualifiedCount`, `fairnessCappedCount`, `selectedListingIds`, and `slotCount`. | Integration |

---

### §5 Revenue Perception & Metrics (8 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-39 | `computeRevenuePerception` returns MRR calculated as SUM of (annualPrice / 12) for annual subscribers and monthlyPrice for monthly subscribers, using the `PRICING` const for tier-to-price mapping. | Unit |
| AC-40 | `computeRevenuePerception` returns ARR = MRR × 12. | Unit |
| AC-41 | `tierDistribution` returns a `Record<SubscriptionTier, number>` with counts for all 4 tiers (including free), summing to total active listings. | Unit |
| AC-42 | `churnRate30d` and `churnRate90d` compute as (churns in period / paid at start of period) × 100, where paid-at-start is approximated as current paid + churns in period. Returns 0 when no paid listings exist. | Unit |
| AC-43 | `conversionRate30d` computes as (conversion events in 30 days / free claimed listings) × 100. Excludes unclaimed listings (accountId IS NULL) from denominator. Returns 0 when no free claimed listings exist. | Unit |
| AC-44 | `netRevenueRetention` computes as ((startMRR + monthly upgrades − monthly downgrades − monthly churn revenue) / startMRR) × 100, with annual revenue deltas from `churn_analysis_log` divided by 12. Returns 0 when MRR is 0. | Unit |
| AC-45 | `evaluateRevenueHealth` returns `"critical"` when churnRate30d > 8% or NRR < 90%; `"warning"` when churnRate30d is 3–8%, NRR is 90–100%, or conversionRate30d < 2%; `"healthy"` otherwise. Each metric produces an independent signal. | Unit |
| AC-46 | `commercial.getRevenuePerception` route is `adminProcedure` (returns 403 for non-admin sessions). Returns the full `RevenuePerception` type. | Integration |

---

### §6 Feature Gate Friction Evaluation (3 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-47 | `evaluateFeatureGateFriction` returns `"critical"` for any gate with `frictionRatio > 0.15` and `"warning"` for `frictionRatio > 0.05`. | Unit |
| AC-48 | `overallLevel` equals the worst severity across all gate assessments (critical > warning > ok). | Unit |
| AC-49 | Each `GateFrictionAssessment` includes the gate name, ticket count, friction ratio, and a non-empty recommendation string. | Unit |

---

### §7 Low-Quality Intervention (5 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-50 | `triggerLowQualityIntervention` creates a `quality_score_changed` notification with the listing's current composite score and a link to the listing's quality page. | Integration |
| AC-51 | `triggerLowQualityIntervention` schedules a `check_quality_improvement` deferred action with `baselineScore` equal to the current composite and `executeAt` 30 days from now. | Integration |
| AC-52 | `handleCheckQualityImprovement` emits `churn_risk_detected` with `riskFactors: ["low_quality_paid"]` when the listing's quality score remains below 40 after 30 days. | Integration |
| AC-53 | `handleCheckQualityImprovement` takes no action (no event emitted) when the listing's quality score has improved to 40 or above. | Integration |
| AC-54 | `handleCheckQualityImprovement` takes no action when the listing no longer exists, has no quality score, or has been downgraded to free tier. | Integration |

---

### §8 Refund Evaluation (5 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-55 | `evaluateRefund` returns `refundType: "deny"` when `enquiriesReceivedSinceSubscription > 10`, regardless of subscription age. | Unit |
| AC-56 | `evaluateRefund` returns `refundType: "deny"` when a prior refund was issued within the last 12 months for the same listing. | Unit |
| AC-57 | `evaluateRefund` returns `refundType: "full"` with `amount` equal to `effectivePriceAtSubscription` when subscription age is 30 days or less and no deny guards trigger. | Unit |
| AC-58 | `evaluateRefund` returns `refundType: "partial"` with a pro-rata amount when subscription age is 31-90 days and no deny guards trigger. | Unit |
| AC-59 | `evaluateRefund` returns `refundType: "deny"` when subscription age exceeds 90 days. | Unit |

---

### §9 Pricing Configuration (4 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-60 | `PRICING` export is typed as `Record<SubscriptionTier, { annual: number; monthly: number }>` and satisfies the constraint at compile time. | Unit |
| AC-61 | `PRICING` values match: free 0/0, standard 199/19, premium 399/39, partner 699/69. | Unit |
| AC-62 | Launch discount writes `effectivePriceAtSubscription` to `commercial_state` at the discounted amount (e.g., 99), not the standard rate (199). `PRICING` const is unaffected. | Integration |
| AC-63 | No multi-listing discount logic exists in S8. Each listing subscription is priced independently using `PRICING[tier]`. | Unit |

---

### §10 Event Consumer Implementations (18 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-64 | The `subscription_tier_changed` handler upserts `commercial_state` and appends a `churn_analysis_log` entry with `eventType` set to `"conversion"` (free to paid), `"upgrade"` (paid to higher paid), or `"downgrade"` (paid to lower paid). The `annualRevenue` field reflects the revenue delta. | Integration |
| AC-65 | The `subscription_tier_changed` handler emits `conversion_milestone` with `milestone: "first_subscription"` when `previousTier === "free"`. The emission payload includes all 5 fields specified in CR §1.1 (`listingId`, `accountId`, `milestone`, `milestoneLabel`, `timestamp`). | Integration |
| AC-66 | The `subscription_tier_changed` handler sets `effectivePriceAtSubscription` on `commercial_state` only on free-to-paid conversion. Subsequent upgrades/downgrades do not overwrite this field. | Integration |
| AC-67 | The `subscription_ended` handler branches on `origin`: when `origin === "paddle"`, it calls `evaluateChurnIntervention` and schedules `win_back_evaluation` at 60 days; when `origin === "archival"` or `"closure"`, it logs churn only and does not schedule win-back. | Integration |
| AC-68 | The `subscription_ended` handler emits `churn_risk_detected` with `riskFactors` including `"payment_at_risk"` when `reason === "payment_failure"` and `origin === "paddle"`. The emission payload includes all 4 fields specified in CR §1.2. | Integration |
| AC-69 | The `subscription_ended` handler updates `commercial_state.lastChurnEventAt` and `lastChurnReason` for all origin types. | Integration |
| AC-70 | The `claim_approved` handler resets all conversion trigger fields on `commercial_state` (CR-29): all `*Fired` counters to 0/false, all `last*At` timestamps to null, `endowmentCtaShown` to false. Fields `lastChurnEventAt`, `lastChurnReason`, and `effectivePriceAtSubscription` are preserved. | Integration |
| AC-71 | The `claim_approved` handler cancels all pending `win_back_evaluation` deferred actions matching `params.listingId` (CR-X-17). If cancelled win-backs existed, a `win_back_converted` entry is appended to `churn_analysis_log`. | Integration |
| AC-72 | The `listing_archived` handler logs churn only when `subscriptionTier !== "free"` AND `accountId !== null`. Free-tier archival and unclaimed-listing cleanup produce no `churn_analysis_log` entry. | Integration |
| AC-73 | The `quality_score_changed` handler calls `triggerLowQualityIntervention` (§7) only when all three conditions hold: (a) `newComposite < 40`, (b) listing `subscriptionTier !== "free"`, (c) subscription age exceeds 14 days (read from `listings.subscriptionStartDate` via join per D1). | Integration |
| AC-74 | The `account_closed` handler cancels pending `win_back_evaluation` deferred actions for every listing in `listingsArchived`. It logs a `churn` entry in `churn_analysis_log` with `reason: "account_closed"` for each paid listing. | Integration |
| AC-75 | The `account_closed` handler skips churn logging for free-tier listings in `listingsArchived`. | Integration |
| AC-76 | The `enquiry_submitted` handler calls `getEngagementCounters(listingId)` (D&L §3.2) and fires the `first_enquiry` conversion trigger only when `enquiriesReceived === 1` AND `commercial_state.firstEnquiryTriggerFired === false` AND `subscriptionTier === "free"`. Resolves S6-2. | Integration |
| AC-77 | The `erasure_completed` handler cancels pending `win_back_evaluation` deferred actions for all listings in `listingIdsAnonymised ∪ listingIdsDeleted`. | Integration |
| AC-78 | The `erasure_completed` handler anonymises `churn_analysis_log` entries by setting `accountId = null` and `accountHash = payload.accountHash` for all entries matching any listing in `listingIdsAnonymised ∪ listingIdsDeleted`. Matching is by `listingId`, not by `accountId` (CR-ST-15). | Integration |
| AC-79 | The `erasure_completed` handler clears all conversion trigger fields on `commercial_state` for affected listings (same reset as CR-29 in claim_approved). | Integration |
| AC-80 | All 8 consumer handlers are idempotent (P2). Duplicate event delivery produces the same outcome as single delivery. Specifically: `churn_analysis_log` entries are append-only but `commercial_state` upserts converge to the same final state regardless of replay count. | Integration |
| AC-81 | All event emissions from §10 handlers satisfy P1 payload self-containment: every emitted event's fields match the authoritative `EventPayloadMap` entry in SI §1.2. | Unit |

---

## Summary by Section

| Section | AC Range | Count |
|---------|----------|-------|
| §1 Conversion Trigger Engine | AC-1 to AC-13 | 13 |
| §2 Churn Detection & Intervention | AC-14 to AC-21 | 8 |
| §3 Win-Back Evaluation & Delivery | AC-22 to AC-28 | 7 |
| §4 Sponsored Placement | AC-29 to AC-38 | 10 |
| §5 Revenue Perception & Metrics | AC-39 to AC-46 | 8 |
| §6 Feature Gate Friction Evaluation | AC-47 to AC-49 | 3 |
| §7 Low-Quality Intervention | AC-50 to AC-54 | 5 |
| §8 Refund Evaluation | AC-55 to AC-59 | 5 |
| §9 Pricing Configuration | AC-60 to AC-63 | 4 |
| §10 Event Consumer Implementations | AC-64 to AC-81 | 18 |

**Total Acceptance Criteria: 81**
