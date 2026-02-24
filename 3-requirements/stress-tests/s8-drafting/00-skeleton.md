# Slice 8: Commercial & Revenue

**Status:** Draft v1
**Primary Owner:** Commercial & Revenue
**Last updated:** 2026-02-14
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, subscription tier), S3 (claim approval event emission, verification tier data), S4 (subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle), S5 (provider dashboard UI surfaces for conversion triggers and churn intervention), S7 (churn risk registry, pending cancellation registry, support ticket queries, win-back email delivery)
**Inputs:** `interfaces/shared-infrastructure.md` (v7), `interfaces/commercial-and-revenue.md` (v3), `interfaces/operations.md` (v4), `interfaces/data-and-listings.md` (v5), `interfaces/platform-and-product.md` (v6), `2-concept-design/commercial-and-revenue.md` (v4), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-07-operations/index.md` (v2)
**Downstream:** S9 (Entity Intelligence), S10 (Hardening)

---

## Summary

{Summary — assembly writes}

## V1 Scope Boundary

{V1 Scope — assembly writes}

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions: 3 new tables (commercial_state, churn_analysis_log, sponsored_impressions), 0 amendments, 0 pgEnums, cumulative snapshot |
| 00 | `00-router-plan.md` | tRPC routes (minimal — mostly event-driven logic), file tree, internal vs user-facing endpoints |
| 01 | `01-conversion-triggers.md` | §1 Conversion Trigger Engine |
| 02 | `02-churn-and-winback.md` | §2 Churn Detection & Intervention, §3 Win-Back Evaluation & Delivery |
| 03 | `03-sponsored-placement.md` | §4 Sponsored Placement |
| 04 | `04-revenue-perception.md` | §5 Revenue Perception & Metrics |
| 05 | `05-feature-gate-friction.md` | §6 Feature Gate Friction Evaluation |
| 06 | `06-low-quality-intervention.md` | §7 Low-Quality Intervention |
| 07 | `07-refund-evaluation.md` | §8 Refund Evaluation |
| 08 | `08-pricing-config.md` | §9 Pricing Configuration |
| 09 | `09-event-consumers.md` | §10 Event Consumer Implementations (8 consumers) |

---

## §1 Conversion Trigger Engine

{Content — Phase 2 agent writes}

---

## §2 Churn Detection & Intervention

{Content — Phase 2 agent writes}

---

## §3 Win-Back Evaluation & Delivery

{Content — Phase 2 agent writes}

---

## §4 Sponsored Placement

{Content — Phase 2 agent writes}

---

## §5 Revenue Perception & Metrics

{Content — Phase 2 agent writes}

---

## §6 Feature Gate Friction Evaluation

{Content — Phase 2 agent writes}

---

## §7 Low-Quality Intervention

{Content — Phase 2 agent writes}

---

## §8 Refund Evaluation

{Content — Phase 2 agent writes}

---

## §9 Pricing Configuration

{Content — Phase 2 agent writes}

---

## §10 Event Consumer Implementations

{Content — Phase 2 agent writes}

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
| `conversion_analytics_teaser` | Commercial Conversion | Analytics tease trigger (§1) | `listingName`, `viewCount`, `shortlistCount`, `upgradeUrl` | No |
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

**Cumulative schema after S8:** 42 tables (35 from S7 + 3 new + 4 reference tables = 42). 32 pgEnums (unchanged from S7).

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

{Phase 2 agent writes — flags targeting S9/S10 identified during content drafting}

---

## §18 Open Question Resolutions

S8 resolves 1 open question. [Source: `s8-pre-draft-checklist.md` §8]

| # | Question | Resolution |
|---|----------|-----------|
| CR-Q2 | Monthly price display (round up to clean number in 15–20% band — exact values) | Resolved by citing CR concept design §1.1. Monthly values documented in §9 `PRICING` config: £19/£39/£69 (annual: £199/£399/£699). |

---

## §19 Acceptance Criteria

{Phase 2 agent writes — grouped by section, sequential numbering AC-1 through AC-N}

**Total: {N} acceptance criteria.**

---

## §20 Stress Test Resolution Log

{Empty in v1. Populated by stress test + fix-applier skill.}

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v7) | §1 event bus + P1–P5 principles, §2 deferred actions (2 actions: 1 handler implemented, 1 new registered), §4.1 `AuthSession` type, §5 email transport, §9 decision logging |
| `commercial-and-revenue.md` (v3 interface) | §1 emitted events (4 types), §2 consumed events (8 consumers), §3 pricing configuration, §4 tier limits + feature gates, §5 conversion trigger types, §6 revenue perception, §7 churn risk factors, §8 cancellation reasons |
| `commercial-and-revenue.md` (v4 concept design) | §1 pricing, §2 churn & win-back, §3 multi-listing, §4 sponsored placement, §5 conversion triggers, §6 revenue perception, §7 analytics |
| `operations.md` (v4 interface) | §3.4 `getFeatureGateFrictionSummary` query interface (consumed by §6), §5 pending cancellation registry (read by §3) |
| `data-and-listings.md` (v5 interface) | §3.2 `getEngagementCounters` query interface (consumed by §1, §3), D&L export `computeTaxonomyOverlap` (consumed by §1 competitor_upgraded trigger) |
| `platform-and-product.md` (v6 interface) | §3.1 `getListingAnalytics` query interface (consumed by §5) |
| `cross-domain-dependencies.md` (v3) | Event contracts, query interface contracts, cross-domain flow specifications |
| `slices/slice-00-infrastructure.md` (v2) | Event bus, deferred action scheduler, decision logging framework, email transport service |
| `slices/slice-01-data-model.md` (v2) | Listing schema, Account schema, engagement counters, quality scores, subscription tier, verification tier |
| `slices/slice-03-claim-verify.md` (v2) | `claim_approved` event emission, verification tier data |
| `slices/slice-04-subscriptions.md` (v2) | Subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle, pending cancellation events |
| `slices/slice-05-provider-experience.md` (v2) | Provider dashboard UI surfaces for conversion triggers and churn intervention |
| `slices/slice-07-operations/index.md` (v2) | Churn risk registry, pending cancellation registry, win-back email delivery handler, support ticket query interfaces |
