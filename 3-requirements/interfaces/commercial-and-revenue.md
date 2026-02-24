# Commercial & Revenue — Interface Specification

**Status:** Draft v3 — v2 + S6 stress test fix: `buyerVisibleEngagementStats` added to `TierLimits` (S6-ST-2).
**Domain:** Commercial & Revenue
**Last updated:** 2026-02-14
**Inputs:** `commercial-and-revenue.md` (v4), `cross-domain-dependencies.md` (v3 §2–§3), `decisions/sq-1.md`, `shared-infrastructure.md` (v6)
**Downstream:** `slices/slice-04-subscriptions.md`, `slices/slice-08-commercial.md`

---

## Summary

Commercial & Revenue is the sub-entity responsible for pricing, subscription lifecycle, conversion optimisation, churn intervention, and revenue perception. It defines business rules that other domains import (P4). Interface: 4 emitted events, 8 consumed events, 0 query interfaces exposed (reads via D&L and PP queries), plus 4 exported configurations consumed by Platform and Operations.

---

## 1. Events Emitted (4)

### 1.1 conversion_milestone

```typescript
type ConversionMilestoneId = "first_subscription" | "first_upgrade" | "premium_reached" | "partner_reached"

type ConversionMilestoneEvent = {
  type: "conversion_milestone"
  listingId: UUID
  accountId: UUID
  milestone: ConversionMilestoneId      // [CR-ST-3] typed union, not free string
  milestoneLabel: string                // display-ready label, e.g. "Welcome to Standard!"
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Learning hypothesis L3 | Ops | Track outreach vs organic conversion | Async |
| Dashboard notification | PP | Display milestone notification using `milestoneLabel` | Async |

### 1.2 churn_risk_detected

```typescript
type ChurnRiskFactor =
  | "quality_declining"
  | "engagement_dropping"
  | "payment_at_risk"
  | "low_quality_paid"
  | "billing_cadence_switch_to_monthly"

type ChurnRiskDetectedEvent = {
  type: "churn_risk_detected"
  listingId: UUID
  accountId: UUID
  riskFactors: ChurnRiskFactor[]        // [CR-ST-4] typed union array
  timestamp: ISO8601
}
```

**Risk factor typing [CR-ST-4]:** Ops' ChurnRiskRegistry and triage logic match on known factor values. If CR identifies a novel risk factor in a future version, it adds to the `ChurnRiskFactor` union — compiler catches unhandled cases in Ops consumers.

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Ticket priority elevation | Ops | Upsert `ChurnRiskRegistry`, elevate ticket priority [CR-X-20] | Async |
| Quality improvement suggestions | PP | Display proactive quality suggestions on dashboard | Async |

### 1.3 winback_eligible

```typescript
type WinbackEligibleEvent = {
  type: "winback_eligible"
  listingId: UUID
  cancelledAccountId: UUID
  mergeFields: {                        // [CR-ST-5] merge fields for `winback` template
    subject: string
    body: string
    listingName: string
    enquiryCount?: number               // enquiries since cancellation (if trigger was enquiry activity)
    viewCount?: number                  // views since cancellation (if trigger was view activity)
  }
  timestamp: ISO8601
}
```

**Ownership split (CR-35):** Commercial evaluates eligibility and provides merge field values. Operations delivers via `EmailService.send({ template: "winback", data: event.mergeFields, ... })` (shared-infrastructure §5.2). Ops does not send raw subject/body — the `winback` template renders the merge fields. [CR-ST-5]

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Email delivery via Resend | Ops | Send win-back email using `winback` template with `event.mergeFields`, emit `winback_delivery_result` [CR-35] | Async |

### 1.4 pending_cancellation_created

```typescript
type PendingCancellationCreatedEvent = {
  type: "pending_cancellation_created"
  paddleSubscriptionId: string
  listingId: UUID
  reason: CancellationReason            // [CR-ST-6] typed, not string
  timestamp: ISO8601
}
```

Emitted when the entity decides to cancel a subscription (churn intervention, low-quality intervention, account closure side-effect). Operations stores the record for Paddle webhook attribution. [Source: CR-X-4]

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Paddle API cancellation | Ops | Execute Paddle cancellation, store pending record for webhook attribution [CR-X-4] | Async |

---

## 2. Events Consumed (8)

| Event | Source | Commercial Action | Sync/Async |
|---|---|---|---|
| `subscription_tier_changed` | Ops | Update revenue metrics (MRR, tier distribution). Log conversion or downgrade event. | Async |
| `subscription_ended` | Ops | Log churn event with reason. If `origin === "paddle"`: schedule win-back evaluation at 60 days (deferred action). If `origin === "archival"` or `"closure"`: log churn only, no win-back schedule (listing archived or account closed — no entity to win back). [CR-ST-19] Update churn metrics. | Async |
| `claim_approved` | D&L | Log conversion funnel entry. Reset conversion trigger state for listing [CR-29]. Cancel pending win-back schedule by querying deferred actions where `action = "win_back_evaluation"` AND `params.listingId = event.listingId` AND `status = "pending"`, then set `status = "cancelled"` [CR-X-17, CR-ST-14]. | Async |
| `listing_archived` | D&L | If `event.subscriptionTier !== "free"` AND `event.accountId !== null`: log churn (voluntary archival). Update revenue metrics. [DL-ST-18] | Async |
| `quality_score_changed` | D&L | Evaluate conversion triggers (free-tier listings). If paid subscriber with `newComposite < 40`: read CR's own stored `subscriptionTier` and `subscriptionStartDate` for the listing (local state, not cross-domain read — see note), then trigger low-quality intervention [CR-X-5] if subscription age >14 days. [CR-ST-8] | Async |
| `account_closed` | PP | Log churn (account closure). Cancel win-back schedules for all listings in `listingsArchived`. Update affected listing revenue metrics — reads `listing.commercial.subscriptionTier` from CR's own stored state per listing (see note). [CR-ST-2] | Async |
| `enquiry_submitted` | PP | Evaluate `first_enquiry` conversion trigger: query D&L `getEngagementCounters(event.listingId)` to check current `enquiriesReceived` count. If count === 1 and listing is free tier: fire trigger. [CR-X-10, CR-ST-20] | Async |
| `erasure_completed` | D&L | Cancel pending win-back schedules for listings in `listingIdsAnonymised ∪ listingIdsDeleted`. Anonymise churn analysis log entries matching any listing in those arrays — replace `accountId` with `accountHash`, clear PII fields [CR-ST-15]. Clear conversion trigger state. [CD-18] | Async |

**All consumers are async.** Commercial has no sync consumers — it performs no action that a user waits on within their HTTP response.

**Local state reads in handlers [CR-ST-8, CR-ST-2]:** Two consumers read CR's own stored data (subscription tier, subscription start date) during handler execution. These are reads of Commercial's own domain state, not cross-domain DB reads. The event tells CR *what happened*; CR's stored state provides the context for its reaction. This is consistent with P1 — the principle prohibits cross-domain DB reads in handlers, not reads of the consumer's own state.

**Query-in-handler for `enquiry_submitted` [CR-ST-20]:** The `first_enquiry` trigger requires knowing the current enquiry count, which CR does not own. CR calls D&L's `getEngagementCounters(listingId)` synchronous query interface. This is a legitimate query-in-handler: the event tells CR *what happened* (enquiry submitted), the query tells CR *current state* to evaluate the trigger condition. The trigger fires at most once per listing, so the query cost is negligible.

**Payload fields consumed per P1:**

| Event | Fields Used by CR |
|---|---|
| `subscription_tier_changed` | `listingId`, `accountId`, `previousTier`, `newTier` |
| `subscription_ended` | `listingId`, `accountId`, `previousTier`, `reason`, `origin` |
| `claim_approved` | `listingId`, `accountId` |
| `listing_archived` | `listingId`, `accountId`, `subscriptionTier` |
| `quality_score_changed` | `listingId`, `newComposite` |
| `account_closed` | `accountId`, `listingsArchived` |
| `enquiry_submitted` | `listingId` |
| `erasure_completed` | `accountHash`, `listingIdsAnonymised`, `listingIdsDeleted` |

---

## 3. Query Interfaces Exposed (0)

Commercial exposes no query interfaces. It reads data from:
- D&L: engagement counters (`getEngagementCounters`), taxonomy overlap (`computeTaxonomyOverlap`)
- PP: time-series analytics (`getListingAnalytics`)
- Ops: feature gate friction summary (`getFeatureGateFrictionSummary`)

---

## 4. Exported Configurations

Commercial defines business rules imported by other domains (P4 — import, never copy).

### 4.1 TIER_LIMITS

Defines feature limits per subscription tier. Platform imports this to enforce feature gates.

```typescript
type TierLimits = {
  maxMedia: number
  maxCredits: number | "unlimited"
  customTags: boolean
  trendAnalytics: "none" | "30d" | "90d"
  topSearchTerms: boolean
  rankingBoost: number
  viewerDemographics: boolean
  competitorBenchmarking: boolean
  sponsoredPlacement: boolean
  enquiryResponseInsights: boolean
  prioritySupport: boolean
  buyerVisibleEngagementStats: boolean  // [S6-ST-2] buyer-facing engagement stats display gate
}

const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free:     { maxMedia: 5,  maxCredits: 10,          customTags: false, trendAnalytics: "none", topSearchTerms: false, rankingBoost: 0,  viewerDemographics: false, competitorBenchmarking: false, sponsoredPlacement: false, enquiryResponseInsights: false, prioritySupport: false, buyerVisibleEngagementStats: false },
  standard: { maxMedia: 20, maxCredits: 50,          customTags: true,  trendAnalytics: "30d",  topSearchTerms: true,  rankingBoost: 15, viewerDemographics: false, competitorBenchmarking: false, sponsoredPlacement: false, enquiryResponseInsights: false, prioritySupport: false, buyerVisibleEngagementStats: true },
  premium:  { maxMedia: 50, maxCredits: "unlimited", customTags: true,  trendAnalytics: "90d",  topSearchTerms: true,  rankingBoost: 25, viewerDemographics: true,  competitorBenchmarking: true,  sponsoredPlacement: true,  enquiryResponseInsights: true,  prioritySupport: false, buyerVisibleEngagementStats: true },
  partner:  { maxMedia: 50, maxCredits: "unlimited", customTags: true,  trendAnalytics: "90d",  topSearchTerms: true,  rankingBoost: 25, viewerDemographics: true,  competitorBenchmarking: true,  sponsoredPlacement: true,  enquiryResponseInsights: true,  prioritySupport: true,  buyerVisibleEngagementStats: true },
}
```

**Consumer:** PP — imports `TIER_LIMITS`, calls `computeFeatureAccess`, maps to UI via `mapFeatureAccessToUI`. [Source: CR-X-8]

**`prioritySupport` enforcement [CR-ST-12]:** Operations' `supportTriage` decision tree checks the listing's subscription tier (read from D&L stored value) and applies Partner SLA (4 business hours response vs 1 business day for other tiers). No dedicated interface — Ops reads tier from stored listing data. Implementation in S7.

### 4.2 computeFeatureAccess

Canonical feature access computation. Platform imports — does not redefine. [Source: CR-X-8]

```typescript
function computeFeatureAccess(tier: SubscriptionTier): FeatureAccess  // [CR-ST-9] simplified input

type FeatureAccess = TierLimits & {
  directContactVisible: true       // always true for claimed listings
  organicSearchVisible: true       // always true
  enquiriesEnabled: true           // always true
  basicAnalytics: true             // total views, searches, enquiries — always true
}
```

**Signature simplification [CR-ST-9]:** Previous signature accepted `listing: { commercial: { subscriptionTier } }`. Simplified to accept `SubscriptionTier` directly — the wrapper object added coupling without value. PP passes the tier it stores on the listing.

### 4.3 PRICING

Subscription pricing configuration. Platform imports for pricing page display. Operations imports for principal briefing.

```typescript
const PRICING: TierPricing[] = [
  { tier: "free",     annualPrice: 0,   monthlyPrice: 0,  targetPersona: "Directory population. Buyer-satisfying base." },
  { tier: "standard", annualPrice: 199, monthlyPrice: 19, targetPersona: "Sole traders, emerging freelancers" },
  { tier: "premium",  annualPrice: 399, monthlyPrice: 39, targetPersona: "Established freelancers, small companies" },
  { tier: "partner",  annualPrice: 699, monthlyPrice: 69, targetPersona: "Established companies, facilities, post houses" },
]

type TierPricing = {
  tier: SubscriptionTier
  annualPrice: number       // GBP, ex-VAT
  monthlyPrice: number      // GBP, ex-VAT
  targetPersona: string
}
```

### 4.4 mapPaddleWebhook

Paddle webhook-to-internal-event mapping function. Defined by Commercial, executed within Operations' webhook handler. [Source: CR-X-14]

```typescript
function mapPaddleWebhook(paddleEvent: PaddleWebhookEvent): SubscriptionEvent | null

type SubscriptionEvent =
  | { type: "checkout_completed"; listingId: UUID; tier: SubscriptionTier; billingCadence: "annual" | "monthly"; paddleSubscriptionId: string }
  | { type: "subscription_upgraded"; listingId: UUID; previousTier: SubscriptionTier; newTier: SubscriptionTier }
  | { type: "subscription_downgraded"; listingId: UUID; previousTier: SubscriptionTier; newTier: SubscriptionTier }
  | { type: "billing_cadence_changed"; listingId: UUID; tier: SubscriptionTier; previousCadence: "annual" | "monthly"; newCadence: "annual" | "monthly" }
  | { type: "subscription_cancelled"; listingId: UUID; tier: SubscriptionTier; reason: CancellationReason; effectiveAt: ISO8601 }
  | { type: "renewal_failed"; listingId: UUID; tier: SubscriptionTier; attempt: number }

type CancellationReason = "voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"
```

**Cancellation attribution [CR-X-4]:** `inferCancellationReason` checks the `pending_cancellation` registry first. If a matching `paddleSubscriptionId` exists, uses the stored reason. Otherwise, infers from Paddle data.

### 4.5 SubscriptionEvent → Domain Event Mapping

[CR-ST-10] `mapPaddleWebhook` returns internal `SubscriptionEvent` variants. Operations' webhook handler maps these to domain events for bus dispatch:

| SubscriptionEvent type | Domain Event Emitted | Notes |
|---|---|---|
| `checkout_completed` | `subscription_tier_changed` (previousTier: `"free"`, newTier: event tier) | New subscription |
| `subscription_upgraded` | `subscription_tier_changed` | Tier increase |
| `subscription_downgraded` | `subscription_tier_changed` | Tier decrease (includes refund via `applyDowngrade` [CR-X-15]) |
| `billing_cadence_changed` | None | Internal state update only. Ops stores cadence. No cross-domain effect. |
| `subscription_cancelled` | `subscription_ended` | Ops sets `origin` based on `inferCancellationReason`. Triggers grace period or immediate downgrade per concept design §2.3. |
| `renewal_failed` | None | Paddle handles retry (3 attempts over 7 days). Ops creates payment warning notification within webhook handler (concept design §2.3). No domain event — consumers react to the eventual `subscription_cancelled` if payment is unrecoverable. |

---

## 5. Shared Types Exported

```typescript
// BasicAnalytics — maps 1:1 to D&L engagement counters [CR-X-18]
type BasicAnalytics = {
  totalProfileViews: number
  totalSearchAppearances: number
  totalEnquiriesReceived: number
}

// Premium/Partner analytics
type EnquiryResponseInsights = {
  medianResponseTime: number
  p90ResponseTime: number
  responseRate: number
  responseRateVsCategoryAverage: number
  enquiryToEngagementRate: number
  peakEnquiryTimes: { dayOfWeek: string; hourRange: string; enquiryCount: number }[]
}

type ConversionMilestoneId = "first_subscription" | "first_upgrade" | "premium_reached" | "partner_reached"

type ChurnRiskFactor =
  | "quality_declining"
  | "engagement_dropping"
  | "payment_at_risk"
  | "low_quality_paid"
  | "billing_cadence_switch_to_monthly"

type CancellationReason = "voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"
```

**`EnquiryResponseInsights` data source [CR-ST-13]:** CR computes derived metrics from two sources: (1) D&L's `getEngagementCounters` raw values (`enquiryResponseRate`, `enquiryResponseTime`), and (2) PP's `getListingAnalytics` for time-series data (peak enquiry times, period-specific rates). CR does not consume `enquiry_responded` events — it reads aggregated data via query interfaces. This matches the DL-ST-7 resolution: D&L exposes raw counters, CR transforms them for premium subscribers.

---

## 6. Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| `computeFeatureAccess` | <10ms p95 | Pure computation, no I/O. Called on every page load for feature gating. |
| `mapPaddleWebhook` | <50ms p95 | Pure mapping logic within Ops webhook handler |
| Conversion trigger evaluation | <200ms p95 | Event consumer, async. Note: `competitor_upgraded` trigger may require taxonomy overlap computation across listings — if 200ms is unachievable at V1 scale, pre-compute overlap neighbourhoods or use materialised view. Evaluate at S8. [CR-ST-17] |
| Win-back evaluation | <500ms p95 | Deferred action, no user waiting |
| Revenue perception update | <100ms p95 | Event consumer, async |

---

## 7. Stress Test Resolution Log (v2)

20 scenarios targeting boundary surface. 3 High, 10 Medium, 5 Low, 2 Pass. 18 fixes applied.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| CR-ST-1 | `subscription_ended` P1 fields missing `accountId`. CR schedules `win_back_evaluation` deferred action which requires `accountId` (DeferredActionParamsMap). Without it, CR must DB-read in handler — P1 violation. | **High** | Fixed. `accountId` added to P1 fields for `subscription_ended`. Payload already carries it (Ops §1.2). |
| CR-ST-2 | `account_closed` CR consumer "update all affected listing revenue metrics" requires per-listing `subscriptionTier` not in event payload. | Medium | Fixed. Documented as local state read — CR stores subscription tier per listing in its own state. Not a cross-domain read. Exception to P1 documented with rationale in §2 notes. |
| CR-ST-3 | `conversion_milestone.milestone: string` untyped. PP consumer creates dashboard notification with unknown display string. | Medium | Fixed. Typed as `ConversionMilestoneId` union. Added `milestoneLabel: string` for display-ready value. |
| CR-ST-4 | `churn_risk_detected.riskFactors: string[]` untyped. Ops cannot triage consistently on free-form strings. | Medium | Fixed. Typed as `ChurnRiskFactor[]` union. Compiler catches unhandled cases in Ops consumers. |
| CR-ST-5 | `winback_eligible.emailContent` ambiguous — is it raw content or template merge fields? Ops §7 says winback uses template ID. | Medium | Fixed. Renamed to `mergeFields`. Note clarifies values are passed to `winback` template, not sent as raw content. Added `listingName`, optional `enquiryCount`/`viewCount`. |
| CR-ST-6 | `pending_cancellation_created.reason: string` but `CancellationReason` is a typed union used by `inferCancellationReason`. String matching is fragile. | Medium | Fixed. Typed as `CancellationReason`. |
| CR-ST-7 | `listing_archived` CR P1 fields missing `accountId`. CR needs it to log churn per account. Payload has `accountId: UUID | null`. | Medium | Fixed. `accountId` already in P1 table. Added null check to consumer action: only log churn if `accountId !== null`. |
| CR-ST-8 | `quality_score_changed` CR consumer needs `subscriptionTier` and `subscriptionStartDate` (for 14-day grace). Not in D&L event payload. | Medium | Fixed. Documented as legitimate local state read. CR owns subscription data. Adding subscription fields to D&L event would violate ownership. Note added to §2. |
| CR-ST-9 | `computeFeatureAccess` takes `listing: { commercial: { subscriptionTier } }` — unnecessary wrapper. | Low | Fixed. Simplified to `computeFeatureAccess(tier: SubscriptionTier)`. Reduces coupling. |
| CR-ST-10 | `mapPaddleWebhook` returns `SubscriptionEvent` variants but spec doesn't document which variants map to which domain events. `renewal_failed` and `billing_cadence_changed` have no domain event — undocumented. | **High** | Fixed. Added §4.5 mapping table. `billing_cadence_changed` → no domain event (internal). `renewal_failed` → no domain event (Paddle retries; eventual `subscription_cancelled` if unrecoverable). |
| CR-ST-11 | Standard monthly price £19 is 14.6% premium — below the stated 15% floor rule. | Low | Pass. Pricing values are settled (concept design v4 §1.1). The deviation is documented as intentional. Interface spec carries values, not methodology. |
| CR-ST-12 | `prioritySupport: true` in TIER_LIMITS but no interface mechanism routes support by tier. | Low | Fixed. Note added to §4.1: Ops reads tier from stored data, applies Partner SLA. Implementation in S7. |
| CR-ST-13 | `EnquiryResponseInsights` requires `enquiry_responded` data but CR doesn't consume that event. Data source path undocumented. | **High** | Fixed. CR reads raw values from D&L `getEngagementCounters` + PP `getListingAnalytics` for time-series data. Does not consume events. Documented in §5 note. Matches DL-ST-7 resolution. |
| CR-ST-14 | `claim_approved` CR consumer "cancel pending win-back" — mechanism for finding and cancelling deferred actions undocumented. | Low | Fixed. Consumer action expanded: query deferred actions by `action + params.listingId + status`, then set `status = "cancelled"`. |
| CR-ST-15 | `erasure_completed` CR consumer "anonymise churn log entries" — `accountHash` is not `accountId`. CR's logs store `accountId` but the erased account's original UUID is gone. | Medium | Fixed. CR matches by listing IDs (`listingIdsAnonymised ∪ listingIdsDeleted`), not by account. Replaces `accountId` with `accountHash` in matched entries. |
| CR-ST-16 | `computeFeatureAccess` <10ms NFR for pure const lookup. | Low | Pass. Conservative target is fine. |
| CR-ST-17 | `competitor_upgraded` trigger may exceed 200ms if taxonomy overlap is unindexed at V1 scale (4,700 listings). | Low | Fixed. NFR note added: pre-compute overlap neighbourhoods or materialised view if 200ms unachievable. Evaluate at S8. |
| CR-ST-18 | Cross-reference cites `shared-infrastructure.md (v1)` — now v2. | Low | Fixed. Updated to v2. |
| CR-ST-19 | `subscription_ended` origin branching: win-back scheduled for all origins but closure/archival have no entity to win back. P3 violation. | Medium | Fixed. Consumer action branched on `origin`: `"paddle"` → schedule win-back, `"archival"` / `"closure"` → churn log only. |
| CR-ST-20 | `enquiry_submitted` CR consumer evaluates `first_enquiry` trigger but event has no enquiry count. Requires cross-domain read. | Medium | Fixed. Documented query-in-handler pattern: CR calls D&L `getEngagementCounters(listingId)` to check current count. Legitimate — event says *what happened*, query provides *current state*. Trigger fires at most once per listing. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `commercial-and-revenue.md` (v4) | Subscription lifecycle (§2), TIER_LIMITS + computeFeatureAccess (§4.2), conversion triggers (§5.3), revenue perception (§6), domain events (§7), mapPaddleWebhook (§2.2), sponsored placement (§4.4) |
| `cross-domain-dependencies.md` (v3) | Event payloads (§2.3), consumer matrix (§2.2), Paddle integration boundary (§3.3) |
| `decisions/sq-1.md` | All Commercial consumers are async |
| `shared-infrastructure.md` (v2) | Event bus contract (§1), deferred action scheduler (§2), P1–P5 principles (§1.4), email template inventory (§5.2) |
| `data-and-listings.md` (v2) | `getEngagementCounters` query interface (§3.2), `subscription_ended` archival emission (§1.10), `ErasureCompletedEvent` payload (§1.9) |
| `operations.md` (v2) | Paddle webhook integration (§5), `subscription_tier_changed` / `subscription_ended` payload types (§1.1–§1.2), win-back delivery (§7) |
| `platform-and-product.md` (v2) | `getListingAnalytics` query interface, email template inventory (§4), account closure event payload (§1.9) |
