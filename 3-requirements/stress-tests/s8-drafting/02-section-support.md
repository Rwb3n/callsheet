# S8 Phase 2 — §6 Feature Gate Friction, §7 Low-Quality Intervention, §8 Refund Evaluation, §9 Pricing Configuration

**Status:** Phase 2 content output
**Agent:** D (Support Sections)
**Written:** 2026-02-14
**Inputs:** `s8-drafting/00-skeleton.md`, `s8-drafting/01-decisions.md`, `s8-drafting/01-schema.md`, `s8-drafting/01-router-plan.md`, `s8-pre-draft-checklist.md`, `interfaces/commercial-and-revenue.md` (v3 §4), `interfaces/operations.md` (v4 §3.4), `interfaces/shared-infrastructure.md` (v7 §2, §9.2), `2-concept-design/commercial-and-revenue.md` (v4 §1.1, §2.6, §3, §4.6, §6.3)

---

## §6 Feature Gate Friction Evaluation

CR evaluates per-gate friction ratios monthly, consuming Ops' `getFeatureGateFrictionSummary` query interface. CR owns the evaluation intelligence; Ops owns the data aggregation; S7's admin dashboard renders the results. No tRPC route in S8 — `evaluateFeatureGateFriction` is a domain-internal function imported by S7's admin route.

### 6.1 Integration with Ops Query Interface

Ops §3.4 exposes `getFeatureGateFrictionSummary(period: YearMonth)` returning `FeatureGateFrictionSummary`. [Source: `interfaces/operations.md` — §3.4] The summary contains per-gate ticket counts and friction ratios computed against total ticket volume. V1 denominates friction against total tickets (not conversions — conversion-denominated friction is deferred to S9 entity intelligence). S7's `admin.friction.getSummary` route calls Ops' query, then passes the result to CR's `evaluateFeatureGateFriction` for assessment.

### 6.2 `evaluateFeatureGateFriction` Logic

```typescript
// src/server/commercial/feature-gate-friction.ts
// Authoritative type in interfaces/operations.md §3.4 — summary only
type FeatureGateFrictionSummary = {
  period: string
  gates: { gateName: string; ticketCount: number; totalTickets: number; frictionRatio: number }[]
}

type GateFrictionAssessment = {
  gateName: string
  frictionRatio: number
  ticketCount: number
  level: "ok" | "warning" | "critical"
  recommendation: string
}

type FrictionEvaluationResult = {
  period: string
  assessments: GateFrictionAssessment[]
  overallLevel: "ok" | "warning" | "critical"  // worst across all gates
}

function evaluateFeatureGateFriction(
  summary: FeatureGateFrictionSummary
): FrictionEvaluationResult
```

Decision logic:

```
evaluateFeatureGateFriction(summary):

  assessments = []

  for gate in summary.gates:
    ratio = gate.frictionRatio

    if ratio > 0.15:
      // >15% of tickets about this gate — repelling, not converting
      assessments.push({
        gateName: gate.gateName,
        frictionRatio: ratio,
        ticketCount: gate.ticketCount,
        level: "critical",
        recommendation: "Gate '" + gate.gateName + "' generated " + gate.ticketCount +
          " complaints (" + formatPercent(ratio) + " of all tickets). " +
          "Escalate to principal. Consider: (a) improve gate explanation, " +
          "(b) move feature to lower tier, (c) remove gate."
      })

    else if ratio > 0.05:
      // 5-15% — borderline friction
      assessments.push({
        gateName: gate.gateName,
        frictionRatio: ratio,
        ticketCount: gate.ticketCount,
        level: "warning",
        recommendation: "Gate '" + gate.gateName + "' at " + formatPercent(ratio) +
          " friction. Monitor next period. If sustained, investigate conversion impact."
      })

    else:
      assessments.push({
        gateName: gate.gateName,
        frictionRatio: ratio,
        ticketCount: gate.ticketCount,
        level: "ok",
        recommendation: "Friction within expected range."
      })

  overallLevel = assessments has any "critical" ? "critical"
               : assessments has any "warning" ? "warning"
               : "ok"

  return { period: summary.period, assessments, overallLevel }
```

Thresholds derive from CR concept design §6.3: the concept design uses a complaints-to-conversions ratio >5:1 as the escalation trigger. V1 denominates against total tickets (not conversions) because conversion attribution per gate is not yet instrumented. The >15% critical threshold and >5% warning threshold are the V1 equivalents. S9 (Entity Intelligence) wires conversion attribution per gate, enabling the concept design's original ratio. [Source: `2-concept-design/commercial-and-revenue.md` — §6.3]

### 6.3 Decision Logging

Each evaluation is logged via SI §9.2 structured decision logging:

```typescript
logDecision({
  domain: "commercial",
  decisionType: "feature_gate_friction_evaluation",  // registered in SI §9.2
  inputs: { period: summary.period, gateCount: summary.gates.length },
  output: { overallLevel, criticalGateCount, warningGateCount },
  entityContext: {}
})
```

`feature_gate_friction_evaluation` is not a separate decision type in SI §9.2. It logs under the existing `conversion_trigger_evaluation` decision type with `inputs.subType: "feature_gate_friction"`, since friction evaluation is part of the broader conversion funnel analysis ceremony. No SI amendment needed.

### 6.4 Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | `evaluateFeatureGateFriction` returns `"critical"` for any gate with `frictionRatio > 0.15` and `"warning"` for `frictionRatio > 0.05`. |
| AC-2 | `overallLevel` equals the worst severity across all gate assessments (critical > warning > ok). |
| AC-3 | Each `GateFrictionAssessment` includes the gate name, ticket count, friction ratio, and a non-empty recommendation string. |

---

## §7 Low-Quality Intervention

When a paid listing's quality score drops below 40 and the subscription is older than 14 days, CR triggers a low-quality intervention: a notification to the provider, quality improvement suggestions, and a 30-day `check_quality_improvement` deferred action that re-evaluates quality and emits `churn_risk_detected` if unresolved. [Source: CR concept design §4.6, CR-X-5]

### 7.1 Trigger Conditions

The `quality_score_changed` event consumer (§10) calls `triggerLowQualityIntervention` when all three conditions hold:

1. **Paid listing:** `listings.subscriptionTier !== "free"` (read from D&L via `listings` table join).
2. **Quality below threshold:** `event.newComposite < 40`.
3. **Grace period elapsed:** `listings.subscriptionStartDate` is >14 days ago (prevents triggering on newly subscribed listings during progressive disclosure). [Source: CR-X-5]

The 14-day grace check reads `listings.subscriptionStartDate` (S4 §1.1) via join — not a CR-local column (D1 applied). This is an async consumer with a 5s budget; the join adds <5ms.

### 7.2 `triggerLowQualityIntervention` Logic

```typescript
// src/server/commercial/low-quality-intervention.ts

type LowQualityInterventionInput = {
  listingId: UUID
  accountId: UUID
  currentComposite: number         // the newComposite from the quality_score_changed event
  subscriptionTier: SubscriptionTier
}

async function triggerLowQualityIntervention(
  input: LowQualityInterventionInput
): Promise<void>
```

Decision logic:

```
triggerLowQualityIntervention(input):

  // 1. Create notification using existing type (SI §8.1)
  createNotification({
    accountId: input.accountId,
    type: "quality_score_changed",     // existing notification type — SI §8.1
    title: "Your listing quality needs attention",
    body: "Your quality score dropped to " + input.currentComposite +
          ". Improve it to maintain visibility and ranking benefits.",
    link: "/dashboard/listings/" + input.listingId + "/quality"
  })

  // 2. Schedule 30-day quality re-check deferred action
  scheduleDeferredAction({
    action: "check_quality_improvement",
    params: {
      listingId: input.listingId,
      baselineScore: input.currentComposite
    },
    executeAt: now() + 30 days,
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "commercial"
  })

  // 3. Log decision
  logDecision({
    domain: "commercial",
    decisionType: "churn_intervention",
    inputs: {
      subType: "low_quality_intervention",
      listingId: input.listingId,
      currentComposite: input.currentComposite,
      subscriptionTier: input.subscriptionTier
    },
    output: { action: "intervention_triggered", baselineScore: input.currentComposite },
    entityContext: { listingId: input.listingId, accountId: input.accountId }
  })
```

**No email sent.** Low-quality intervention uses the in-app notification only. The `quality_score_changed` notification type already exists in SI §8.1. Conversion/win-back emails are for upsell and recovery; quality intervention is an operational nudge. The provider sees it on their dashboard.

### 7.3 `handleCheckQualityImprovement` Deferred Action Handler

Fires 30 days after intervention. Reads the current quality score and compares to the baseline captured at intervention time.

```typescript
// src/server/actions/commercial/check-quality-improvement.ts

async function handleCheckQualityImprovement(
  params: { listingId: UUID; baselineScore: number }
): Promise<void>
```

Decision logic:

```
handleCheckQualityImprovement(params):

  // Read current quality score
  currentScore = db.select(qualityScores.composite)
    .from(qualityScores)
    .where(qualityScores.listingId == params.listingId)
    .first()

  if currentScore is null:
    // Listing deleted or quality score not computed — no action
    return

  if currentScore >= 40:
    // Improved above threshold — intervention succeeded
    logDecision({
      domain: "commercial",
      decisionType: "churn_intervention",
      inputs: { subType: "quality_improvement_check", listingId: params.listingId,
                baselineScore: params.baselineScore, currentScore },
      output: { action: "no_action", reason: "quality_improved" },
      entityContext: { listingId: params.listingId }
    })
    return

  // Still below 40 — emit churn risk
  listing = db.select(listings.accountId, listings.subscriptionTier)
    .from(listings)
    .where(listings.id == params.listingId)
    .first()

  if listing is null OR listing.subscriptionTier == "free":
    // Listing gone or already downgraded — no action
    return

  eventBus.emit({
    type: "churn_risk_detected",
    listingId: params.listingId,
    accountId: listing.accountId,
    riskFactors: ["low_quality_paid"],
    timestamp: now()
  })

  logDecision({
    domain: "commercial",
    decisionType: "churn_intervention",
    inputs: { subType: "quality_improvement_check", listingId: params.listingId,
              baselineScore: params.baselineScore, currentScore },
    output: { action: "churn_risk_emitted", riskFactors: ["low_quality_paid"] },
    entityContext: { listingId: params.listingId, accountId: listing.accountId }
  })
```

### 7.4 `churn_risk_detected` Emission — P1 Compliance

Payload matches `ChurnRiskDetectedEvent` (CR interface spec §1.2):

```typescript
{
  type: "churn_risk_detected",
  listingId: UUID,                    // from deferred action params
  accountId: UUID,                    // from listings table (CR-local read)
  riskFactors: ["low_quality_paid"],  // ChurnRiskFactor union member
  timestamp: ISO8601
}
```

All fields present in CR §1.2. `"low_quality_paid"` is a valid `ChurnRiskFactor` union member. Consumers: Ops upserts ChurnRiskRegistry (Ops §2 consumer), PP displays quality improvement suggestions (PP async consumer). [Source: `interfaces/commercial-and-revenue.md` — §1.2]

### 7.5 SI Amendment: `check_quality_improvement`

`check_quality_improvement` must be added to SI §2.1 `DeferredActionParamsMap` and SI §2.2 registered actions table:

**SI §2.1 addition:**
```typescript
check_quality_improvement: { listingId: UUID; baselineScore: number }
```

**SI §2.2 row:**

| Domain | Action | Trigger | Delay | Retry | On Failure |
|--------|--------|---------|-------|-------|------------|
| Commercial | `check_quality_improvement` | Low-quality intervention (§7) | 30 days | `once` | `log` |

**Total DeferredActionParamsMap entries after S8:** 17 (16 from S7 + 1 new).

### 7.6 Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-4 | `triggerLowQualityIntervention` creates a `quality_score_changed` notification with the listing's current composite score and a link to the listing's quality page. |
| AC-5 | `triggerLowQualityIntervention` schedules a `check_quality_improvement` deferred action with `baselineScore` equal to the current composite and `executeAt` 30 days from now. |
| AC-6 | `handleCheckQualityImprovement` emits `churn_risk_detected` with `riskFactors: ["low_quality_paid"]` when the listing's quality score remains below 40 after 30 days. |
| AC-7 | `handleCheckQualityImprovement` takes no action (no event emitted) when the listing's quality score has improved to 40 or above. |
| AC-8 | `handleCheckQualityImprovement` takes no action when the listing no longer exists, has no quality score, or has been downgraded to free tier. |

---

## §8 Refund Evaluation

`evaluateRefund` provides the decision architecture for S7's refund processing route (`admin.refunds.evaluate`). CR owns the commercial intelligence — eligibility rules, partial vs full determination, engagement guard, repeat-refund guard. Ops owns the admin route surface and Paddle API call. S7 imports `evaluateRefund` via P4. [Source: CR concept design §2.6]

### 8.1 `evaluateRefund` Decision Architecture

```typescript
// src/server/commercial/refund-evaluation.ts

type RefundEvaluationInput = {
  listingId: UUID
  paddleSubscriptionId: string
  subscriptionAgeInDays: number         // days since subscription start
  reason: string                        // free text from admin/support
  enquiriesReceivedSinceSubscription: number  // from D&L getEngagementCounters
  priorRefundCount: number              // count of "refund" entries in churn_analysis_log for this listing
  lastRefundAt: ISO8601 | null          // most recent refund date for this listing
  effectivePrice: number                // from commercial_state.effectivePriceAtSubscription
  billingCadence: "annual" | "monthly"  // from listings.billingCadence
}

type RefundDecision = {
  eligible: boolean
  refundType: "full" | "partial" | "deny"
  amount: number                        // GBP — 0 when denied
  rationale: string                     // human-readable explanation for admin
}

function evaluateRefund(input: RefundEvaluationInput): RefundDecision
```

Decision logic:

```
evaluateRefund(input):

  // Guard 1: engagement guard — deny if listing shows significant engagement
  if input.enquiriesReceivedSinceSubscription > 10:
    return {
      eligible: false,
      refundType: "deny",
      amount: 0,
      rationale: "Listing received " + input.enquiriesReceivedSinceSubscription +
        " enquiries since subscription. Service has been consumed."
    }

  // Guard 2: repeat refund — deny if prior refund within 12 months
  if input.priorRefundCount > 0 AND input.lastRefundAt is not null:
    monthsSinceLastRefund = daysBetween(input.lastRefundAt, now()) / 30
    if monthsSinceLastRefund < 12:
      return {
        eligible: false,
        refundType: "deny",
        amount: 0,
        rationale: "Prior refund issued " + floor(monthsSinceLastRefund) +
          " months ago. Policy: one refund per 12-month period."
      }

  // Guard 3: age guard — deny if >90 days since subscription
  if input.subscriptionAgeInDays > 90:
    return {
      eligible: false,
      refundType: "deny",
      amount: 0,
      rationale: "Subscription is " + input.subscriptionAgeInDays +
        " days old. Maximum refund window is 90 days."
    }

  // Full refund: within 30 days, first refund
  if input.subscriptionAgeInDays <= 30:
    return {
      eligible: true,
      refundType: "full",
      amount: input.effectivePrice,
      rationale: "Within 30-day refund window. Full refund of £" + input.effectivePrice + "."
    }

  // Partial refund: 31-90 days, pro-rata for extenuating circumstances
  remainingDays = input.billingCadence == "annual" ? (365 - input.subscriptionAgeInDays) : (30 - (input.subscriptionAgeInDays % 30))
  totalDays = input.billingCadence == "annual" ? 365 : 30
  proRataAmount = floor(input.effectivePrice * (remainingDays / totalDays))

  return {
    eligible: true,
    refundType: "partial",
    amount: proRataAmount,
    rationale: "Beyond 30-day window (" + input.subscriptionAgeInDays + " days). " +
      "Pro-rata refund: £" + proRataAmount + " (" + remainingDays + "/" + totalDays + " days remaining)."
  }
```

**Scope boundary vs concept design §2.6:** The concept design specifies a 14-day cooling-off period (UK Consumer Contracts Regulations 2013) and a separate 30-day pro-rata window. S8 consolidates these into a simpler model: 30-day full refund (which subsumes the 14-day statutory requirement), 31-90 day pro-rata, >90 day deny. The 14-day statutory obligation is satisfied by the broader 30-day window. The concept design's "principal approval for >30 days" is replaced by the pro-rata 31-90 day band, with >90 days as a hard deny. Principal override remains available via the admin dashboard but is not part of the automated evaluation.

### 8.2 Integration with S7

S7's `admin.refunds.evaluate` mutation calls `evaluateRefund` (P4 import). The integration flow:

1. Admin opens refund request in S7's admin dashboard.
2. S7 queries `churn_analysis_log` for `priorRefundCount` and `lastRefundAt` (where `eventType = "refund"` and `listingId` matches).
3. S7 queries D&L `getEngagementCounters(listingId)` for `enquiriesReceivedSinceSubscription`.
4. S7 reads `commercial_state.effectivePriceAtSubscription` and `listings.billingCadence`.
5. S7 passes all inputs to `evaluateRefund`.
6. If `eligible: true`, S7 calls `PaymentService.cancelSubscription` + Paddle refund API, emits `subscription_tier_changed` via `applyDowngrade` (CR §2.5), and logs to `churn_analysis_log` with `eventType: "refund"`.
7. If `eligible: false`, S7 displays the `rationale` to the admin.

CR provides the decision; S7 executes. No CR tRPC route needed.

### 8.3 Decision Logging

Each refund evaluation is logged via SI §9.2 structured decision logging:

```typescript
logDecision({
  domain: "commercial",
  decisionType: "refund_evaluation",
  inputs: {
    listingId: input.listingId,
    subscriptionAgeInDays: input.subscriptionAgeInDays,
    enquiriesReceived: input.enquiriesReceivedSinceSubscription,
    priorRefundCount: input.priorRefundCount,
    effectivePrice: input.effectivePrice
  },
  output: {
    eligible: decision.eligible,
    refundType: decision.refundType,
    amount: decision.amount
  },
  entityContext: { listingId: input.listingId }
})
```

**`refund_evaluation` is a new decision type.** SI §9.2 currently lists `conversion_trigger_evaluation`, `churn_intervention`, `winback_evaluation`, and `sponsored_placement_selection` under Commercial. `refund_evaluation` must be added. This is a documentation-only addition — the decision logging infrastructure (S0) accepts arbitrary `decisionType` strings. The SI §9.2 table is a registry, not a constraint.

### 8.4 Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-9 | `evaluateRefund` returns `refundType: "deny"` when `enquiriesReceivedSinceSubscription > 10`, regardless of subscription age. |
| AC-10 | `evaluateRefund` returns `refundType: "deny"` when a prior refund was issued within the last 12 months for the same listing. |
| AC-11 | `evaluateRefund` returns `refundType: "full"` with `amount` equal to `effectivePriceAtSubscription` when subscription age is 30 days or less and no deny guards trigger. |
| AC-12 | `evaluateRefund` returns `refundType: "partial"` with a pro-rata amount when subscription age is 31-90 days and no deny guards trigger. |
| AC-13 | `evaluateRefund` returns `refundType: "deny"` when subscription age exceeds 90 days. |

---

## §9 Pricing Configuration

`PRICING` is the single source of truth for all tier pricing values. It is a const export from `src/server/commercial/pricing-config.ts`, imported by PP (pricing page), CR internals (conversion triggers, revenue perception), and the Paddle webhook handler (checkout validation). No tRPC route — static export. [Source: CR interface spec §4.3]

### 9.1 `PRICING` Const Definition

```typescript
// src/server/commercial/pricing-config.ts

import { type SubscriptionTier } from "@/db/schema"

export const PRICING = {
  free:     { annual: 0,   monthly: 0  },
  standard: { annual: 199, monthly: 19 },
  premium:  { annual: 399, monthly: 39 },
  partner:  { annual: 699, monthly: 69 },
} as const satisfies Record<SubscriptionTier, { annual: number; monthly: number }>

export type PricingConfig = typeof PRICING
```

Values: £199/£399/£699 annual, £19/£39/£69 monthly. All prices are GBP ex-VAT. Paddle handles VAT calculation at checkout. [Source: CR concept design §1.1, §1.2]

### 9.2 CR-Q2 Resolution

**Resolved.** Monthly values are £19/£39/£69 as specified in CR concept design §1.1. The monthly pricing rule is "annual-equivalent divided by 12, rounded up to the nearest clean integer in the 15-20% premium band." Standard £19 yields 14.6% premium (intentional deviation from the 15% floor — confirmed in CR-ST-11). Premium £39 yields 17.3%. Partner £69 yields 18.5%. No recalculation needed; values are settled and documented in the interface spec §4.3 `PRICING` export. [Source: `interfaces/commercial-and-revenue.md` — §4.3, `2-concept-design/commercial-and-revenue.md` — §1.1]

### 9.3 Launch Discount Interaction

Launch discounts (CR concept design §1.1a) modify `commercial_state.effectivePriceAtSubscription`, NOT the `PRICING` const. `PRICING` defines the standard rate card. Discounts are applied at checkout via Paddle coupon mechanism:

1. `PRICING` values are displayed on the pricing page as the standard rate.
2. Launch discount coupon (£99 first-year Standard) is applied during Paddle checkout flow.
3. When Paddle's `checkout.completed` webhook fires, the `subscription_tier_changed` consumer writes `effectivePriceAtSubscription = 99` to `commercial_state` (the amount actually paid).
4. `PRICING.standard.annual` (199) remains the standard rate for revenue perception calculations. `effectivePriceAtSubscription` (99) is the actual revenue per listing.
5. On year-2 renewal, Paddle charges the full £199. `effectivePriceAtSubscription` is updated to 199.

Coupon scope: `new_subscriptions_only` (CR-X-3). Existing subscribers cannot apply the launch coupon.

### 9.4 Multi-Listing Pricing V1 Stance

No multi-listing discount at V1. Each listing is priced independently at the tier rate from `PRICING`. An account with 3 listed businesses pays 3 separate subscriptions at the per-listing tier price.

Rationale: multi-listing accounts are projected at <10% of V1 paid base. Bundle discount logic adds billing complexity for minimal revenue impact. The entity tracks multi-listing churn and support tickets to inform V2 pricing. [Source: `2-concept-design/commercial-and-revenue.md` — §3]

**Deferred design:** CR concept design §3.2 specifies `evaluateMultiListingPricingEvolution` — a quarterly evaluation that recommends bundle discounts when data supports it (signals: secondary listing churn >30%, >10 pricing support tickets from multi-listing accounts, >20 multi-listing accounts). This evaluation is V2 scope (S9 entity intelligence or post-V1). S8 does not implement it.

### 9.5 `PRICING` Consumers

| Consumer | Import Pattern | Usage |
|----------|---------------|-------|
| PP pricing page | `import { PRICING } from "@/server/commercial/pricing-config"` | Display tier prices (SSG) |
| CR conversion triggers (§1) | Same import | Reference standard rate in conversion email merge fields |
| CR revenue perception (§5) | Same import | Compute expected MRR from tier distribution |
| Ops webhook handler | Same import | Validate checkout amounts against expected tier prices |

All consumers use P4 import. No consumer copies or redefines pricing values.

### 9.6 Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-14 | `PRICING` export is typed as `Record<SubscriptionTier, { annual: number; monthly: number }>` and satisfies the constraint at compile time. |
| AC-15 | `PRICING` values match: free 0/0, standard 199/19, premium 399/39, partner 699/69. |
| AC-16 | Launch discount writes `effectivePriceAtSubscription` to `commercial_state` at the discounted amount (e.g., 99), not the standard rate (199). `PRICING` const is unaffected. |
| AC-17 | No multi-listing discount logic exists in S8. Each listing subscription is priced independently using `PRICING[tier]`. |

---

## Acceptance Criteria Summary

**Total: 17 acceptance criteria (AC-1 through AC-17).**

| Section | Range | Count |
|---------|-------|-------|
| §6 Feature Gate Friction Evaluation | AC-1 – AC-3 | 3 |
| §7 Low-Quality Intervention | AC-4 – AC-8 | 5 |
| §8 Refund Evaluation | AC-9 – AC-13 | 5 |
| §9 Pricing Configuration | AC-14 – AC-17 | 4 |

---

## Downstream Flags

| Flag | Target | Description |
|------|--------|-------------|
| S8-D1 | S9 | Feature gate friction evaluation V2: denominate friction ratio against per-gate conversions (not total tickets). Requires conversion attribution per feature gate, which S9 entity intelligence instruments. |
| S8-D2 | S9 | Multi-listing pricing evolution: `evaluateMultiListingPricingEvolution` quarterly evaluation. Requires entity learning infrastructure from S9. |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `interfaces/operations.md` (v4) | §3.4 `getFeatureGateFrictionSummary` query — consumed by §6 |
| `interfaces/commercial-and-revenue.md` (v3) | §1.2 `ChurnRiskDetectedEvent` payload (§7), §4.3 `PRICING` const (§9), §4.1 `TIER_LIMITS` (§6 gate names) |
| `interfaces/shared-infrastructure.md` (v7) | §2 deferred actions (`check_quality_improvement` — §7 NEW), §8.1 notification types (`quality_score_changed` — §7), §9.2 decision logging (`refund_evaluation` — §8 NEW) |
| `2-concept-design/commercial-and-revenue.md` (v4) | §1.1 pricing values (§9), §1.1a launch discount (§9), §2.6 refund policy (§8), §3 multi-listing pricing (§9), §4.6 low-quality intervention (§7), §6.3 feature gate friction (§6) |
| `slices/slice-07-operations/index.md` (v2) | `admin.refunds.evaluate` imports `evaluateRefund` (§8), `admin.friction.getSummary` imports `evaluateFeatureGateFriction` (§6) |
| `s8-drafting/01-decisions.md` | D1 applied (§7 reads `listings.subscriptionStartDate` via join), D4 applied (§9 pricing values settled) |
| `s8-drafting/01-schema.md` | `commercial_state.effectivePriceAtSubscription` (§9), `churn_analysis_log` refund entries (§8) |
