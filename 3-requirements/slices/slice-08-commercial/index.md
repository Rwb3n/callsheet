# Slice 8: Commercial & Revenue

**Status:** Draft v2 (STRESS TESTED)
**Primary Owner:** Commercial & Revenue
**Last updated:** 2026-02-15
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, subscription tier), S3 (claim approval event emission, verification tier data), S4 (subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle), S5 (provider dashboard UI surfaces for conversion triggers and churn intervention), S7 (churn risk registry, pending cancellation registry, support ticket queries, win-back email delivery)
**Inputs:** `interfaces/shared-infrastructure.md` (v8), `interfaces/commercial-and-revenue.md` (v3), `interfaces/operations.md` (v4), `interfaces/data-and-listings.md` (v5), `interfaces/platform-and-product.md` (v6), `2-concept-design/commercial-and-revenue.md` (v4), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-07-operations/index.md` (v2)
**Downstream:** S9 (Entity Intelligence), S10 (Hardening)

---

## Summary

S8 implements the Commercial & Revenue sub-entity's operational logic — a domain-logic slice, not UI-heavy. UI surfaces for CR logic already exist in S5 (provider dashboard) and S6 (search results, buyer experience); S8 provides the decision architectures and event-driven computation that those surfaces consume. The slice delivers 6 conversion triggers with per-trigger cooldowns and lifetime firing caps, churn detection across 5 paths (voluntary cancellation, payment failure, archival, account closure, Paddle reconciliation), win-back evaluation with 60-day deferred scheduling, sponsored placement selection with deterministic rotation and per-service-area fairness monitoring, revenue perception metrics (MRR, ARR, tier distribution, churn rates, conversion rate, NRR), feature gate friction evaluation, low-quality intervention with 30-day quality re-check, refund evaluation decision architecture, and pricing configuration with the `PRICING` const.

S8 registers 8 event consumers (all async), 2 deferred action handlers (`win_back_evaluation` — existing, `check_quality_improvement` — new), 4 tRPC routes (3 query, 0 mutation: `getSponsoredListings`, `getRevenuePerception`, `evaluateUpgradeSuggestion`, `getConversionTriggerState`), 3 new tables (`commercial_state`, `churn_analysis_log`, `sponsored_impressions`), 0 table amendments, and 0 new pgEnums. All CR logic is event-driven or deferred-action-driven; the route surface is minimal because CR owns computation while PP owns the UI surface.

S8 resolves 11 upstream flags (S4-2, S4-3, S4-4, S4-5, S4-9, S5-1, S5-2, S6-1, S6-2, S7-1, S7-5) and 1 open question (CR-Q2: monthly pricing display values confirmed as £19/£39/£69). Total: 81 acceptance criteria across 10 sections.

## V1 Scope Boundary

**In scope:**
- Conversion trigger engine: 6 triggers (`view_milestone`, `first_enquiry`, `competitor_upgraded`, `analytics_teaser`, `social_proof`, `engagement_summary`) with condition evaluation, cooldown enforcement, lifetime firing caps, endowment CTA, cold-start intervention
- Churn detection across 5 paths with `evaluateChurnIntervention` decision architecture and `churn_risk_detected` emission
- Win-back evaluation: 60-day deferred action, `evaluateWinBack` decision architecture, merge field construction for `winback_eligible` emission
- Sponsored placement: `selectSponsoredListings` algorithm with quality floor (>=50), deterministic rotation, fairness cap (3x mean impressions per service area), 0–3 slot progression
- Revenue perception: 8-metric `RevenuePerception` type computation, `evaluateRevenueHealth` threshold evaluation (critical/warning/healthy), admin route
- Feature gate friction evaluation: monthly ceremony consuming Ops `getFeatureGateFrictionSummary`, per-gate assessment with escalation thresholds
- Low-quality intervention: notification + 30-day `check_quality_improvement` deferred action with `churn_risk_detected` emission on unresolved quality
- Refund evaluation: `evaluateRefund` decision architecture (full/partial/deny) with 30-day full, 31–90 day pro-rata, >90 day deny, engagement guard, prior refund guard
- Pricing configuration: `PRICING` const (free 0/0, standard 199/19, premium 399/39, partner 699/69), launch discount interaction
- 8 event consumer handler implementations for all CR-consumed events

**Deferred:**
- Advanced revenue health evaluation (per-tier churn, annual renewal rate, discount cohort divergence, LTV, CAC) — S9
- Conversion-denominated friction ratios (per-gate conversions as denominator instead of total tickets) — S9
- Learned churn prediction model (proactive `engagement_dropping` and `billing_cadence_switch_to_monthly` detection) — S9
- Multi-listing pricing discount evaluation (`evaluateMultiListingPricingEvolution` quarterly ceremony) — S9
- Sponsored placement decision learning (quality floor calibration, fairness cap tuning from decision logs) — S9
- Conversion trigger threshold auto-tuning from entity learning feedback loops — S9
- Win-back attribution window refinement (V1: 90-day planning assumption) — S9
- Point-in-time snapshot denominators for churn/conversion rate precision — S9

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions: 3 new tables (`commercial_state`, `churn_analysis_log`, `sponsored_impressions`), 0 amendments, 0 pgEnums, cumulative snapshot |
| 00 | `00-router-plan.md` | 4 tRPC routes, 8 consumer handlers, 2 deferred action handlers, file tree |
| 01 | `01-conversion-triggers.md` | §1 Conversion Trigger Engine |
| 02 | `02-churn-and-winback.md` | §2 Churn Detection & Intervention, §3 Win-Back Evaluation & Delivery |
| 03 | `03-sponsored-placement.md` | §4 Sponsored Placement |
| 04 | `04-revenue-perception.md` | §5 Revenue Perception & Metrics |
| 05 | `05-support-sections.md` | §6 Feature Gate Friction Evaluation, §7 Low-Quality Intervention, §8 Refund Evaluation, §9 Pricing Configuration |
| 06 | `06-event-consumers.md` | §10 Event Consumer Implementations (8 consumers) |

---

## §11 Event Consumers Registered in S8

S8 registers 8 event consumers. All `domain: "commercial"`, all `mode: "async"`. All consumers already exist in `EVENT_CONSUMER_MATRIX` (SI §1.3) — registered during CR interface spec drafting. S8 provides handler implementations for these 8 consumers. [Source: `s8-pre-draft-checklist.md` §4]

| Event | Consumer ID | Mode | Handler Description |
|-------|------------|------|---------------------|
| `subscription_tier_changed` | `commercial:subscription_tier_changed:revenueMetricsUpdate` | async | Update revenue metrics (MRR, tier distribution). Log conversion or downgrade. |
| `subscription_ended` | `commercial:subscription_ended:churnLogging` | async | Log churn with reason. If `origin === "paddle"`: schedule `win_back_evaluation` at 60 days. If `origin === "archival" \| "closure"`: churn log only (P3 branch). |
| `claim_approved` | `commercial:claim_approved:conversionReset` | async | Log conversion funnel entry. Reset conversion trigger state for listing (CR-29). Cancel pending win-back schedules for the listing (CR-X-17). |
| `listing_archived` | `commercial:listing_archived:archivalChurn` | async | If `subscriptionTier !== "free"` AND `accountId !== null`: log churn (voluntary archival). |
| `quality_score_changed` | `commercial:quality_score_changed:lowQualityIntervention` | async | If paid AND `newComposite < 40` AND subscription age >14 days: trigger low-quality intervention (§7). |
| `account_closed` | `commercial:account_closed:closureChurn` | async | Log churn. Cancel win-back schedules for all `listingsArchived`. Update per-listing revenue metrics from CR-local state. |
| `enquiry_submitted` | `commercial:enquiry_submitted:firstEnquiryTrigger` | async | Evaluate `first_enquiry` conversion trigger via D&L `getEngagementCounters(listingId)` query-in-handler. |
| `erasure_completed` | `commercial:erasure_completed:erasureCleanup` | async | Cancel win-back schedules for `listingIdsAnonymised ∪ listingIdsDeleted`. Anonymise churn log entries (replace `accountId` with `accountHash`). Clear conversion trigger state. |

**EVENT_CONSUMER_MATRIX delta:** +0 entries. All 8 consumers already registered. S8 implements handlers only.

---

## §12 Deferred Actions Registered in S8

S8 adds 1 new deferred action. `win_back_evaluation` already registered in SI §2.1/§2.2 during S4 spec work. [Source: `s8-pre-draft-checklist.md` §1]

| Action | Params Type | Owner | Schedule | Retry | On Failure | New? |
|--------|-------------|-------|----------|-------|------------|------|
| `win_back_evaluation` | `{ listingId: UUID; accountId: UUID }` | Commercial | 60 days after `subscription_ended` (paddle origin only) | `once` | `log` | No (registered in S4) |
| `check_quality_improvement` | `{ listingId: UUID; baselineScore: number }` | Commercial | 30 days after low-quality intervention fires | `once` | `log` | **Yes** |

**Cancel conditions:**
- `win_back_evaluation`: cancelled on `claim_approved` (reclaim) or `erasure_completed`
- `check_quality_improvement`: never cancelled (fires once at scheduled time or expires)

**Total DeferredActionParamsMap entries after S8:** 17 (16 from S7 + 1 new).

---

## §13 Email Templates Used in S8

S8 adds 0 new email templates. All conversion/win-back templates already registered in SI §5.2 during prior phases. S8 specifies merge field population for the 5 conversion templates it triggers. [Source: `s8-pre-draft-checklist.md` §2]

| Template ID | Category | Trigger | Merge Fields Populated | New? |
|-------------|----------|---------|----------------------|------|
| `conversion_analytics_teaser` | Commercial Conversion | Analytics tease trigger (§1) | `listingName`, `viewCount`, `searchAppearanceCount`, `upgradeUrl` | No |
| `conversion_social_proof` | Commercial Conversion | Competitor upgraded trigger (§1) | `listingName`, `competitorName`, `upgradeUrl` | No |
| `conversion_view_milestone` | Commercial Conversion | View milestone trigger (§1) | `listingName`, `milestoneValue`, `upgradeUrl` | No |
| `conversion_engagement_summary` | Commercial Conversion | Engagement summary trigger (§1) | `listingName`, `viewCount`, `enquiryCount`, `upgradeUrl` | No |
| `winback` | Commercial Conversion | Win-back evaluation (§3) | `subject`, `body`, `listingName`, `enquiryCount`, `viewCount` | No |

**Current count:** 26 templates (SI §5.2). After S8: **26** (no change).

**Verification:** S8 §1 and §3 specify exact merge field construction logic for each template.

---

## §14 Notification Types Used in S8

S8 uses 3 existing notification types. 0 new notification types added. [Source: `s8-pre-draft-checklist.md` §6]

| Type | Trigger | New? |
|------|---------|------|
| `conversion_milestone` | CR emits `conversion_milestone` → PP consumer creates notification | No (SI §8.1) |
| `churn_risk_suggestion` | CR emits `churn_risk_detected` → PP consumer creates quality suggestions | No (SI §8.1) |
| `quality_score_changed` | Low-quality intervention notification (§7) | No (SI §8.1) |

---

## §15 Schema Additions

Full schema in `00-schema.md`. Summary:

**3 new tables:** `commercial_state`, `churn_analysis_log`, `sponsored_impressions`.

**0 table amendments.** S8 reads from existing tables: `listings` (`subscriptionTier`, `subscriptionStartDate`, `paddleSubscriptionId`, `paddleCustomerId`, `billingCadence`, `lifecycleStatus`, `accountId` — all S1/S4 columns), `accounts` (`email`, `role` — S1 columns).

**0 new pgEnums.** All enum values referenced by S8 exist in prior slices (S1 `SubscriptionTier`, S4 `BillingCadence`, S1 `LifecycleStatus`, S1 `VerificationTier`).

**Cumulative schema after S8:** 38 tables (35 from S7 + 3 new). 32 pgEnums (unchanged from S7).

---

## §16 Upstream Flag Resolutions

S8 resolves 11 upstream flags across 5 categories. [Source: `s8-pre-draft-checklist.md` §7]

| Flag | Source | Section | Resolution |
|------|--------|---------|-----------|
| S4-2 | S4 §14 | §2 | Churn intervention UI: S8 specifies `evaluateChurnIntervention` decision architecture with inputs (cancellation reason, recent engagement, listing state) and outputs (show retention data / accept / grace period). S5 renders the UI surface. |
| S4-3 | S4 §14 | §3 | Win-back email content: S8 implements `evaluateWinBack` from CR §2.4 with full merge field construction for `WinbackEligibleEvent.mergeFields` (5 fields: subject, body, listingName, enquiryCount, viewCount). |
| S4-4 | S4 §14 | §1 | Conversion trigger evaluation: S8 implements all 6 conversion triggers from CR §5.3 (first_enquiry, competitor_upgraded, analytics_teaser, social_proof, view_milestone, engagement_summary) with condition, action, cooldown, maxFirings per trigger. |
| S4-5 | S4 §14 | §5 | Revenue perception metrics: S8 implements `RevenuePerception` type computation from CR §6 with data sources (churn_analysis_log, listings aggregate subscription data) and update cadence (on-demand query, no caching at V1). |
| S4-9 | S4 §14 | §4 | Sponsored placement tier gating: S8 implements `selectSponsoredListings` algorithm from CR §4.4 with selection, rotation, slot count (0-3), fairness monitoring via `sponsored_impressions` table. |
| S5-1 | S5 §19 | §2 | Churn intervention UI: Same scope as S4-2. S8 provides CR evaluation logic; S5 renders provider dashboard surface. |
| S5-2 | S5 §19 | §4 | Sponsored placement badge display: S8 implements selection logic and provides `isSponsored` flag surface for rendering. S5/S6 render "Sponsored" label on listing cards. |
| S6-1 | S6 §16 | §4 | Sponsored placement selection for search results: S8 implements `commercial.getSponsoredListings` tRPC route called by search results SSR. Returns 0-3 listing IDs based on query, quality, rotation. |
| S6-2 | S6 §16 | §1 | Conversion trigger from buyer engagement: S8 implements `enquiry_submitted` consumer that evaluates `first_enquiry` trigger via D&L `getEngagementCounters` query-in-handler. |
| S7-1 | S7 §20 | §3 | Win-back email template merge fields: S8 §3 populates `WinbackEligibleEvent.mergeFields` with all 5 fields matching `winback` template structure (subject, body, listingName, enquiryCount, viewCount). |
| S7-5 | S7 §20 | §2 | Churn risk registry consumption: S8 emits `churn_risk_detected` with `riskFactors` array. §2 specifies all churn risk detection paths and which `ChurnRiskFactor` values each path produces (including `"payment_at_risk"` from payment failure signals). |

---

## §17 Downstream Flags

S8 produces 5 downstream flags, all targeting S9 (Entity Intelligence). S8 provides the V1 decision architectures, decision logs, and data foundations; S9 wires entity learning to auto-tune thresholds and extend evaluation granularity.

| Flag | Target | Description |
|------|--------|-------------|
| S8-1 | S9 | Advanced revenue health evaluation: per-tier churn breakdown, annual renewal rate, discount cohort divergence, LTV, CAC. V1 `evaluateRevenueHealth` provides 3-threshold foundation signals; S9 extends to the full concept design §6.2 decision architecture. Data foundation exists in `churn_analysis_log` + `listings` aggregate queries. |
| S8-2 | S9 | Conversion-denominated friction ratios: V1 denominates feature gate friction against total tickets. S9 instruments per-gate conversion attribution, enabling the CR-X-6 escalation threshold (5:1 complaints:conversions). [Source: `05-support-sections.md` S8-D1] |
| S8-3 | S9 | Learned churn prediction: V1 detects `engagement_dropping` and `billing_cadence_switch_to_monthly` reactively when related events fire. S9 introduces proactive periodic detection via entity intelligence. Decision logs from `evaluateChurnIntervention` provide training data. |
| S8-4 | S9 | Multi-listing pricing discount evaluation: `evaluateMultiListingPricingEvolution` quarterly ceremony from CR concept design §3.2. Requires 20+ multi-listing paid accounts and entity learning infrastructure. V1 data foundation exists (`churn_analysis_log` + `listings.accountId` grouping). [Source: `05-support-sections.md` S8-D2] |
| S8-5 | S9 | Sponsored placement decision learning: quality floor calibration, fairness cap activation frequency analysis, rotation distribution optimisation from `sponsored_placement_selection` decision logs. [Source: `03-sponsored-placement.md` S8-SP-1] |

---

## §18 Open Question Resolutions

S8 resolves 1 open question. [Source: `s8-pre-draft-checklist.md` §8]

| # | Question | Resolution |
|---|----------|-----------|
| CR-Q2 | Monthly price display (round up to clean number in 15–20% band — exact values) | Resolved by citing CR concept design §1.1. Monthly values documented in §9 `PRICING` config: £19/£39/£69 (annual: £199/£399/£699). |

---

## §19 Acceptance Criteria

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
| AC-8 | Email merge fields for `conversion_view_milestone` include `listingName`, `milestoneValue`, `upgradeUrl`. Merge fields for `conversion_analytics_teaser` include `listingName`, `viewCount`, `searchAppearanceCount`, `upgradeUrl`. Merge fields for `conversion_social_proof` include `listingName`, `competitorName` (anonymised), `upgradeUrl`. Merge fields for `conversion_engagement_summary` include `listingName`, `viewCount`, `enquiryCount`, `upgradeUrl`. | Unit |
| AC-9 | All conversion emails use `category: "conversion_marketing"`. `EmailService.send()` returns `status: "suppressed"` for unsubscribed providers. Trigger state is still updated even when email is suppressed. | Integration |
| AC-10 | `evaluateUpgradeSuggestion` returns the highest-priority unfired trigger as an `UpgradeSuggestion` for free-tier listings. Returns `null` for non-free-tier listings or when no triggers are eligible. Ownership check ensures `ctx.session.accountId` matches `listings.accountId`. | Integration |
| AC-11 | `getConversionTriggerState` returns default zero-state when no `commercial_state` row exists. Returns full trigger tracking fields when row exists. Ownership check enforced. | Integration |
| AC-12 | `claim_approved` consumer resets all conversion trigger state: all `*Fired` counters to 0/false, all `last*At` timestamps to null, `endowmentCtaShown` to false. Churn fields (`lastChurnEventAt`, `lastChurnReason`, `effectivePriceAtSubscription`) are preserved. | Integration |
| AC-13 | Every trigger evaluation is logged as `conversion_trigger_evaluation` decision type with inputs (triggerType, listingId, subscriptionTier) and output (fired, reason). | Integration |

### §2 Churn Detection & Intervention (8 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-14 | When `subscription_ended` fires with `origin: "paddle"` and `reason: "cancellation"`, the consumer calls `evaluateChurnIntervention` with engagement data from `getEngagementCounters(listingId)` and returns one of `show_retention_data | accept | grace_period`. | Integration |
| AC-15 | When `evaluateChurnIntervention` returns `show_retention_data`, the response contains `enquiries > 0 OR views > 50` and S5 can render the retention UI. If the provider confirms cancellation, churn is logged and win-back is scheduled. | Integration |
| AC-16 | When `subscription_ended` fires with `reason: "grace_period_expired"`, the consumer logs churn with `reason: "payment_failure"` and emits `churn_risk_detected` with `riskFactors` containing `"payment_at_risk"`. | Integration |
| AC-17 | V1 produces 3 of 5 `ChurnRiskFactor` values: `low_quality_paid` (§7 quality re-check), `payment_at_risk` (§10.2 payment failure), `quality_declining` (§10.5 quality threshold). The remaining 2 (`engagement_dropping`, `billing_cadence_switch_to_monthly`) require proactive periodic detection or cadence change events — deferred to S9. [S8-ST-5] | Integration |
| AC-18 | `churn_risk_detected` emission matches `EventPayloadMap` exactly: `{ type, listingId, accountId, riskFactors: ChurnRiskFactor[], timestamp }`. No extra fields, no missing fields (P1). | Unit |
| AC-19 | `pending_cancellation_created` is emitted on all 3 trigger paths (voluntary cancellation, account closure, listing archival) with correct `CancellationReason` value and `paddleSubscriptionId` from the listing. | Integration |
| AC-20 | Every churn path writes to `churn_analysis_log` with correct `eventType: "churn"`, `reason` matching `CancellationReason`, `subscriptionTier` from event payload or local state, and `annualRevenue` as negative value matching `PRICING` config. | Integration |
| AC-21 | Every `evaluateChurnIntervention` invocation produces a `DecisionLog` entry with `decisionType: "churn_intervention"`, capturing inputs and output. | Integration |

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

### §6 Feature Gate Friction Evaluation (3 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-47 | `evaluateFeatureGateFriction` returns `"critical"` for any gate with `frictionRatio > 0.15` and `"warning"` for `frictionRatio > 0.05`. | Unit |
| AC-48 | `overallLevel` equals the worst severity across all gate assessments (critical > warning > ok). | Unit |
| AC-49 | Each `GateFrictionAssessment` includes the gate name, ticket count, friction ratio, and a non-empty recommendation string. | Unit |

### §7 Low-Quality Intervention (5 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-50 | `triggerLowQualityIntervention` creates a `quality_score_changed` notification with the listing's current composite score and a link to the listing's quality page. | Integration |
| AC-51 | `triggerLowQualityIntervention` schedules a `check_quality_improvement` deferred action with `baselineScore` equal to the current composite and `executeAt` 30 days from now. | Integration |
| AC-52 | `handleCheckQualityImprovement` emits `churn_risk_detected` with `riskFactors: ["low_quality_paid"]` when the listing's quality score remains below 40 after 30 days. | Integration |
| AC-53 | `handleCheckQualityImprovement` takes no action (no event emitted) when the listing's quality score has improved to 40 or above. | Integration |
| AC-54 | `handleCheckQualityImprovement` takes no action when the listing no longer exists, has no quality score, or has been downgraded to free tier. | Integration |

### §8 Refund Evaluation (5 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-55 | `evaluateRefund` returns `refundType: "deny"` when `enquiriesReceivedSinceSubscription > 10`, regardless of subscription age. | Unit |
| AC-56 | `evaluateRefund` returns `refundType: "deny"` when a prior refund was issued within the last 12 months for the same listing. | Unit |
| AC-57 | `evaluateRefund` returns `refundType: "full"` with `amount` equal to `effectivePriceAtSubscription` when subscription age is 30 days or less and no deny guards trigger. | Unit |
| AC-58 | `evaluateRefund` returns `refundType: "partial"` with a pro-rata amount when subscription age is 31-90 days and no deny guards trigger. | Unit |
| AC-59 | `evaluateRefund` returns `refundType: "deny"` when subscription age exceeds 90 days. | Unit |

### §9 Pricing Configuration (4 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-60 | `PRICING` export is typed as `Record<SubscriptionTier, { annual: number; monthly: number }>` and satisfies the constraint at compile time. | Unit |
| AC-61 | `PRICING` values match: free 0/0, standard 199/19, premium 399/39, partner 699/69. | Unit |
| AC-62 | Launch discount writes `effectivePriceAtSubscription` to `commercial_state` at the discounted amount (e.g., 99), not the standard rate (199). `PRICING` const is unaffected. | Integration |
| AC-63 | No multi-listing discount logic exists in S8. Each listing subscription is priced independently using `PRICING[tier]`. | Unit |

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
| AC-80 | All 8 consumer handlers satisfy P2 for `commercial_state` (upserts converge to the same final state regardless of replay count). `churn_analysis_log` is append-only with no dedup key — duplicate events produce duplicate rows. At V1 (in-process bus, no network duplicates), this is acceptable. If the bus migrates to Inngest (at-least-once delivery), add a `(listingId, eventType, idempotencyKey)` unique constraint where `idempotencyKey` is derived from the event payload hash. | Integration |
| AC-81 | All event emissions from §10 handlers satisfy P1 payload self-containment: every emitted event's fields match the authoritative `EventPayloadMap` entry in SI §1.2. | Unit |

**Total: 81 acceptance criteria.**

---

## §20 Stress Test Resolution Log (v2)

19 scenarios targeting S8's implementation delta against upstream interface specs (SI v7, CR v3, Ops v4, D&L v5, PP v6), prior slices (S0 v2, S1 v2, S3 v2, S4 v2, S5 v2, S7 v2), and concept design (CR v4, cross-domain v3). 3 High, 6 Medium, 4 Low, 6 Pass. 13 fixes applied.

Full analysis: `stress-tests/s8-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S8-ST-1 | `evaluateChurnIntervention` return type mismatch — §10.2 accesses `intervention.riskFactors` which does not exist on `ChurnInterventionResult` | High | Removed `intervention.riskFactors` access. Handler uses locally computed `riskFactors` only. Passes full 7-field `ChurnInterventionInput` to `evaluateChurnIntervention`. |
| S8-ST-2 | `check_quality_improvement` missing from SI §2.1 DeferredActionParamsMap | High | Added to SI §2.1 + §2.2. SI v7 → v8. Three-part sync gap (9th occurrence). |
| S8-ST-3 | `computeTaxonomyOverlap` calling convention mismatch — passes listing IDs where D&L §3.1 expects `TaxonomyTag[]` arrays | High | Resolved listing IDs to tag arrays via `getListingTaxonomyTags()` before calling D&L export in §1.1.3. |
| S8-ST-4 | `refund_evaluation` and `feature_gate_friction_evaluation` decision types missing from SI §9.2 | Medium | Removed contradictory paragraph in §6.3. Added both decision types to SI §9.2 Commercial row. |
| S8-ST-5 | `quality_declining` and `engagement_dropping` ChurnRiskFactor values have no production paths in §10 handler code | Medium | Added `quality_declining` detection to §10.5 (score 40-59, declining trend). Amended AC-17 to 3/5 V1, 2 deferred to S9. |
| S8-ST-6 | `subscription_ended` handler does not branch on `reason: "paddle_reconciliation"` | Medium | Added reason pre-check before `evaluateChurnIntervention` call. `paddle_reconciliation` and `account_closure` short-circuit to win-back scheduling without intervention evaluation. |
| S8-ST-7 | `first_upgrade` milestone emitted on every paid-to-paid upgrade | Medium | Added once-only guard via `churn_analysis_log` state check in §10.1. Milestone only emits if no prior "upgrade" entry exists for the listing. |
| S8-ST-8 | `shortlistCount` merge field semantic mismatch with `searchAppearances` data | Medium | Renamed to `searchAppearanceCount` in §1.3, §1.8, §13, and AC-8. |
| S8-ST-9 | P2 idempotency claim for append-only `churn_analysis_log` | Medium | Qualified AC-80 to document V1 limitation. `commercial_state` upserts are P2; `churn_analysis_log` append-only with no dedup key is a known V1 gap with documented migration trigger. |
| S8-ST-10 | `conversionRate30d` pseudocode does not multiply by 100 | Low | Added `* 100` to §5.3 pseudocode. Aligns with AC-43. |
| S8-ST-11 | `PRICING` type shape mismatch between §9.1 Record and §10 array access | Low | Aligned all §10 `PRICING` usage with §9.1 Record shape: `PRICING[tier].annual` instead of `PRICING.find(...)`. |
| S8-ST-12 | Sponsored placement inline DELETE runs on every search request | Low | Changed to probabilistic cleanup (5% per invocation) in §4.5.3. |
| S8-ST-13 | Cross-reference table stale on `getListingAnalytics` consumption by §5 | Low | Fixed cross-references in index.md and 00-router-plan.md to reflect consumption by §3 and CR §5 shared type, not §5 RevenuePerception. |
| S8-ST-14 | `subscription_ended` handler win-back scheduling for paddle-origin closure | Pass | Correct. No fix needed. Defence in depth: `account_closed` handler cancels, deferred action rejects. |
| S8-ST-15 | P1 compliance for all 4 CR-emitted event types | Pass | Correct. No fix needed. All emissions match `EventPayloadMap` types. |
| S8-ST-16 | `CancellationReason` usage across all 5 churn paths | Pass | Correct. No fix needed. All 5 values used correctly and consistently. |
| S8-ST-17 | `listing_archived` handler reads `subscriptionTier` from event payload | Pass | Correct. No fix needed. P1-compliant consumption. |
| S8-ST-18 | `quality_score_changed` handler reads `newComposite` correctly from event payload | Pass | Correct. No fix needed. Field exists on `QualityScoreChangedEvent`. |
| S8-ST-19 | Downstream flags S8-1 through S8-5 accuracy and completeness audit | Pass | Correct. No fix needed. All 5 flags correctly target S9. |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §1 event bus + P1–P5 principles, §2 deferred actions (2 actions: 1 handler implemented, 1 new registered), §4.1 `AuthSession` type, §5 email transport, §9 decision logging |
| `commercial-and-revenue.md` (v3 interface) | §1 emitted events (4 types), §2 consumed events (8 consumers), §3 pricing configuration, §4 tier limits + feature gates, §5 conversion trigger types, §6 revenue perception, §7 churn risk factors, §8 cancellation reasons |
| `commercial-and-revenue.md` (v4 concept design) | §1 pricing, §2 churn & win-back, §3 multi-listing, §4 sponsored placement, §5 conversion triggers, §6 revenue perception, §7 analytics |
| `operations.md` (v4 interface) | §3.4 `getFeatureGateFrictionSummary` query interface (consumed by §6), §5 pending cancellation registry (read by §3) |
| `data-and-listings.md` (v5 interface) | §3.2 `getEngagementCounters` query interface (consumed by §1, §3), D&L export `computeTaxonomyOverlap` (consumed by §1 competitor_upgraded trigger) |
| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` query interface (consumed by §3 win-back evaluation and CR §5 EnquiryResponseInsights — not consumed by §5 RevenuePerception) |
| `cross-domain-dependencies.md` (v3) | Event contracts, query interface contracts, cross-domain flow specifications |
| `slices/slice-00-infrastructure.md` (v2) | Event bus, deferred action scheduler, decision logging framework, email transport service |
| `slices/slice-01-data-model.md` (v2) | Listing schema, Account schema, engagement counters, quality scores, subscription tier, verification tier |
| `slices/slice-03-claim-verify.md` (v2) | `claim_approved` event emission, verification tier data |
| `slices/slice-04-subscriptions.md` (v2) | Subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle, pending cancellation events |
| `slices/slice-05-provider-experience.md` (v2) | Provider dashboard UI surfaces for conversion triggers and churn intervention |
| `slices/slice-07-operations/index.md` (v2) | Churn risk registry, pending cancellation registry, win-back email delivery handler, support ticket query interfaces |
