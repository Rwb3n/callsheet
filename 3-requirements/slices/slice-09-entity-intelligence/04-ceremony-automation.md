<!-- Part of slice-09-entity-intelligence v2 -->

# Slice 9: Entity Intelligence — Ceremony Automation

---

## 4.1 Ceremony Framework

Every ceremony follows a single execution pattern: load inputs, compute, log to `ceremony_runs`, evaluate whether the outcome is actionable, schedule the next run. This section defines the shared utilities; §4.2–§4.4 define per-ceremony logic.

### Common Execution Pattern

```mermaid
flowchart TD
    A[Deferred action fires] --> B[Load inputs]
    B --> C{Prerequisites met?}
    C -->|No| D[logCeremonyRun status=completed, outputs={status: insufficient_data}]
    D --> E[Schedule next run]
    C -->|Yes| F[Compute ceremony outputs]
    F --> G[logCeremonyRun status=completed, outputs=report]
    G --> H{Actionable recommendation?}
    H -->|No| E
    H -->|Yes| I[evaluateCeremonyOutcome]
    I --> J{Auto-apply or escalate?}
    J -->|Auto-apply| K[Apply recommendation + logDecision]
    J -->|Escalate| L[Queue for principal + logDecision]
    K --> E
    L --> E
```

### `logCeremonyRun`

Shared utility wrapping `ceremony_runs` table insert. [Source: `01-schema.md` §2.4]

```typescript
function logCeremonyRun(params: {
  ceremonyType: CeremonyType            // Authoritative: 01-schema.md ceremonyTypeEnum
  status: "completed" | "failed"
  inputsHash: string                    // SHA-256 of serialised inputs
  outputs: Record<string, unknown>      // Ceremony-specific report
  decisionsLogged: number               // Count of logDecision calls during this run
  nextScheduledAt: ISO8601              // Self-perpetuating: when the next run fires
}): Promise<UUID>                       // Returns ceremony_run ID
```

### Idempotency Guard

Before computing, every ceremony checks whether a run with the same `inputsHash` exists for the same `ceremonyType` within the current scheduling period. This prevents duplicate runs from scheduler races or deferred action retry.

```
checkCeremonyIdempotency(type, inputsHash):
  existing = query ceremony_runs
    WHERE ceremony_type = type
    AND inputs_hash = inputsHash
    AND started_at > periodStart(type)     // monthly → start of month, quarterly → start of quarter
  if existing:
    return { skip: true, existingRunId: existing.id }
  return { skip: false }
```

`periodStart` is computed from the ceremony's cadence: `addMonths(now(), -1)` for monthly, `addMonths(now(), -3)` for quarterly, `addDays(now(), -7)` for weekly.

### `evaluateCeremonyOutcome` Decision Architecture

When a ceremony produces an actionable recommendation, this decision architecture determines whether the entity auto-applies it or escalates to the principal. [Source: SI §9.2 — `ceremony_outcome_evaluation` decision type]

```typescript
function evaluateCeremonyOutcome(params: {
  ceremonyType: CeremonyType
  recommendation: {
    action: string                       // What the ceremony recommends
    hasFinancialImpact: boolean          // Affects pricing, billing, or spend
    hasUserVisibleChange: boolean        // Affects provider/buyer experience
    precedentExists: boolean             // Prior runs applied the same recommendation type
  }
}): { disposition: "auto_apply" | "escalate_to_principal"; reason: string }
```

```
evaluateCeremonyOutcome(params):
  rec = params.recommendation

  // Escalate criteria: any one is sufficient
  if rec.hasFinancialImpact:
    return { disposition: "escalate_to_principal", reason: "financial impact" }
  if rec.hasUserVisibleChange:
    return { disposition: "escalate_to_principal", reason: "user-visible change" }
  if NOT rec.precedentExists:
    return { disposition: "escalate_to_principal", reason: "first-time recommendation type" }

  // Auto-apply: no financial impact, no user-visible change, precedent exists
  return { disposition: "auto_apply", reason: "low-risk with precedent" }
```

Every invocation logs a decision via SI §9.2:

```
logDecision({
  domain: ceremonyDomainMap[params.ceremonyType],
  decisionType: "ceremony_outcome_evaluation",
  inputs: { ceremonyType: params.ceremonyType, recommendation: rec },
  decision: disposition,
  confidence: disposition === "auto_apply" ? 0.9 : 0.7,
  reasoning: reason,
})
```

`ceremonyDomainMap` maps each `CeremonyType` to its owning domain: `taxonomy_review` / `data_health_review` / `verification_calibration` / `provider_outreach` → `"data-and-listings"`, `conversion_funnel_analysis` / `multi_listing_pricing` → `"commercial"`, `operational_health_review` / `contractor_performance_review` / `principal_briefing` → `"operations"`.

---

## 4.2 D&L Ceremonies

Four ceremonies owned by the Data & Listings sub-entity. [Source: D&L CD §5 Layer 3]

### `taxonomy_review_preparation` (quarterly)

Aggregates free-text tags from listings, clusters by similarity, and cross-references zero-result search terms. Resolves S3-4 (verification calibration) partial and feeds the Taxonomy Review ceremony. [Source: D&L CD §5 — Taxonomy Review ceremony]

**Handler:** `src/server/actions/intelligence/taxonomy-review-preparation.ts`
**Deferred action params:** `Record<string, never>` — batch ceremony, no per-entity params.
**Retry:** `once`. **On failure:** `log`.

```
handleTaxonomyReviewPreparation():
  // Idempotency
  hash = sha256(JSON.stringify({ quarter: currentQuarter() }))
  guard = checkCeremonyIdempotency("taxonomy_review", hash)
  if guard.skip: return

  // Pattern #15: prerequisite check
  tagCount = count(listing_taxonomy_tags)
  if tagCount === 0:
    logCeremonyRun({
      ceremonyType: "taxonomy_review",
      status: "completed",
      inputsHash: hash,
      outputs: { status: "insufficient_data", reason: "no taxonomy data" },
      decisionsLogged: 0,
      nextScheduledAt: addMonths(now(), 3),
    })
    scheduleDeferred("taxonomy_review_preparation", {}, addMonths(now(), 3))
    return

  // Load inputs
  freeTextTags = query listing_taxonomy_tags
    WHERE tag NOT IN (select name from taxonomy_specialisations)
    GROUP BY tag
    ORDER BY count DESC
  zeroResultTerms = query perception_aggregates
    WHERE aggregate_type = "search_terms"
    AND data->>'zeroResultTerms' IS NOT NULL
    ORDER BY computed_at DESC LIMIT 1

  // Compute: cluster free-text tags by similarity, identify promotable candidates
  promotableTags = freeTextTags
    .filter(t => t.count >= 20)
    .map(t => ({
      tag: t.tag,
      frequency: t.count,
      suggestedParent: findClosestTaxonomyNode(t.tag),  // string similarity match
    }))

  zeroResultClusters = clusterZeroResultTerms(zeroResultTerms)

  report = {
    promotableTags,
    zeroResultClusters,
    totalFreeTextTags: freeTextTags.length,
    coverageRate: 1 - (freeTextTags.length / tagCount),
  }

  // Evaluate promotable tags
  decisionsLogged = 0
  for tag in promotableTags:
    if tag.suggestedParent !== null AND similarity(tag.tag, tag.suggestedParent) > 0.8:
      // Clean mapping — taxonomy promotion candidate
      outcome = evaluateCeremonyOutcome({
        ceremonyType: "taxonomy_review",
        recommendation: {
          action: `promote_tag:${tag.tag}`,
          hasFinancialImpact: false,
          hasUserVisibleChange: true,     // taxonomy additions change search behaviour
          precedentExists: hasPriorPromotion(tag.tag),
        },
      })
      // Always escalate taxonomy additions (user-visible)
      // Additionally log taxonomy-specific decision
      logDecision({
        domain: "data-and-listings",
        decisionType: "taxonomy_promotion_evaluation",
        inputs: { tag: tag.tag, frequency: tag.frequency, suggestedParent: tag.suggestedParent, similarity: similarity(tag.tag, tag.suggestedParent) },
        decision: outcome.disposition,
        confidence: similarity(tag.tag, tag.suggestedParent),
        reasoning: outcome.reason,
      })
      decisionsLogged += 2  // ceremony_outcome_evaluation + taxonomy_promotion_evaluation

  nextRun = addMonths(now(), 3)
  logCeremonyRun({
    ceremonyType: "taxonomy_review",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("taxonomy_review_preparation", {}, nextRun)
```

**Output type:**

```typescript
type TaxonomyReviewReport = {
  promotableTags: { tag: string; frequency: number; suggestedParent: string | null }[]
  zeroResultClusters: { terms: string[]; frequency: number }[]
  totalFreeTextTags: number
  coverageRate: number
}
```

### `data_health_review` (monthly)

Computes quality score distribution, decay trends, and enrichment coverage. [Source: D&L CD §5 — Data Health Review ceremony]

**Handler:** `src/server/actions/intelligence/data-health-review.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleDataHealthReview():
  hash = sha256(JSON.stringify({ month: currentMonth() }))
  guard = checkCeremonyIdempotency("data_health_review", hash)
  if guard.skip: return

  // Quality score distribution — reuses admin.intelligence.qualityDistribution logic
  qualityDistribution = computeQualityDistribution(null)  // all time

  // Decay trend: new vs resolved signals over last 30 days
  newSignals30d = count(decay_signals WHERE detected_at > addDays(now(), -30))
  resolved30d = count(decay_signals WHERE resolved_at > addDays(now(), -30))
  activeCount = count(decay_signals WHERE resolved_at IS NULL)

  // Enrichment coverage by tier
  totalListings = count(listings WHERE lifecycle_status = 'active')
  paidWithSchedule = count(DISTINCT enrichment_schedules.listing_id
    WHERE cadence_tier = 'paid')
  claimedWithSchedule = count(DISTINCT enrichment_schedules.listing_id
    WHERE cadence_tier = 'claimed')
  unclaimedWithSchedule = count(DISTINCT enrichment_schedules.listing_id
    WHERE cadence_tier = 'unclaimed')

  report: DataHealthReport = {
    qualityDistribution,
    decayTrend: { newSignals30d, resolved30d, activeCount },
    enrichmentCoverage: {
      paid: paidWithSchedule / countPaidListings,
      claimed: claimedWithSchedule / countClaimedListings,
      unclaimed: unclaimedWithSchedule / countUnclaimedListings,
    },
  }

  // Evaluate: worsening decay = escalate; low enrichment coverage = investigate
  decisionsLogged = 0
  if newSignals30d > 2 * resolved30d:
    evaluateCeremonyOutcome({
      ceremonyType: "data_health_review",
      recommendation: {
        action: "escalate_decay_trend",
        hasFinancialImpact: false,
        hasUserVisibleChange: false,
        precedentExists: hasPriorDecayEscalation(),
      },
    })
    // Escalates to principal: decay trend worsening
    decisionsLogged += 1

  for tier in ["paid", "claimed", "unclaimed"]:
    if report.enrichmentCoverage[tier] < 0.80:
      evaluateCeremonyOutcome({
        ceremonyType: "data_health_review",
        recommendation: {
          action: `investigate_enrichment_coverage:${tier}`,
          hasFinancialImpact: false,
          hasUserVisibleChange: false,
          precedentExists: true,        // enrichment monitoring is ongoing
        },
      })
      decisionsLogged += 1

  nextRun = addMonths(now(), 1)
  logCeremonyRun({
    ceremonyType: "data_health_review",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("data_health_review", {}, nextRun)
```

**Output type:**

```typescript
type DataHealthReport = {
  qualityDistribution: QualityDistribution   // Same type as admin.intelligence.qualityDistribution return
  decayTrend: {
    newSignals30d: number
    resolved30d: number
    activeCount: number
  }
  enrichmentCoverage: Record<"paid" | "claimed" | "unclaimed", number>  // 0–1 fraction
}
```

### `verification_calibration_review` (quarterly)

Analyses `claim_evaluation` decision logs for auto-approve accuracy rates. Resolves S3-4. [Source: D&L CD §5 — Verification Calibration ceremony]

**Handler:** `src/server/actions/intelligence/verification-calibration-review.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleVerificationCalibrationReview():
  hash = sha256(JSON.stringify({ quarter: currentQuarter() }))
  guard = checkCeremonyIdempotency("verification_calibration", hash)
  if guard.skip: return

  // Pattern #15: prerequisite check
  quarterStart = startOfQuarter(now())
  claimDecisions = query decision_logs
    WHERE decision_type = "claim_evaluation"
    AND created_at >= quarterStart

  if claimDecisions.length === 0:
    logCeremonyRun({
      ceremonyType: "verification_calibration",
      status: "completed",
      inputsHash: hash,
      outputs: { status: "insufficient_data", reason: "no claim_evaluation decision logs this quarter" },
      decisionsLogged: 0,
      nextScheduledAt: addMonths(now(), 3),
    })
    scheduleDeferred("verification_calibration_review", {}, addMonths(now(), 3))
    return

  // Compute accuracy metrics
  totalClaims = claimDecisions.length
  autoApproved = claimDecisions.filter(d => d.decision === "auto_approve")
  manualReview = claimDecisions.filter(d => d.decision === "queue_manual_review")

  // Auto-approve accuracy: approved claims that stayed verified (not reverted/challenged)
  autoApproveStillVerified = autoApproved.filter(d =>
    query verifications WHERE listing_id = d.inputs.listingId AND tier IN ("verified", "premium_verified")
  ).length
  autoApproveAccuracy = autoApproveStillVerified / autoApproved.length

  // False positive rate: auto-approved then reverted
  falsePositives = autoApproved.length - autoApproveStillVerified
  falsePositiveRate = falsePositives / autoApproved.length

  // False negative rate: manually reviewed that were ultimately approved (should have been auto)
  manualUltimatelyApproved = manualReview.filter(d =>
    query verifications WHERE listing_id = d.inputs.listingId AND tier IN ("verified", "premium_verified")
  ).length
  falseNegativeRate = manualUltimatelyApproved / manualReview.length

  report: VerificationCalibrationReport = {
    totalClaims,
    autoApproved: autoApproved.length,
    manualReview: manualReview.length,
    autoApproveAccuracy,
    falsePositiveRate,
    falseNegativeRate,
    thresholdRecommendation: null,
  }

  // Evaluate: low accuracy → escalate; very high accuracy → auto-apply candidate
  decisionsLogged = 0
  if autoApproveAccuracy < 0.90:
    report.thresholdRecommendation = "tighten"
    evaluateCeremonyOutcome({
      ceremonyType: "verification_calibration",
      recommendation: {
        action: "tighten_auto_approve_threshold",
        hasFinancialImpact: false,
        hasUserVisibleChange: true,       // affects claim approval rates
        precedentExists: hasPriorCalibrationAdjustment(),
      },
    })
    decisionsLogged += 1

  if autoApproveAccuracy > 0.98:
    report.thresholdRecommendation = "loosen"
    evaluateCeremonyOutcome({
      ceremonyType: "verification_calibration",
      recommendation: {
        action: "loosen_auto_approve_threshold",
        hasFinancialImpact: false,
        hasUserVisibleChange: true,       // more claims auto-approved
        precedentExists: hasPriorCalibrationAdjustment(),
      },
    })
    decisionsLogged += 1

  nextRun = addMonths(now(), 3)
  logCeremonyRun({
    ceremonyType: "verification_calibration",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("verification_calibration_review", {}, nextRun)
```

**Output type:**

```typescript
type VerificationCalibrationReport = {
  totalClaims: number
  autoApproved: number
  manualReview: number
  autoApproveAccuracy: number          // 0–1
  falsePositiveRate: number            // 0–1
  falseNegativeRate: number            // 0–1
  thresholdRecommendation: "tighten" | "loosen" | null
}
```

### `provider_outreach_ranking` (monthly)

Ranks unclaimed listings by estimated value for manual outreach prioritisation. No decision evaluation — output consumed by Operations for outreach campaigns. [Source: D&L CD §5 — Provider Outreach Cycle ceremony]

**Handler:** `src/server/actions/intelligence/provider-outreach-ranking.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleProviderOutreachRanking():
  hash = sha256(JSON.stringify({ month: currentMonth() }))
  guard = checkCeremonyIdempotency("provider_outreach", hash)
  if guard.skip: return

  // Load unclaimed listings with engagement data
  unclaimed = query listings
    WHERE claim_status = 'unclaimed'
    AND lifecycle_status = 'active'
    JOIN quality_scores ON quality_scores.listing_id = listings.id
    JOIN engagements ON engagements.listing_id = listings.id

  // Rank by estimated value: quality × engagement × sector demand
  ranked = unclaimed
    .map(l => ({
      listingId: l.id,
      estimatedValue: l.qualityScore.composite * (l.engagements.views + l.engagements.enquiries * 10) * sectorDemandMultiplier(l.sectorId),
      qualityScore: l.qualityScore.composite,
      engagement: { views: l.engagements.views, enquiries: l.engagements.enquiries },
      sector: l.sectorName,
    }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, 50)

  report: OutreachRanking = {
    listings: ranked,
    topN: ranked.length,
    generatedAt: now(),
  }

  // No evaluateCeremonyOutcome — informational output only
  nextRun = addMonths(now(), 1)
  logCeremonyRun({
    ceremonyType: "provider_outreach",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged: 0,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("provider_outreach_ranking", {}, nextRun)
```

**Output type:**

```typescript
type OutreachRanking = {
  listings: {
    listingId: UUID
    estimatedValue: number
    qualityScore: number
    engagement: { views: number; enquiries: number }
    sector: string
  }[]
  topN: number
  generatedAt: ISO8601
}
```

---

## 4.3 CR Ceremonies

Two ceremonies owned by the Commercial & Revenue sub-entity.

### `conversion_funnel_analysis` (monthly)

Evaluates trigger effectiveness for S8's 6 conversion triggers. Produces threshold adjustment recommendations. [Source: CR CD §5 conversion trigger thresholds]

**Handler:** `src/server/actions/intelligence/conversion-funnel-analysis.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleConversionFunnelAnalysis():
  hash = sha256(JSON.stringify({ month: currentMonth() }))
  guard = checkCeremonyIdempotency("conversion_funnel_analysis", hash)
  if guard.skip: return

  // Pattern #15: prerequisite check
  triggerDecisions = query decision_logs
    WHERE decision_type = "conversion_trigger_evaluation"
    AND created_at >= addDays(now(), -30)

  if triggerDecisions.length === 0:
    logCeremonyRun({
      ceremonyType: "conversion_funnel_analysis",
      status: "completed",
      inputsHash: hash,
      outputs: { status: "insufficient_data", reason: "no conversion_trigger_evaluation decision logs this month" },
      decisionsLogged: 0,
      nextScheduledAt: addMonths(now(), 1),
    })
    scheduleDeferred("conversion_funnel_analysis", {}, addMonths(now(), 1))
    return

  // Per-trigger metrics
  // S8 defines 6 triggers: analytics_tease, social_proof_tease, engagement_summary_tease,
  //   competitor_upgraded, quality_score_improved, direct_cta
  triggerTypes = distinct(triggerDecisions.map(d => d.inputs.triggerType))

  perTrigger = triggerTypes.map(type => {
    fired = triggerDecisions.filter(d => d.inputs.triggerType === type)
    firingRate = fired.length / eligibleViews(type)   // eligible = views where trigger could have fired

    // Conversion: tier change within 30 days of firing
    converted = fired.filter(d =>
      query decision_logs
        WHERE decision_type = "conversion_trigger_evaluation"
        AND inputs.accountId = d.inputs.accountId
        AND inputs.outcome = "tier_upgraded"
        AND created_at BETWEEN d.created_at AND addDays(d.created_at, 30)
    ).length
    conversionRate = converted / fired.length

    return {
      triggerType: type,
      fired: fired.length,
      firingRate,
      conversions: converted,
      conversionRate,
    }
  })

  report: ConversionFunnelReport = {
    period: { from: addDays(now(), -30), to: now() },
    perTrigger,
    totalFirings: triggerDecisions.length,
    overallConversionRate: sum(perTrigger.map(t => t.conversions)) / triggerDecisions.length,
  }

  // Evaluate: threshold adjustment recommendations
  decisionsLogged = 0
  for trigger in perTrigger:
    if trigger.firingRate < 0.05 OR trigger.firingRate > 0.50:
      logDecision({
        domain: "commercial",
        decisionType: "conversion_threshold_adjustment",
        inputs: { triggerType: trigger.triggerType, firingRate: trigger.firingRate, conversionRate: trigger.conversionRate },
        decision: trigger.firingRate < 0.05 ? "lower_threshold" : "raise_threshold",
        confidence: 0.7,
        reasoning: trigger.firingRate < 0.05
          ? `Trigger ${trigger.triggerType} fires at ${trigger.firingRate} — below 5% threshold`
          : `Trigger ${trigger.triggerType} fires at ${trigger.firingRate} — above 50% threshold`,
      })
      decisionsLogged += 1

  nextRun = addMonths(now(), 1)
  logCeremonyRun({
    ceremonyType: "conversion_funnel_analysis",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("conversion_funnel_analysis", {}, nextRun)
```

**Output type:**

```typescript
type ConversionFunnelReport = {
  period: { from: ISO8601; to: ISO8601 }
  perTrigger: {
    triggerType: string
    fired: number
    firingRate: number
    conversions: number
    conversionRate: number
  }[]
  totalFirings: number
  overallConversionRate: number
}
```

### `multi_listing_pricing_evaluation` (quarterly)

Evaluates multi-listing pricing model viability. Requires 20+ multi-listing paid accounts before computation proceeds. Resolves S8-4. [Source: CR CD §3.2 multi-listing pricing evolution]

**Handler:** `src/server/actions/intelligence/multi-listing-pricing-evaluation.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleMultiListingPricingEvaluation():
  hash = sha256(JSON.stringify({ quarter: currentQuarter() }))
  guard = checkCeremonyIdempotency("multi_listing_pricing", hash)
  if guard.skip: return

  // Pattern #15: 20+ account threshold check FIRST
  multiListingPaidAccounts = count(
    SELECT DISTINCT account_id FROM listings
    WHERE lifecycle_status = 'active'
    AND subscription_tier IN ('standard', 'premium', 'partner')
    GROUP BY account_id
    HAVING count(*) > 1
  )

  if multiListingPaidAccounts < 20:
    logCeremonyRun({
      ceremonyType: "multi_listing_pricing",
      status: "completed",
      inputsHash: hash,
      outputs: { status: "insufficient_data", reason: `only ${multiListingPaidAccounts} multi-listing paid accounts (need 20+)` },
      decisionsLogged: 0,
      nextScheduledAt: addMonths(now(), 3),
    })
    scheduleDeferred("multi_listing_pricing_evaluation", {}, addMonths(now(), 3))
    return

  // Compute secondary listing churn rate
  quarterStart = startOfQuarter(now())
  secondaryListings = query churn_analysis_log
    WHERE created_at >= quarterStart
    AND listing_id IN (
      SELECT listing_id FROM listings
      WHERE account_id IN (
        SELECT account_id FROM listings
        GROUP BY account_id HAVING count(*) > 1
      )
    )
  secondaryChurnRate = secondaryListings.filter(c => c.churned).length / secondaryListings.length

  // Aggregate pricing support tickets
  pricingTickets = count(support_tickets
    WHERE category = 'pricing'
    AND created_at >= quarterStart)

  report: MultiListingPricingReport = {
    multiListingPaidAccounts,
    secondaryChurnRate,
    pricingTicketsInQuarter: pricingTickets,
    discountModelViable: secondaryChurnRate <= 0.30 AND pricingTickets <= 10,
  }

  // Evaluate: high secondary churn or frequent pricing tickets → recommend discount, escalate
  decisionsLogged = 0
  if secondaryChurnRate > 0.30 OR pricingTickets > 10:
    evaluateCeremonyOutcome({
      ceremonyType: "multi_listing_pricing",
      recommendation: {
        action: "recommend_multi_listing_discount",
        hasFinancialImpact: true,         // pricing change
        hasUserVisibleChange: true,       // discount affects displayed pricing
        precedentExists: hasPriorPricingRecommendation(),
      },
    })
    // Always escalates (financial impact + user-visible)
    decisionsLogged += 1

  nextRun = addMonths(now(), 3)
  logCeremonyRun({
    ceremonyType: "multi_listing_pricing",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("multi_listing_pricing_evaluation", {}, nextRun)
```

**Output type:**

```typescript
type MultiListingPricingReport = {
  multiListingPaidAccounts: number
  secondaryChurnRate: number            // 0–1
  pricingTicketsInQuarter: number
  discountModelViable: boolean
}
```

---

## 4.4 Ops Ceremonies

Three ceremonies owned by the Operations sub-entity. [Source: Ops CD §9 Layer 3]

### `operational_health_review` (monthly)

Aggregates hypothesis analysis, health trends, and signal history. [Source: Ops CD §9 — Operational Health Review ceremony]

**Handler:** `src/server/actions/intelligence/operational-health-review.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleOperationalHealthReview():
  hash = sha256(JSON.stringify({ month: currentMonth() }))
  guard = checkCeremonyIdempotency("operational_health_review", hash)
  if guard.skip: return

  // Hypothesis analysis summary — reads from learning_hypotheses table (D4: 7 static rows)
  hypotheses = query learning_hypotheses ORDER BY id

  // Health trends
  supportTickets30d = count(support_tickets WHERE created_at > addDays(now(), -30))
  taskCompletionRate = count(task_specs WHERE status = 'completed' AND updated_at > addDays(now(), -30))
    / count(task_specs WHERE created_at > addDays(now(), -30))

  // Signal history: decay signals, quality score changes
  decaySignals30d = count(decay_signals WHERE detected_at > addDays(now(), -30))
  qualityChanges30d = count(decision_logs
    WHERE decision_type = "quality_score_band_evaluation"
    AND created_at > addDays(now(), -30))

  // Simplified representation — §5 (05-entity-learning.md §5.6) is authoritative for
  // OperationalHealthReport type structure and handler code [S9-ST-13]
  report: OperationalHealthReport = {
    hypotheses: hypotheses.map(h => ({
      id: h.id,
      trend: h.trend,
      currentValue: h.currentValue,
      confoundWarning: h.confoundWarning,
    })),
    healthTrends: {
      supportTickets30d,
      taskCompletionRate,
      decaySignals30d,
      qualityChanges30d,
    },
  }

  nextRun = addMonths(now(), 1)
  logCeremonyRun({
    ceremonyType: "operational_health_review",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged: 0,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("operational_health_review", {}, nextRun)
```

**Output type:** `OperationalHealthReport` — authoritative type definition in §5 (`05-entity-learning.md` §5.6). §4's pseudocode uses a simplified representation; §5 is authoritative for handler code and full type structure. [S9-ST-13]

### `contractor_performance_review` (quarterly)

Computes per-contractor performance metrics. [Source: Ops CD §9 — Contractor Performance Review ceremony]

**Handler:** `src/server/actions/intelligence/contractor-performance-review.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handleContractorPerformanceReview():
  hash = sha256(JSON.stringify({ quarter: currentQuarter() }))
  guard = checkCeremonyIdempotency("contractor_performance_review", hash)
  if guard.skip: return

  // Pattern #15: prerequisite check
  quarterStart = startOfQuarter(now())
  completedTasks = query task_specs
    WHERE status IN ('completed', 'rejected')
    AND updated_at >= quarterStart

  if completedTasks.length === 0:
    logCeremonyRun({
      ceremonyType: "contractor_performance_review",
      status: "completed",
      inputsHash: hash,
      outputs: { status: "insufficient_data", reason: "no completed task_specs this quarter" },
      decisionsLogged: 0,
      nextScheduledAt: addMonths(now(), 3),
    })
    scheduleDeferred("contractor_performance_review", {}, addMonths(now(), 3))
    return

  // Group by contractor (assigned_to field on task_specs)
  byContractor = groupBy(completedTasks, t => t.assignedTo)

  contractors = Object.entries(byContractor).map(([contractorId, tasks]) => {
    completed = tasks.filter(t => t.status === "completed")
    completionRate = completed.length / tasks.length
    // Quality score: acceptance criteria pass rate from task outcomes
    qualityScore = completed.reduce((acc, t) => acc + (t.qualityRating ?? 0), 0) / completed.length
    costPerTask = completed.reduce((acc, t) => acc + (t.cost ?? 0), 0) / completed.length

    return {
      id: contractorId,
      completionRate,
      qualityScore,
      costPerTask,
      taskCount: tasks.length,
    }
  })

  report: ContractorPerformanceReport = { contractors }

  nextRun = addMonths(now(), 3)
  logCeremonyRun({
    ceremonyType: "contractor_performance_review",
    status: "completed",
    inputsHash: hash,
    outputs: report,
    decisionsLogged: 0,
    nextScheduledAt: nextRun,
  })
  scheduleDeferred("contractor_performance_review", {}, nextRun)
```

**Output type:**

```typescript
type ContractorPerformanceReport = {
  contractors: {
    id: string
    completionRate: number               // 0–1
    qualityScore: number                 // 0–1
    costPerTask: number                  // GBP
    taskCount: number
  }[]
}
```

### `principal_briefing_generation` (monthly)

Aggregates outputs from all ceremonies that ran in the period into a `PrincipalBriefing` object. Stores in `principal_briefings` table. Sends `principal_briefing` email template. [Source: Ops CD §9 — Principal Operations Briefing, PrincipalBriefing type]

**Handler:** `src/server/actions/intelligence/principal-briefing-generation.ts`
**Deferred action params:** `Record<string, never>`.
**Retry:** `once`. **On failure:** `log`.

```
handlePrincipalBriefingGeneration():
  hash = sha256(JSON.stringify({ month: currentMonth() }))
  guard = checkCeremonyIdempotency("principal_briefing", hash)
  if guard.skip: return

  periodStart = startOfMonth(now())
  periodEnd = now()

  // Aggregate ceremony outputs from this period
  recentRuns = query ceremony_runs
    WHERE started_at >= periodStart
    AND status = "completed"
    ORDER BY ceremony_type, started_at DESC

  // Take most recent run per ceremony type
  latestPerCeremony = deduplicateByType(recentRuns)

  // Build PrincipalBriefing content
  // Type is authoritative in Ops CD §9 — summary only here
  briefingContent = {
    period: formatMonth(periodStart),
    generatedAt: now(),

    // Revenue & Commercial — from revenue_health_extended or ceremony outputs
    mrr: latestPerCeremony["revenue_review"]?.outputs?.mrr ?? computeCurrentMRR(),
    mrrChangePercent: computeMRRChange(),
    paidSubscribers: count(listings WHERE subscription_tier != 'free'),
    churnRate: latestPerCeremony["revenue_review"]?.outputs?.churnRate30d ?? 0,
    conversionRate: latestPerCeremony["conversion_funnel_analysis"]?.outputs?.overallConversionRate ?? 0,

    // Platform Health
    uptime: computeUptime30d(),
    p95ResponseTime: computeP95ResponseTime(),
    incidents: queryP1P2Incidents(periodStart, periodEnd),
    errorRateTrend: computeErrorRateTrend(),

    // Support
    totalTickets: count(support_tickets WHERE created_at >= periodStart),
    humanTickets: count(support_tickets WHERE created_at >= periodStart AND escalated = true),
    kbDeflectionRate: computeKBDeflectionRate(periodStart),
    avgResponseTime: computeAvgResponseTime(periodStart),
    csat: computeCSAT(periodStart),
    topCategories: computeTopTicketCategories(periodStart, 5),

    // Verification & Data
    claimsReceived: count(decision_logs WHERE decision_type = "claim_evaluation" AND created_at >= periodStart),
    claimsAutoApproved: count(decision_logs WHERE decision_type = "claim_evaluation" AND decision = "auto_approve" AND created_at >= periodStart),
    claimsManualReviewed: count(decision_logs WHERE decision_type = "claim_evaluation" AND decision = "queue_manual_review" AND created_at >= periodStart),
    claimsRejected: count(decision_logs WHERE decision_type = "claim_evaluation" AND decision = "auto_reject" AND created_at >= periodStart),
    activeListings: count(listings WHERE lifecycle_status = 'active'),
    avgQualityScore: avg(quality_scores.composite WHERE calculated_by = 'calibrated'),
    decaySignalsDetected: count(decay_signals WHERE detected_at >= periodStart),

    // Scaling & Resources
    activeContractors: countDistinct(task_specs.assigned_to WHERE status IN ('assigned', 'in_progress')),
    totalProcurementSpend: sum(task_specs.cost WHERE completed_at >= periodStart),
    scalingRecommendations: queryPendingScalingDecisions(),

    // Compliance
    openDSARs: count(compliance_register WHERE entry_type = 'dsar' AND status = 'open'),
    erasuresProcessed: count(compliance_register WHERE entry_type = 'erasure' AND status = 'completed' AND updated_at >= periodStart),
    complianceCalendarStatus: computeComplianceStatus(),
    upcomingDeadlines: queryUpcomingComplianceDeadlines(30),

    // Learning
    hypothesisUpdates: latestPerCeremony["learning_hypothesis_analysis"]?.outputs?.hypotheses
      ?? query learning_hypotheses.map(h => ({ id: h.id, finding: h.trend, action: h.confoundWarning ?? "none" })),

    // Decisions Required — ceremony escalations + pending approvals
    pendingApprovals: queryPendingApprovals(),

    // Ceremony summaries
    ceremonies: Object.fromEntries(
      latestPerCeremony.map(r => [r.ceremonyType, { status: r.status, outputs: r.outputs, decisionsLogged: r.decisionsLogged }])
    ),

    // Escalations from ceremony outcome evaluations
    escalations: {
      count: count(decision_logs WHERE decision_type = "ceremony_outcome_evaluation" AND decision = "escalate_to_principal" AND created_at >= periodStart),
      critical: query decision_logs WHERE decision_type = "ceremony_outcome_evaluation" AND decision = "escalate_to_principal" AND created_at >= periodStart,
    },
  }

  // Store briefing
  ceremonyRunId = logCeremonyRun({
    ceremonyType: "principal_briefing",
    status: "completed",
    inputsHash: hash,
    outputs: { briefingGenerated: true },
    decisionsLogged: 0,
    nextScheduledAt: addMonths(now(), 1),
  })

  briefingId = insert(principal_briefings, {
    generatedAt: now(),
    periodStart: periodStart,
    periodEnd: periodEnd,
    content: briefingContent,
    ceremonyRunId,
    sentAt: null,
  })

  // Send email — principal_briefing template, category: transactional [S9-ST-6]
  // [Source: SI §5 email transport, D6: principal_briefing template]
  await sendEmail({
    template: "principal_briefing",
    category: "transactional",
    to: getPrincipalEmail(),
    mergeFields: {
      period: briefingContent.period,
      mrr: briefingContent.mrr,
      churnRate: briefingContent.churnRate,
      activeListings: briefingContent.activeListings,
      escalationCount: briefingContent.escalations.count,
      pendingApprovals: briefingContent.pendingApprovals.length,
    },
  })

  // Mark as sent
  update(principal_briefings, { id: briefingId }, { sentAt: now() })

  scheduleDeferred("principal_briefing_generation", {}, addMonths(now(), 1))
```

---

## 4.5 Credit Confirmation Outreach

Periodic outreach to credited clients requesting verification of credit attribution. Resolves S3-5.

**Trigger:** Per credit record based on `verifiedAt` date — annual confirmation prompt. Not a ceremony (not logged in `ceremony_runs`). Implemented as per-credit scheduling within the enrichment pipeline.

**Mechanism:** When a credit's `verifiedAt` anniversary approaches (330 days post-verification), the `enrichment_full_cycle` handler for the listing schedules a `credit_confirmation_outreach` email to each credited client.

```
scheduleCreditConfirmationOutreach(listing):
  credits = query credits WHERE listing_id = listing.id AND sourcing_method = "client_confirmed"

  for credit in credits:
    daysSinceVerification = daysBetween(credit.verifiedAt, now())
    if daysSinceVerification >= 330 AND daysSinceVerification < 365:
      // Send annual confirmation request
      await sendEmail({
        template: "credit_confirmation_outreach",
        to: credit.clientEmail,
        mergeFields: {
          clientName: credit.clientName,
          providerName: listing.name,
          creditDescription: credit.description,
          confirmationLink: generateConfirmationLink(credit.id),
        },
      })
```

**Category:** `listing_status`. **Unsubscribable:** Yes.

Results feed into `evaluateVerificationUpgrade` decision architecture (S3). A confirmed response refreshes `verifiedAt`. No response after 30 days logs a decision noting the lapsed confirmation.

---

## 4.6 Enrichment Confirmation Request

Annual prompt to claimed providers confirming their listing information is still accurate. [Source: D&L CD §3 enrichment lifecycle]

**Template:** `enrichment_confirmation_request`. **Category:** `listing_status`. **Unsubscribable:** No (operational — data accuracy).

**Trigger:** Within §2's enrichment pipeline. If a claimed listing's data has not changed for >12 months (no `profile_edited` events), the `enrichment_full_cycle` handler sends a confirmation request.

```
checkEnrichmentConfirmation(listing):
  if listing.claimStatus !== "claimed": return  // only for claimed listings

  lastEdit = query max(profile_edited events WHERE listing_id = listing.id)
  if lastEdit IS NULL OR daysBetween(lastEdit, now()) > 365:
    await sendEmail({
      template: "enrichment_confirmation_request",
      to: listing.ownerEmail,
      mergeFields: {
        providerName: listing.name,
        lastUpdated: lastEdit ?? listing.claimedAt,
        dashboardLink: `/dashboard/listings/${listing.id}/edit`,
      },
    })

    // Create notification
    await createNotification({
      accountId: listing.accountId,
      type: "enrichment_confirmation_due",    // SI §8.1 — new notification type
      body: { listingId: listing.id, lastUpdated: lastEdit ?? listing.claimedAt },
    })
```

If the provider edits their listing within 30 days of receiving the request, the enrichment cycle considers the confirmation satisfied. If no response after 30 days, the next `data_health_review` ceremony flags the listing's enrichment coverage as incomplete.

---

## Acceptance Criteria

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-S9-4-01 | Every ceremony handler schedules its next run as the final step via `scheduleDeferred` (self-perpetuating pattern). No ceremony relies on external scheduling. | unit |
| AC-S9-4-02 | Duplicate ceremony run within the same scheduling period is prevented by `inputsHash` check in `checkCeremonyIdempotency`. Second invocation returns without executing. | unit |
| AC-S9-4-03 | `evaluateCeremonyOutcome` logs a `ceremony_outcome_evaluation` decision via SI §9.2 for every actionable recommendation. | integration |
| AC-S9-4-04 | `taxonomy_review_preparation` returns `{ status: "insufficient_data" }` when `listing_taxonomy_tags` is empty. Ceremony still schedules next run. | unit |
| AC-S9-4-05 | `verification_calibration_review` returns `{ status: "insufficient_data" }` when no `claim_evaluation` decision logs exist for the quarter. Ceremony still schedules next run. | unit |
| AC-S9-4-06 | `conversion_funnel_analysis` returns `{ status: "insufficient_data" }` when no `conversion_trigger_evaluation` decision logs exist for the month. Ceremony still schedules next run. | unit |
| AC-S9-4-07 | `multi_listing_pricing_evaluation` returns `{ status: "insufficient_data" }` when fewer than 20 multi-listing paid accounts exist. Ceremony still schedules next run. | unit |
| AC-S9-4-08 | `contractor_performance_review` returns `{ status: "insufficient_data" }` when no `task_specs` completed in the quarter. Ceremony still schedules next run. | unit |
| AC-S9-4-09 | `multi_listing_pricing_evaluation` checks the 20+ account threshold before any computation. Threshold check is the first operation after idempotency guard. | unit |
| AC-S9-4-10 | `principal_briefing_generation` aggregates outputs from all ceremony types that ran in the current month and stores the result in `principal_briefings` table. | integration |
| AC-S9-4-11 | `principal_briefing_generation` sends `principal_briefing` email template with `category: "transactional"` to the principal after storing the briefing. `sentAt` column updated on successful send. [S9-ST-6] | integration |
| AC-S9-4-12 | `credit_confirmation_outreach` email is sent annually for each client-confirmed credit, triggered when credit `verifiedAt` is between 330–365 days ago. | integration |
| AC-S9-4-13 | `taxonomy_promotion_evaluation` decision is logged for every promotable tag (frequency >= 20, clean mapping to existing taxonomy node) during `taxonomy_review_preparation`. | integration |
| AC-S9-4-14 | `conversion_threshold_adjustment` decision is logged when any conversion trigger has a firing rate below 5% or above 50% during `conversion_funnel_analysis`. | integration |
| AC-S9-4-15 | Every ceremony execution is logged to `ceremony_runs` table with `ceremonyType`, `status`, `inputsHash`, `outputs`, `decisionsLogged`, and `nextScheduledAt` populated. | unit |

**Total: 15 acceptance criteria.**

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §2.1 deferred actions (7 ceremony actions registered here), §5 email transport (4 templates: `decay_final_notice`, `enrichment_confirmation_request`, `credit_confirmation_outreach`, `principal_briefing`), §8 notification types (`enrichment_confirmation_due`, `ceremony_action_required`), §9.2 decision types (`taxonomy_promotion_evaluation`, `ceremony_outcome_evaluation`, `conversion_threshold_adjustment`) |
| `data-and-listings.md` (v5 interface) | §3 query interfaces consumed by ceremony handlers |
| `operations.md` (v4 interface) | §3.1 `hasActiveTicket` consumed by principal briefing, §5 learning hypotheses consumed by operational health review |
| `01-schema.md` | §2.4 `ceremony_runs` table, §2.5 `learning_hypotheses` table, §2.6 `principal_briefings` table. Authoritative for schema types. |
| `01-decisions.md` | D3 (self-perpetuating pattern), D4 (static learning hypotheses), D6 (4 templates not 5) |
| `2-concept-design/data-and-listings.md` (v6) | §5 Layer 3 ceremonies (taxonomy review, data health, verification calibration, provider outreach) |
| `2-concept-design/operations.md` (v6) | §9 Layer 3 ceremonies (operational health, contractor performance, principal briefing) + PrincipalBriefing type |
