# S9 Acceptance Criteria (Consolidated)

**Total: 94 acceptance criteria.**

## §1 Quality Scoring & Data Health (21 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-1 | `computeQualityScore` returns a `QualityScore` with all 5 dimensions summing to `composite` (0–100) | Unit |
| AC-2 | Completeness dimension scores 0 when listing has no name, no description, no location, no taxonomy tag, and no credit | Unit |
| AC-3 | Completeness dimension scores 25 (maximum) when all mandatory, important, and enriching fields are populated | Unit |
| AC-4 | Freshness dimension returns 25 for edits within 30 days, 13 at 90 days, and 2 at 180+ days | Unit |
| AC-5 | Accuracy dimension returns verification tier base minus 3 per active decay signal, floor 0 | Unit |
| AC-6 | Richness dimension applies diminishing returns (min() cap) per category and returns max 15 | Unit |
| AC-7 | Verification dimension maps directly from verification tier: unclaimed=0, claimed=5, verified=10, premium_verified=15 | Unit |
| AC-8 | Band boundary crossing from Fair to Good (composite rises from 59 to 60) triggers `evaluateQualityScoreBand` with direction "improved" | Integration |
| AC-9 | Band boundary crossing from Good to Fair (composite drops from 60 to 59) triggers `evaluateQualityScoreBand` with direction "declined" and notification includes top 3 improvement suggestions | Integration |
| AC-10 | `quality_score_changed` event payload includes `listingId`, `previousComposite`, `newComposite`, `changedDimensions` per D&L §1.8 `QualityScoreChangedEvent` | Integration |
| AC-11 | `profile_viewed` deduplication: same `viewerAccountId` + same `listingId` within 1 hour increments counter only once | Integration |
| AC-12 | `claim_abandonment_check` reverts listings with `claimStatus = "pending_review"` older than 90 days to `claimStatus = "unclaimed"` | Integration |
| AC-13 | `claim_abandonment_check` schedules `pre_claim_snapshot_cleanup` for each reverted listing | Integration |
| AC-14 | Profile strength meter returns `quality_score_explanations`-driven recommendations when `calculatedBy = "calibrated"`, falls back to S2 field-presence check when `calculatedBy = "zero_init"` | Integration |
| AC-15 | `computeTopImprovements` returns factors from the dimension with the largest gap (maxScore - currentScore) first | Unit |
| AC-16 | `logDecision("quality_score_band_evaluation", ...)` creates a `decision_logs` entry with `listingId`, `previousBand`, `newBand`, `direction`, and `algorithmVersion` on every band crossing | Integration |
| AC-17 | Nightly batch schedules `quality_score_recalculation` for every listing with `lifecycleStatus = "active"` | Integration |
| AC-18 | `calculatedBy` transitions from `"zero_init"` to `"calibrated"` on first recalculation and never reverts | Integration |
| AC-19 | Unclaimed listing with complete seed data and fresh liveness check scores band "fair" (composite 40–59); band "good" is unreachable without claiming (accuracy + verification = 0) | Unit |
| AC-20 | `quality_score_changed` event is NOT emitted when score changes within the same band (e.g., 45→48, both "fair") | Integration |
| AC-21 | `claim_abandonment_check` self-perpetuates by scheduling its next run 24 hours after completion | Integration |

## §2 Decay Detection & Enrichment (15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-22 | `detectDecay(listingId, "website")` returns `{ signalType: "website_dead", severity: "high" }` when HTTP HEAD returns 4xx/5xx, and returns `{ signalType: "domain_expired", severity: "medium" }` when DNS resolution fails. | Integration |
| AC-23 | `detectDecay(listingId, "email")` returns `{ signalType: "email_bounced" }` when MX lookup returns zero records or SMTP mailbox probe returns invalid. | Integration |
| AC-24 | `detectDecay(listingId, "ch")` returns `{ signalType: "ch_not_active", severity: "high" }` when Companies House API returns status !== "active". Returns `null` when status === "active". | Integration |
| AC-25 | `detectDecay(listingId, "social")` returns `{ signalType: "social_dead", severity: "medium" }` when any stored social profile URL returns 404 or 5xx. Returns `null` when all profiles respond 2xx/3xx. | Integration |
| AC-26 | `detectDecay(listingId, "postcode")` returns `{ signalType: "postcode_invalid", severity: "medium" }` when postcode validation returns terminated/invalid. Returns `null` for valid postcodes. | Integration |
| AC-27 | When `website_dead` and `email_bounced` signals are both active (unresolved), severity escalates to `"critical"` for whichever signal is detected second. | Unit |
| AC-28 | `evaluateDecayResponse` does not insert a new `decay_signals` row when an unresolved signal of the same type already exists for the listing. Instead, updates `checkDetails` on the existing row. | Unit |
| AC-29 | `evaluateDecayResponse` suppresses notification and does not emit `decay_signal_detected` when `hasActiveTicket` returns a non-null record for the listing. | Unit |
| AC-30 | `scheduleEnrichment` creates the correct number of `enrichment_schedules` rows per tier: 6 for paid, 6 for claimed, 3 for unclaimed (website, email, ch only). | Unit |
| AC-31 | `decay_liveness_check` handler schedules its next run after each execution at the interval matching the listing's current `cadenceTier` (self-perpetuating pattern). | Integration |
| AC-32 | `account_closed` consumer cancels all pending `decay_liveness_check` and `enrichment_full_cycle` deferred actions for the closed account's listings and deletes all `enrichment_schedules` rows for those listings. | Integration |
| AC-33 | `decay_signal_detected` event emission payload matches D&L §1.7 `DecaySignalDetectedEvent` type: `{ type, listingId, signal: { type, severity }, activeSupportTicket? }`. | Unit |
| AC-34 | Every `evaluateDecayResponse` invocation logs a decision of type `"decay_response_evaluation"` via `logDecision` (SI §9.2), including the action taken, signal details, and reason. | Unit |
| AC-35 | `enrichment_full_cycle` handler runs all applicable check types for the listing's cadence tier and schedules its next full cycle at the correct interval (quarterly/semi-annual/annual). | Integration |
| AC-36 | Every `evaluateEnrichmentCadenceAdjustment` invocation logs a decision of type `"enrichment_cadence_adjustment"` via `logDecision` (SI §9.2), including the tier, action, metrics, and reason. | Unit |

## §3 Analytics Pipeline (18 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-37 | `search_performed` event consumer writes per-listing search term frequency to `perception_aggregates` with `aggregateType = "search_terms"` and JSONB data matching `SearchTermsData` shape. | Integration |
| AC-38 | Zero-result queries (`resultCount = 0`) are written to `zero_result_queries` table and appended to the global `search_terms` aggregate `zeroResultTerms` array. | Integration |
| AC-39 | Taxonomy gap identification produces `UnmatchedTerm[]` for zero-result terms with frequency >= 3 that do not match existing taxonomy entries. Output stored in `taxonomyGaps` field of `search_terms` aggregate. | Integration |
| AC-40 | `perception_aggregates` rows with `aggregateType = "viewer_demographics"` contain JSONB data matching `ViewerDemographicsData` shape: `entityTypes[]`, `sectors[]`, `regions[]` each with `type/sector/region`, `count`, and `pct` fields. `pct` values sum to 1.0 per bucket category. | Unit |
| AC-41 | Viewer demographics aggregation consumes only deduplicated `profile_viewed` events (same viewer + same listing within 1 hour = single count). Deduplication is performed by §1 before demographics bucketing. | Integration |
| AC-42 | `computeCompetitorBenchmark` calls competitor identification using `TaxonomyTag[]` arrays (not listing IDs) and a >= 2 service area overlap threshold. [Source: D&L §3.1, S8-ST-3] | Unit |
| AC-43 | `computeCompetitorBenchmark` produces anonymised median comparison (`medianViews`, `medianEnquiries`, `medianQualityScore`) from a batch-fetched competitor set. Returns `insufficientData: true` when fewer than 3 competitors found. | Unit |
| AC-44 | Competitor benchmark engagement counters and quality scores are fetched in batch queries (`WHERE listingId IN (...)`) — not per-competitor calls to `getEngagementCounters`. | Unit |
| AC-45 | Competitor benchmark result is cached in `perception_aggregates` with `aggregateType = "competitor_benchmarking"`. Cache is valid for 7 days (`computedAt` + 7 days). Subsequent calls within TTL return cached result without recomputation. | Integration |
| AC-46 | `computeFeatureAccess(tier).competitorBenchmarking` returns `false` for free and standard tiers. Competitor benchmarking endpoint returns HTTP 403 or omits data for non-premium accounts. [Source: CR §4.1] | Integration |
| AC-47 | `computeFeatureAccess(tier).viewerDemographics` returns `false` for free and standard tiers. Viewer demographics data is not returned to non-premium accounts. [Source: CR §4.1] | Integration |
| AC-48 | `computeFeatureAccess(tier).topSearchTerms` returns `true` for standard, premium, and partner tiers. Top search terms are visible to standard+ accounts. [Source: CR §4.1] | Integration |
| AC-49 | `computeFeatureAccess(tier).enquiryResponseInsights` returns `false` for free and standard tiers. Enquiry response insights are restricted to premium and partner accounts. [Source: CR §4.1] | Integration |
| AC-50 | `perception_aggregates` rows with `aggregateType = "search_terms"` contain JSONB data matching `SearchTermsData` shape: `terms[]` with `term`, `count`, `lastSeen`; `zeroResultTerms` string array; `taxonomyGaps` `UnmatchedTerm[]`. | Unit |
| AC-51 | `perception_aggregates` rows with `aggregateType = "competitor_benchmarking"` contain JSONB data matching `CompetitorBenchmark` shape: `medianViews`, `medianEnquiries`, `medianQualityScore` (nullable), `sampleSize`, `taxonomyOverlapCount`, `insufficientData`. | Unit |
| AC-52 | `perception_aggregates` rows with `aggregateType = "enquiry_response"` contain JSONB data matching `EnquiryResponseInsights` shape: `responseRate`, `medianResponseTimeHours` (nullable), `conversionEstimate`, `totalEnquiries`, `respondedEnquiries`. | Unit |
| AC-53 | `computeEnquiryResponseInsights` computes `responseRate` as `respondedEnquiries / totalEnquiries` and `medianResponseTimeHours` from `enquiry_responded` event timestamps. Returns `medianResponseTimeHours: null` when no responses exist. | Unit |
| AC-54 | `computeTaxonomySuggestions(primarySector)` returns data-driven service area suggestions from co-occurrence analysis of `listing_taxonomy_tags`. Returns empty array when fewer than 10 listings exist in the sector. S2 onboarding flow consumes this output. | Integration |

## §4 Ceremony Automation (15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-55 | Every ceremony handler schedules its next run as the final step via `scheduleDeferred` (self-perpetuating pattern). No ceremony relies on external scheduling. | Unit |
| AC-56 | Duplicate ceremony run within the same scheduling period is prevented by `inputsHash` check in `checkCeremonyIdempotency`. Second invocation returns without executing. | Unit |
| AC-57 | `evaluateCeremonyOutcome` logs a `ceremony_outcome_evaluation` decision via SI §9.2 for every actionable recommendation. | Integration |
| AC-58 | `taxonomy_review_preparation` returns `{ status: "insufficient_data" }` when `listing_taxonomy_tags` is empty. Ceremony still schedules next run. | Unit |
| AC-59 | `verification_calibration_review` returns `{ status: "insufficient_data" }` when no `claim_evaluation` decision logs exist for the quarter. Ceremony still schedules next run. | Unit |
| AC-60 | `conversion_funnel_analysis` returns `{ status: "insufficient_data" }` when no `conversion_trigger_evaluation` decision logs exist for the month. Ceremony still schedules next run. | Unit |
| AC-61 | `multi_listing_pricing_evaluation` returns `{ status: "insufficient_data" }` when fewer than 20 multi-listing paid accounts exist. Ceremony still schedules next run. | Unit |
| AC-62 | `contractor_performance_review` returns `{ status: "insufficient_data" }` when no `task_specs` completed in the quarter. Ceremony still schedules next run. | Unit |
| AC-63 | `multi_listing_pricing_evaluation` checks the 20+ account threshold before any computation. Threshold check is the first operation after idempotency guard. | Unit |
| AC-64 | `principal_briefing_generation` aggregates outputs from all ceremony types that ran in the current month and stores the result in `principal_briefings` table. | Integration |
| AC-65 | `principal_briefing_generation` sends `principal_briefing` email template to the principal after storing the briefing. `sentAt` column updated on successful send. | Integration |
| AC-66 | `credit_confirmation_outreach` email is sent annually for each client-confirmed credit, triggered when credit `verifiedAt` is between 330–365 days ago. | Integration |
| AC-67 | `taxonomy_promotion_evaluation` decision is logged for every promotable tag (frequency >= 20, clean mapping to existing taxonomy node) during `taxonomy_review_preparation`. | Integration |
| AC-68 | `conversion_threshold_adjustment` decision is logged when any conversion trigger has a firing rate below 5% or above 50% during `conversion_funnel_analysis`. | Integration |
| AC-69 | Every ceremony execution is logged to `ceremony_runs` table with `ceremonyType`, `status`, `inputsHash`, `outputs`, `decisionsLogged`, and `nextScheduledAt` populated. | Unit |

## §5 Entity Learning & Commercial Intelligence (15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-70 | `learning_hypothesis_analysis` handler updates all 7 rows (`L1`-`L7`) in `learning_hypotheses` table with `currentValue`, `previousValue`, `trend`, and `lastMeasuredAt`. | Integration |
| AC-71 | `learning_hypothesis_analysis` sets `trend = "insufficient_data"` and `confoundWarning = "Sample size < 10"` when fewer than 10 `decision_logs` entries exist for a hypothesis's measurement query. (Pattern #15) | Unit |
| AC-72 | `proactive_churn_detection` detects `engagement_dropping` signal when a listing's profile views decline by >30% over 30 days compared to previous 30 days. | Integration |
| AC-73 | `proactive_churn_detection` detects `billing_cadence_switch_to_monthly` signal when an account switches from annual to monthly billing within the last 7 days. | Integration |
| AC-74 | `proactive_churn_detection` emits `churn_risk_detected` event with payload conforming to CR SS1.2 (`listingId`, `accountId`, `riskFactors: ChurnRiskFactor[]`, `timestamp`) when computed `overallRisk >= "medium"`. | Integration |
| AC-75 | `proactive_churn_detection` does NOT emit `churn_risk_detected` when `overallRisk === "low"`. | Unit |
| AC-76 | `proactive_churn_detection` logs decision via `logDecision("proactive_churn_detection", ...)` for every handler invocation (both signal-detected and clean-scan cases). | Integration |
| AC-77 | `conversion_funnel_analysis` computes per-gate friction ratio as `(complaints per gate) / (conversions per gate)` using Ops `getFeatureGateFrictionSummary` ticket counts and `perception_aggregates` conversion attribution. | Unit |
| AC-78 | Friction ratio exceeding 5:1 threshold triggers `logDecision("conversion_threshold_adjustment", ...)` with escalation recommendation. (CR-X-6) | Unit |
| AC-79 | `revenue_health_extended` computes all 8 S9 extension fields (`churnByTier`, `annualRenewalRate`, `ltv`, `cac`, `discountCohortDivergence`, `downgradeToPaidChurnRatio`, `averageSubscriptionLifetimeDays`, `secondaryListingChurnRate`) and writes them to `commercial_state`. | Integration |
| AC-80 | `revenue_health_extended` sets `cac = 0` (V1 placeholder — organic only, no paid acquisition). | Unit |
| AC-81 | `sponsored_placement_learning` returns `recommendation: "insufficient_data"` for both analyses when no `sponsored_placement_selection` decision logs exist. (Pattern #15) | Unit |
| AC-82 | `operational_health_review` aggregates L1-L7 hypothesis summary, support ticket trends (open/closed/avg resolution/top categories), and task completion rates into `OperationalHealthReport`. | Integration |
| AC-83 | `contractor_performance_review` returns `insufficientData: true` when no completed task_specs exist in the quarter. (Pattern #15) | Unit |
| AC-84 | `learning_hypothesis_analysis` logs ceremony run to `ceremony_runs` table with `ceremonyType = "learning_hypothesis_analysis"`, full measurement output in `outputs` JSONB, and correct `inputsHash`. | Integration |

## §6 Event Consumer Implementations (10 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-85 | All 15 consumer handlers are registered in `EVENT_CONSUMER_MATRIX` with correct consumer IDs (format `intelligence:{event}:{purpose}`), mode `async`, and matching domain. Startup registration check (SI §1.5 Layer 2) passes. | Integration |
| AC-86 | `profile_viewed` consumer deduplicates events: same `sessionId` + same `listingId` within 1 hour produces a single engagement record. Duplicate event within window produces no additional aggregation. | Unit |
| AC-87 | `account_closed` consumer cancels all pending `decay_liveness_check` and `enrichment_full_cycle` deferred actions for every listing in `event.listingsArchived`. After handler: zero pending enrichment actions remain for those listings. `enrichment_schedules` rows deleted. | Integration |
| AC-88 | `subscription_tier_changed` consumer with upgrade (`newTier` rank > `previousTier` rank) triggers `scheduleEnrichment` with `"paid"` cadence tier. | Unit |
| AC-89 | `contact_attempt` consumer with `result === "unreachable"` creates a decay signal via `evaluateDecayResponse`. `result === "reached"` produces no decay signal. | Unit |
| AC-90 | `conversion_milestone` consumer records per-gate conversion attribution using `event.milestone` as the gate identifier. `updateConversionCounts` increments the correct milestone bucket. | Unit |
| AC-91 | `decay_signal_detected` consumer calls Ops `hasActiveTicket(event.listingId)`. If active ticket: annotates the unresolved decay signal's `checkDetails` with `supportAnnotation` including `ticketId`. If no active ticket: no mutation. | Integration |
| AC-92 | `listing_created` consumer schedules both `quality_score_recalculation` deferred action and enrichment schedule creation via `scheduleEnrichment`. | Unit |
| AC-93 | All 15 consumer handlers wrap their entire body in try/catch per SI §1.3. On error: `logConsumerError` is called with correct `consumerId`, `eventType`, `mode`, and error details. No exception propagates to the emitter. | Unit |
| AC-94 | `EVENT_CONSUMER_MATRIX` contains exactly 15 new entries after S9 registration, each with `domain` matching the handler module's domain declaration and `mode: "async"`. | Integration |
