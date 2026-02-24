# Slice 9: Entity Intelligence

**Status:** Draft v2 (STRESS TESTED)
**Primary Owner:** All (D&L perception + CR intelligence + Ops learning + PP analytics pipeline)
**Last updated:** 2026-02-15
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, subscription tier), S2 (onboarding, profile strength meter, taxonomy suggestion infrastructure), S3 (claim approval event emission, verification tier data, claim evaluation decision logs), S4 (subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle), S5 (provider dashboard UI surfaces for analytics display, quality score rendering, competitor benchmarking placeholder), S7 (churn risk registry, pending cancellation registry, support ticket queries, win-back email delivery, operational decision logs), S8 (commercial state, churn analysis log, conversion triggers, sponsored placement decision logs, revenue perception V1, pricing configuration)
**Inputs:** `interfaces/shared-infrastructure.md` (v8), `interfaces/data-and-listings.md` (v5), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v6), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/data-and-listings.md` (v6), `2-concept-design/operations.md` (v6), `2-concept-design/commercial-and-revenue.md` (v4), `2-concept-design/platform-and-product.md` (v5), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-02-onboarding.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-07-operations/index.md` (v2), `slices/slice-08-commercial/index.md` (v2) [spec versions current as of S9 v2]
**Downstream:** S10 (Hardening)

---

## Summary

S9 implements the entity's perception, intelligence, and learning systems. Quality scoring replaces S1's zero-initialised stubs with calibrated 5-dimension scoring (Completeness 0-25, Freshness 0-25, Accuracy 0-20, Richness 0-15, Verification 0-15) producing composite 0-100. Decay detection and enrichment scheduling maintain listing liveness at tiered cadences (paid weekly, claimed fortnightly, unclaimed monthly). Analytics pipeline, ceremony automation, entity learning, and commercial intelligence close the Data-Intelligence-Autonomy loop by producing actionable signals from accumulated decision logs and engagement data. 101 acceptance criteria across 6 functional areas. 23 upstream flags resolved. 1 open question resolved (PP-Q5).

## V1 Scope Boundary

S9 delivers perception and intelligence infrastructure. It does NOT deliver: full autonomous decision-making (autonomy graduation is post-launch), external analytics integration (PostHog/Mixpanel deferred), real-time streaming analytics (batch aggregation only), or ML-based prediction (rule-based heuristics with threshold tuning). All ceremonies produce recommendations for principal review at V1; auto-apply is a V2 graduation target.

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions: 6 new tables (`enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`), 2 column amendments, 4 new pgEnums, cumulative snapshot |
| 00 | `00-router-plan.md` | 6 admin routes, 15 consumer handlers, 17 deferred action handlers, file tree |
| 01 | `01-quality-scoring.md` | §1 Quality Scoring & Data Health |
| 02 | `02-decay-enrichment.md` | §2 Decay Detection & Enrichment |
| 03 | `03-analytics-pipeline.md` | §3 Analytics Pipeline |
| 04 | `04-ceremony-automation.md` | §4 Ceremony Automation |
| 05 | `05-entity-learning.md` | §5 Entity Learning & Commercial Intelligence |
| 06 | `06-event-consumers.md` | §6 Event Consumer Implementations |

---

## §1 Quality Scoring & Data Health

**Content:** `01-quality-scoring.md`

**Scope:** Implements calibrated quality scoring to replace S1's zero-initialised stubs. Delivers `computeQualityScore` with 5 additive dimensions (Completeness 0-25, Freshness 0-25, Accuracy 0-20, Richness 0-15, Verification 0-15) producing composite 0-100. Implements `quality_score_recalculation` deferred action handler (event-driven + nightly batch). Wires `quality_score_changed` event emission when band boundaries are crossed. Implements `profile_viewed` P2 deduplication (time-window: same viewer + same listing within 1 hour = single count). Implements `claim_abandonment_check` daily batch (pending_review >90 days reverts to unclaimed). Replaces S2's profile strength meter fallback with `quality_score_explanations`-driven improvement recommendations.

**Upstream flags resolved:** S1-2 (quality scoring algorithms), S1-8 (profile_viewed deduplication), S2-3 (profile strength meter wiring), S3-7 (claim abandonment detection), S5-7 (quality scoring calibration), S6-5 (engagement event quality signals).

**Handlers/agents implemented:**
- `computeQualityScore(listing: Listing): QualityScore`
- `quality_score_recalculation` deferred action handler
- `claim_abandonment_check` deferred action handler
- `quality_score_band_evaluation` decision architecture
- `quality_score_changed` event emission (D&L §1.8)

**Decision types:** `quality_score_band_evaluation`.

**Concept design source:** D&L CD §3 (scoring detail), D&L interface §4.

---

## §2 Decay Detection & Enrichment

**Content:** `02-decay-enrichment.md`

**Scope:** Implements the decay detection pipeline and tiered enrichment scheduling. Delivers `detectDecay` per-check-type liveness verification (website, email, Companies House, social, postcode). Implements `evaluateDecayResponse` decision architecture (warn/outreach/suspend per severity). Implements tiered enrichment cadence: paid (weekly liveness, quarterly full cycle), claimed (fortnightly liveness, semi-annual full cycle), unclaimed (monthly liveness, annual full cycle). Self-perpetuating deferred action pattern for scheduling. Implements `account_closed` enrichment suspension (cancel pending deferred actions for archived listings). Emits `decay_signal_detected` event.

**Upstream flags resolved:** S1-11 (account_closed enrichment suspension).

**Handlers/agents implemented:**
- `decay_liveness_check` deferred action handler (5 check types)
- `enrichment_full_cycle` deferred action handler (self-perpetuating)
- `evaluateDecayResponse(signal: DecaySignal): DecayResponseDecision`
- `decay_signal_detected` event emission (D&L §1.7)
- `account_closed` consumer handler (enrichment suspension)

**Decision types:** `decay_response_evaluation`, `enrichment_cadence_adjustment`.

**Concept design source:** D&L CD §3 (decay/enrichment detail), D&L interface §1.7, Ops interface §3.1 (`hasActiveTicket`).

---

## §3 Analytics Pipeline

**Content:** `03-analytics-pipeline.md`

**Scope:** Implements the analytics aggregation pipeline that S5/S6 surfaces consume. Builds search term frequency analysis from `search_performed` events. Implements zero-result pattern detection and taxonomy gap identification. Delivers viewer demographics bucketing (entity type, sector, location distribution). Implements competitor benchmarking computation via D&L `computeTaxonomyOverlap` (anonymised median views, enquiries, scores for taxonomy-overlapping listings). Computes enquiry response insights (response rate, median response time, conversion-to-booking estimates). Resolves PP-Q5: in-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service at V1.

**Upstream flags resolved:** S1-4 (search terms + trend data), S2-4 (generic taxonomy suggestions), S5-3 (competitor benchmarking), S5-4 (viewer demographics), S5-5 (enquiry response insights), S5-6 (top search terms per listing), S6-3 (search analytics pipeline), S6-4 (PP-Q5 analytics tooling).

**Handlers/agents implemented:**
- Search term aggregation pipeline (via `search_performed` consumer)
- `computeCompetitorBenchmark(listingId, taxonomyTags): CompetitorBenchmark`
- `computeViewerDemographics(listingId, period): ViewerDemographics`
- `computeEnquiryResponseInsights(listingId): EnquiryResponseInsights`
- Zero-result detection + taxonomy gap identification
- `perception_aggregates` table write pipeline

**Decision types:** None (analytics pipeline is computation, not decision-making).

**Concept design source:** D&L CD §3 (analytics), PP interface §1.x (event payloads), PP interface §3.1, D&L interface §3 (queries), CR interface §4 (TierLimits for premium gating).

---

## §4 Ceremony Automation

**Content:** `04-ceremony-automation.md`

**Scope:** Implements all recurring ceremony handlers that produce periodic intelligence reports. Each ceremony follows the self-perpetuating deferred action pattern (handler schedules its next run as final step). Logs execution in `ceremony_runs` table. Implements: `taxonomy_review_preparation` (quarterly — free-text tag clustering + zero-result aggregation), `data_health_review` (monthly — quality score distribution, decay trends, enrichment coverage), `verification_calibration_review` (quarterly — claim_evaluation accuracy rates from decision logs), `provider_outreach_ranking` (monthly — unclaimed listing value ranking), `multi_listing_pricing_evaluation` (quarterly — 20+ account threshold, secondary churn rate, pricing ticket aggregation), `principal_briefing_generation` (monthly — PrincipalBriefing report), `credit_confirmation_outreach` scheduling.

**Upstream flags resolved:** S3-4 (verification calibration automation), S3-5 (credit confirmation outreach), S8-4 (multi-listing pricing evaluation).

**Handlers/agents implemented:**
- `taxonomy_review_preparation` deferred action handler
- `data_health_review` deferred action handler
- `verification_calibration_review` deferred action handler
- `provider_outreach_ranking` deferred action handler
- `multi_listing_pricing_evaluation` deferred action handler
- `principal_briefing_generation` deferred action handler
- `ceremony_outcome_evaluation` decision architecture (auto-apply vs escalate to principal)
- `credit_confirmation_outreach` email scheduling

**Decision types:** `taxonomy_promotion_evaluation`, `ceremony_outcome_evaluation`.

**Concept design source:** D&L/CR/Ops CD §5/§9 (ceremony definitions), Ops interface (learning hypotheses).

---

## §5 Entity Learning & Commercial Intelligence

**Content:** `05-entity-learning.md`

**Scope:** Implements entity learning feedback loops and advanced commercial intelligence. Delivers `learning_hypothesis_analysis` handler (L1-L7 measurements from decision logs, confound warnings). Implements `proactive_churn_detection` weekly scan (engagement_dropping: >30% view decline over 30 days; billing_cadence_switch_to_monthly signal — produces remaining 2/5 ChurnRiskFactor values that S8 deferred). Implements `sponsored_placement_learning` handler (quality floor hit rate, fairness cap activation frequency from decision logs). Implements conversion-denominated friction ratios (per-gate conversion attribution enabling CR-X-6 5:1 escalation threshold). Delivers `revenue_health_extended` handler extending S8's V1 `RevenuePerception` type with per-tier churn, annual renewal rate, NRR, LTV, CAC, discount cohort divergence. Implements conversion trigger threshold recommendations from funnel analysis.

**Upstream flags resolved:** S7-2/S8-2 (conversion-denominated friction ratios), S7-3 (perception wiring from decision logs), S8-1 (advanced revenue health), S8-3 (learned churn prediction), S8-5 (sponsored placement decision learning).

**Handlers/agents implemented:**
- `learning_hypothesis_analysis` deferred action handler (L1-L7)
- `proactive_churn_detection` deferred action handler (weekly)
- `sponsored_placement_learning` deferred action handler (monthly)
- `conversion_funnel_analysis` deferred action handler (monthly)
- `revenue_health_extended` deferred action handler (monthly)
- `operational_health_review` deferred action handler (monthly)
- `contractor_performance_review` deferred action handler (quarterly)
- Per-gate conversion attribution computation
- `churn_risk_detected` proactive emission (CR §1.1)

**Decision types:** `proactive_churn_detection`, `conversion_threshold_adjustment`.

**Concept design source:** CR CD §6 (revenue thresholds), CR interface §5, Ops interface §3.4 (friction), Ops CD §8/§9 (learning hypotheses), S8 schema (commercial_state, churn_analysis_log).

---

## §6 Event Consumer Implementations

**Content:** `06-event-consumers.md`

**Scope:** Implements all 15 new consumer handler registrations for S9's perception signal ingestion. All consumers are async. This section is authoritative for consumer handler code; §1-§5 are authoritative for the decision logic those consumers invoke. Each consumer entry specifies: event consumed, consumer ID (format `{domain}:{event}:{purpose}`), mode, handler pseudocode, cross-domain reads, and event emissions.

---

## §7 Event Consumers Registered in S9

15 new async consumer handlers registered in `EVENT_CONSUMER_MATRIX`. All follow SI §1.5 error capture (try/catch wrapping, structured `EventConsumerError` logging, no exception propagation).

| Event | Consumer ID | Mode | Handler Description | New? |
|-------|------------|------|---------------------|------|
| `profile_edited` | `intelligence:profile_edited:qualityRecalc` | async | Schedules `quality_score_recalculation` deferred action, resets freshness timestamp | Yes |
| `listing_created` | `intelligence:listing_created:initialQuality` | async | Schedules initial quality score computation, creates enrichment schedule at unclaimed cadence | Yes |
| `claim_approved` | `intelligence:claim_approved:qualityUpgrade` | async | Schedules quality recalc (+5 verification), upgrades enrichment to claimed cadence, updates L2/L3 hypothesis tracking | Yes |
| `profile_viewed` | `intelligence:profile_viewed:engagement` | async | P2 deduplication (1-hour window), engagement trend aggregation, viewer demographics bucketing | Yes |
| `search_performed` | `intelligence:search_performed:searchAnalytics` | async | Search term frequency aggregation, zero-result detection, taxonomy gap identification | Yes |
| `shortlist_added` | `intelligence:shortlist_added:qualitySignal` | async | Records shortlist as positive perception signal for quality calibration (richness/engagement weighting) | Yes |
| `contact_attempt` | `intelligence:contact_attempt:unreachableDetection` | async | Creates decay signal via `evaluateDecayResponse` when `result === "unreachable"`. No-op on `"reached"` | Yes |
| `account_closed` | `intelligence:account_closed:enrichmentSuspension` | async | Cancels all pending `decay_liveness_check` and `enrichment_full_cycle` deferred actions, deletes `enrichment_schedules` rows | Yes |
| `subscription_tier_changed` | `intelligence:subscription_tier_changed:revenuePerception` | async | Logs revenue perception signal, tracks conversion trigger effectiveness, upgrades enrichment cadence on tier upgrade | Yes |
| `subscription_ended` | `intelligence:subscription_ended:churnAnalysis` | async | Records churn analysis entry, refines win-back attribution window for Paddle-originated endings | Yes |
| `conversion_milestone` | `intelligence:conversion_milestone:attribution` | async | Records per-gate conversion attribution using `event.milestone`, increments conversion counts for friction ratio computation | Yes |
| `enquiry_submitted` | `intelligence:enquiry_submitted:enquiryAnalytics` | async | Updates enquiry analytics aggregation, records enquiry as quality calibration signal, updates provider outreach prioritisation | Yes |
| `enquiry_responded` | `intelligence:enquiry_responded:responseInsights` | async | Computes and updates response insights (response rate, median response time) in `perception_aggregates` | Yes |
| `winback_delivery_result` | `intelligence:winback_delivery_result:effectiveness` | async | Records win-back delivery outcome (delivered/failed) for effectiveness learning and attribution refinement | Yes |
| `decay_signal_detected` | `intelligence:decay_signal_detected:supportCheck` | async | Calls Ops `hasActiveTicket`. If active ticket: annotates decay signal's `checkDetails` with `supportAnnotation`. If none: no mutation | Yes |

**EVENT_CONSUMER_MATRIX delta:** +15 new consumer entries. Consumer domain breakdown: 10 D&L, 4 CR, 1 Ops. All async. Cross-domain reads: 1 consumer (`decay_signal_detected` calls Ops `hasActiveTicket` §3.1).

---

## §8 Deferred Actions Registered in S9

17 new deferred action handlers. All use the self-perpetuating pattern where applicable (handler schedules its next run as final step). [Source: `00-router-plan.md` §3, SI §2.1]

| Action | Params Type | Owner | Schedule | Retry | On Failure | New? |
|--------|-------------|-------|----------|-------|------------|------|
| `quality_score_recalculation` | `{ listingId: UUID }` | D&L | Event-driven + nightly batch | `retry_3` | `log` | Yes |
| `decay_liveness_check` | `{ listingId: UUID, checkType: EnrichmentCheckType }` | D&L | Per enrichment cadence. Self-perpetuating. | `retry_3` | `log` | Yes |
| `enrichment_full_cycle` | `{ listingId: UUID }` | D&L | Per enrichment cadence. Self-perpetuating. | `retry_3` | `alert_principal` | Yes |
| `claim_abandonment_check` | `Record<string, never>` | D&L | Daily batch | `once` | `log` | Yes |
| `taxonomy_review_preparation` | `Record<string, never>` | D&L | Quarterly. Self-perpetuating. | `once` | `log` | Yes |
| `data_health_review` | `Record<string, never>` | D&L | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `verification_calibration_review` | `Record<string, never>` | D&L | Quarterly. Self-perpetuating. | `once` | `log` | Yes |
| `provider_outreach_ranking` | `Record<string, never>` | D&L | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `conversion_funnel_analysis` | `Record<string, never>` | CR | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `revenue_health_extended` | `Record<string, never>` | CR | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `multi_listing_pricing_evaluation` | `Record<string, never>` | CR | Quarterly. 20+ account threshold. Self-perpetuating. | `once` | `log` | Yes |
| `sponsored_placement_learning` | `Record<string, never>` | CR | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `operational_health_review` | `Record<string, never>` | Ops | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `contractor_performance_review` | `Record<string, never>` | Ops | Quarterly. Self-perpetuating. | `once` | `log` | Yes |
| `principal_briefing_generation` | `Record<string, never>` | Ops | Monthly. Self-perpetuating. | `once` | `log` | Yes |
| `proactive_churn_detection` | `Record<string, never>` | CR | Weekly. Self-perpetuating. | `retry_3` | `log` | Yes |
| `learning_hypothesis_analysis` | `Record<string, never>` | Ops | Monthly. Self-perpetuating. | `once` | `log` | Yes |

**Total DeferredActionParamsMap entries after S9:** 34 (17 from S8/SI v8 + 17 new).

---

## §9 Email Templates Registered in S9

4 new email templates registered in S9. [Source: `00-schema.md` §8 D6 — template overlap resolution reduced from 5 to 4; S7's `listing_decay_warning` covers initial decay warning]

| Template ID | Category | Trigger | Merge Fields Populated | New? |
|-------------|----------|---------|----------------------|------|
| `decay_final_notice` | `transactional` | Unresolved high/critical decay signal >90 days (via `data_health_review` ceremony) | `listingName`, `signalType`, `detectedAt`, `daysUnresolved`, `resolutionDeadline`, `listingUrl` | Yes |
| `enrichment_confirmation_request` | `listing_status` | Claimed listing with no `profile_edited` events for >12 months (via `enrichment_full_cycle`) | `providerName`, `lastUpdated`, `dashboardLink` | Yes |
| `credit_confirmation_outreach` | `listing_status` | Credit `verifiedAt` between 330-365 days ago (via enrichment pipeline) | `clientName`, `providerName`, `creditDescription`, `confirmationLink` | Yes |
| `principal_briefing` | `transactional` | Monthly `principal_briefing_generation` ceremony completion | `period`, `mrr`, `churnRate`, `activeListings`, `escalationCount`, `pendingApprovals` | Yes |

**Current count:** 26 templates (SI §5.2). After S9: **30** templates.

---

## §10 Notification Types Used in S9

2 new notification types registered in S9. [Source: `00-schema.md` §8 D7 — notification type overlap resolution reduced from 5 to 2; existing `quality_score_changed` and `decay_warning` types reused]

| Type | Trigger | New? |
|------|---------|------|
| `enrichment_confirmation_due` | Claimed listing with no edits for >12 months; sent alongside `enrichment_confirmation_request` email | Yes |
| `ceremony_action_required` | Ceremony `evaluateCeremonyOutcome` produces an escalation requiring principal review | Yes |

**Reused notification types:** `quality_score_changed` (band crossing notifications, §1), `decay_warning` (decay signal notifications, §2).

**Current count:** 17 notification types (S8). After S9: **19** notification types.

---

## §11 Schema Additions

Full schema in `00-schema.md`. Summary:

**6 new tables:** `enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`.

**2 column amendments:** `quality_scores.calculatedBy` (text, default `"zero_init"`), `quality_scores.algorithmVersion` (integer, default 1).

**4 new pgEnums:** `decay_signal_type`, `decay_signal_severity`, `enrichment_check_type`, `ceremony_type`.

**Cumulative schema after S9:** 45 tables (39 from S8 + 6 new). 36 pgEnums (32 from S8 + 4 new). 34 deferred actions (17 from S8/SI v8 + 17 new). 30 email templates (26 from S8 + 4 new). 19 notification types (17 from S8 + 2 new). 26 decision types (19 from S8 + 7 new).

---

## §12 Upstream Flag Resolutions

S9 resolves 23 upstream flags across 6 clusters. [Source: `s9-pre-draft-checklist.md` §6]

| Flag | Source | Section | Resolution |
|------|--------|---------|-----------|
| S1-2 | S1 §13 | §1 | Quality scoring algorithms: `computeQualityScore` with 5 additive dimensions, composite 0-100. |
| S1-8 | S1 §13 | §1 | `profile_viewed` P2 deduplication: time-window check (same viewer + same listing within 1 hour). |
| S2-3 | S2 §15 | §1 | Profile strength meter: replaced fallback with `quality_score_explanations`-driven recommendations. |
| S3-7 | S3 §13 | §1 | Claim abandonment: `claim_abandonment_check` daily batch, >90 days pending_review reverts to unclaimed. |
| S5-7 | S5 §19 | §1 | Quality scoring calibration: S9 computes calibrated scores, S5 renders them. |
| S6-5 | S6 §16 | §1 | Engagement event quality signals: `profile_viewed` and `shortlist_added` as perception inputs. |
| S1-11 | S1 §13 | §2 | `account_closed` enrichment suspension: cancel pending decay/enrichment deferred actions. |
| S1-4 | S1 §13 | §3 | Search terms + trend data: aggregated from `search_performed` into `perception_aggregates`. |
| S2-4 | S2 §15 | §3 | Generic taxonomy suggestions: data-driven suggestions from listing sector distribution. |
| S5-3 | S5 §19 | §3 | Competitor benchmarking: anonymised comparison via `computeTaxonomyOverlap` + engagement aggregates. |
| S5-4 | S5 §19 | §3 | Viewer demographics: aggregated `profile_viewed` events by entity type, sector, location. |
| S5-5 | S5 §19 | §3 | Enquiry response insights: response rate, median response time, conversion estimates. |
| S5-6 | S5 §19 | §3 | Top search terms per listing: aggregated from `search_performed` + zero-result queries. |
| S6-3 | S6 §16 | §3 | Search analytics pipeline: term frequencies, zero-result detection, taxonomy gap identification. |
| S6-4 | S6 §16 | §3 | PP-Q5 analytics tooling: in-database aggregation via `perception_aggregates` + deferred actions. |
| S3-4 | S3 §13 | §4 | Verification calibration ceremony: quarterly `claim_evaluation` accuracy analysis from decision logs. |
| S3-5 | S3 §13 | §4 | Credit confirmation outreach: `credit_confirmation_outreach` email scheduling. |
| S8-4 | S8 §17 | §4 | Multi-listing pricing evaluation: quarterly ceremony with 20+ account threshold. |
| S7-2 / S8-2 | S7 §20, S8 §17 | §5 | Conversion-denominated friction ratios: per-gate conversion attribution for CR-X-6 5:1 threshold. |
| S7-3 | S7 §20 | §5 | Perception wiring from decision logs: L1-L7 hypothesis measurements + confound warnings. |
| S8-1 | S8 §17 | §5 | Advanced revenue health: per-tier churn, annual renewal rate, NRR, LTV, CAC, discount cohort divergence. |
| S8-3 | S8 §17 | §5 | Learned churn prediction: proactive `engagement_dropping` + `billing_cadence_switch_to_monthly` detection. |
| S8-5 | S8 §17 | §5 | Sponsored placement decision learning: quality floor calibration + fairness cap tuning from decision logs. |

---

## §13 Downstream Flags

S9 produces 3 downstream flags targeting S10 (Hardening).

| # | Flag | Target Slice | Description |
|---|------|-------------|-------------|
| S9-1 | Enrichment cadence auto-adjustment | S10 | `enrichment_cadence_adjustment` decisions are logged but require principal review at V1. S10 implements auto-application with governance bounds after graduation criteria met. |
| S9-2 | Ceremony auto-apply graduation | S10 | `ceremony_outcome_evaluation` decisions with `disposition: "auto_apply"` are not auto-applied at V1 (all escalate). S10 implements graduated auto-apply for precedented, non-financial, non-user-visible recommendations. |
| S9-3 | Quality score algorithm versioning | S10 | `algorithmVersion` field enables A/B testing of scoring formula changes. S10 implements controlled rollout of algorithm updates with rollback capability. |

---

## §14 Open Question Resolutions

S9 resolves 1 open question. [Source: `s9-pre-draft-checklist.md` §7]

| # | Question | Resolution |
|---|----------|-----------|
| PP-Q5 | Analytics / product metrics tooling | In-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service at V1. S6 provides event emission infrastructure. S9 builds the aggregation pipeline. External tooling (PostHog, Mixpanel) deferred to post-launch operational decision. |

---

## §15 Acceptance Criteria

**Total: 101 acceptance criteria across 6 functional areas.**

### §1 Quality Scoring & Data Health (21 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-1 | `computeQualityScore` returns a `QualityScore` with all 5 dimensions summing to `composite` (0-100) | Unit |
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
| AC-19 | Unclaimed listing with complete seed data and fresh liveness check scores band "fair" (composite 40-59); band "good" is unreachable without claiming (accuracy + verification = 0) | Unit |
| AC-20 | `quality_score_changed` event is NOT emitted when score changes within the same band (e.g., 45->48, both "fair") | Integration |
| AC-21 | `claim_abandonment_check` self-perpetuates by scheduling its next run 24 hours after completion | Integration |

### §2 Decay Detection & Enrichment (15 AC)

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

### §3 Analytics Pipeline (18 AC)

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

### §4 Ceremony Automation (15 AC)

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
| AC-65 | `principal_briefing_generation` sends `principal_briefing` email template with `category: "transactional"` to the principal after storing the briefing. `sentAt` column updated on successful send. [S9-ST-6] | Integration |
| AC-66 | `credit_confirmation_outreach` email is sent annually for each client-confirmed credit, triggered when credit `verifiedAt` is between 330-365 days ago. | Integration |
| AC-67 | `taxonomy_promotion_evaluation` decision is logged for every promotable tag (frequency >= 20, clean mapping to existing taxonomy node) during `taxonomy_review_preparation`. | Integration |
| AC-68 | `conversion_threshold_adjustment` decision is logged when any conversion trigger has a firing rate below 5% or above 50% during `conversion_funnel_analysis`. | Integration |
| AC-69 | Every ceremony execution is logged to `ceremony_runs` table with `ceremonyType`, `status`, `inputsHash`, `outputs`, `decisionsLogged`, and `nextScheduledAt` populated. | Unit |

### §5 Entity Learning & Commercial Intelligence (15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-70 | `learning_hypothesis_analysis` handler updates all 7 rows (`L1`-`L7`) in `learning_hypotheses` table with `currentValue`, `previousValue`, `trend`, and `lastMeasuredAt`. | Integration |
| AC-71 | `learning_hypothesis_analysis` sets `trend = "insufficient_data"` and `confoundWarning = "Sample size < 10"` when fewer than 10 `decision_logs` entries exist for a hypothesis's measurement query. (Pattern #15) | Unit |
| AC-72 | `proactive_churn_detection` detects `engagement_dropping` signal when a listing's profile views decline by >30% over 30 days compared to previous 30 days. | Integration |
| AC-73 | `proactive_churn_detection` detects `billing_cadence_switch_to_monthly` signal when an account switches from annual to monthly billing within the last 7 days. | Integration |
| AC-74 | `proactive_churn_detection` emits `churn_risk_detected` event with payload conforming to CR §1.2 (`listingId`, `accountId`, `riskFactors: ChurnRiskFactor[]`, `timestamp`) when computed `overallRisk >= "medium"`. | Integration |
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

### §6 Event Consumer Implementations (17 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| AC-85 | All 15 consumer handlers are registered in `EVENT_CONSUMER_MATRIX` with correct consumer IDs (format `intelligence:{event}:{purpose}`), mode `async`, and matching domain. Startup registration check (SI §1.5 Layer 2) passes. | Integration |
| AC-86 | `profile_viewed` consumer deduplicates events: same `viewerAccountId` + same `listingId` within 1 hour produces a single engagement record. Duplicate event within window produces no additional aggregation. [S9-ST-2] | Unit |
| AC-87 | `account_closed` consumer cancels all pending `decay_liveness_check` and `enrichment_full_cycle` deferred actions for every listing in `event.listingsArchived`. After handler: zero pending enrichment actions remain for those listings. `enrichment_schedules` rows deleted. | Integration |
| AC-88 | `subscription_tier_changed` consumer with upgrade (`newTier` rank > `previousTier` rank) triggers `scheduleEnrichment` with `"paid"` cadence tier. | Unit |
| AC-89 | `contact_attempt` consumer with `result === "unreachable"` creates a decay signal via `evaluateDecayResponse`. `result === "reached"` produces no decay signal. | Unit |
| AC-90 | `conversion_milestone` consumer records per-gate conversion attribution by correlating `event.milestone` with the most recent `conversion_trigger_evaluation` decision log for the listing. `updateConversionCounts` increments the correct trigger-type bucket. [S9-ST-7] | Unit |
| AC-91 | `decay_signal_detected` consumer calls Ops `hasActiveTicket(event.listingId)`. If active ticket: annotates the unresolved decay signal's `checkDetails` with `supportAnnotation` including `ticketId`. If no active ticket: no mutation. | Integration |
| AC-92 | `listing_created` consumer schedules both `quality_score_recalculation` deferred action and enrichment schedule creation via `scheduleEnrichment`. | Unit |
| AC-93 | All 15 consumer handlers wrap their entire body in try/catch per SI §1.3. On error: `logConsumerError` is called with correct `consumerId`, `eventType`, `mode`, and error details. No exception propagates to the emitter. | Unit |
| AC-94 | `EVENT_CONSUMER_MATRIX` contains exactly 15 new entries after S9 registration, each with `domain` matching the handler module's domain declaration and `mode: "async"`. | Integration |
| AC-95 | `profile_edited` consumer schedules `quality_score_recalculation` deferred action with `{ listingId: event.listingId }` and resets freshness dimension timestamp. | Unit |
| AC-96 | `claim_approved` consumer schedules `quality_score_recalculation` (verification dimension +5), updates enrichment schedule to claimed cadence, and records L2/L3 hypothesis tracking entry. | Unit |
| AC-97 | `shortlist_added` consumer records quality calibration perception signal for `event.listingId` in `perception_aggregates`. | Unit |
| AC-98 | `subscription_ended` consumer creates `churn_analysis_log` entry with `event.reason`, `event.origin`, and `event.previousTier` for ALL origins (paddle, archival, closure). Branches on `event.origin === "paddle"` for win-back attribution refinement only. Does NOT schedule win-back (S8 handles win-back scheduling). [S9-ST-8] | Unit |
| AC-99 | `winback_delivery_result` consumer updates win-back effectiveness tracking: records `event.status` against the original `winback_eligible` event's `listingId` for attribution refinement. | Unit |
| AC-100 | `enquiry_submitted` consumer invokes `aggregateEnquiryAnalytics`, `recordQualityCalibrationSignal`, and `updateProviderOutreachPrioritisation` with correct `listingId` from event payload. | Unit |
| AC-101 | `enquiry_responded` consumer computes response time delta (`respondedAt - enquiry.createdAt`) and updates `perception_aggregates` with `aggregateType = "enquiry_response"`. Returns without error when enquiry record not found (orphan response). | Unit |

---

## §16 Stress Test Resolution Log (v2)

19 scenarios targeting S9's implementation delta against upstream interface specs (SI v8, D&L v5, Ops v4, PP v6, CR v3), prior slices (S0-S8), and concept design (D&L v6, Ops v6, CR v4, PP v5). 4 High, 8 Medium, 1 Low, 6 Pass. 13 fixes applied.

Full analysis: `stress-tests/s9-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S9-ST-1 | Three-part sync: 17 new deferred actions missing from SI §2.1/§2.2 | **High** | Sibling spec fix: +17 DeferredActionParamsMap entries and +17 registered action rows to SI §2.1/§2.2. |
| S9-ST-2 | `profile_viewed` dedup uses fields absent from `ProfileViewedEvent` payload | **High** | Slice: replaced `sessionId` with `viewerAccountId` in §6.1.4. AC-86 corrected. Sibling: PP §1.2 adds `viewerAccountId?: UUID`, D&L §2 adds `viewerAccountId`. |
| S9-ST-3 | 7 new decision types missing from SI §9.2 registry | **High** | Sibling spec fix: +7 decision type entries to SI §9.2. |
| S9-ST-4 | 4 new email templates missing from SI §5.2 registry | **High** | Sibling spec fix: +4 template entries to SI §5.2, count 26->30. |
| S9-ST-5 | `multi_listing_pricing_evaluation` SQL references `"professional"` tier | **Medium** | Replaced `'professional'` with `'partner'` in §4 SQL predicate. |
| S9-ST-6 | `principal_briefing` email category `"internal"` not in `EmailCategory` | **Medium** | Changed category to `"transactional"` in §4 and §9 template table. AC-65 amended. |
| S9-ST-7 | `conversion_milestone` gate attribution uses wrong identifiers | **Medium** | Replaced `event.metadata?.triggerGate` with decision log correlation in §5.4.3 and §6.2.3. AC-90 amended. |
| S9-ST-8 | `subscription_ended` consumer does not branch on `event.origin` (P3) | **Medium** | Added P3 rationale comment in §6.2.2 documenting all-origin recording. AC-98 amended. |
| S9-ST-9 | `decay_signal_severity` pgEnum missing `"low"` value | **Medium** | Added `"low"` to pgEnum in 00-schema.md §1. Added `"low"` branch to §2.2 flowchart and pseudocode. |
| S9-ST-10 | `account_closed` enrichment suspension: §2.6 vs §6.1.8 contradiction (Pattern #14) | **Medium** | Replaced DB query in §2.6 with P1-compliant `event.listingsArchived`. |
| S9-ST-11 | `decay_signal_detected` event `signal.type` naming ambiguity | **Medium** | Added naming disambiguation note after emission pseudocode in §2.2. |
| S9-ST-12 | `decay_final_notice` email category/unsubscribe conflict | **Medium** | Changed category from `"listing_status"` to `"transactional"` in §2.7 and §9 template table. |
| S9-ST-13 | `OperationalHealthReport` type mismatch between §4 and §5 | **Low** | Replaced §4 type definition with reference to §5 (authoritative). Added note to §4 pseudocode. |
| S9-ST-14 | `churn_risk_detected` emission P1 compliance | **Pass** | Correct. No fix needed. |
| S9-ST-15 | 2 new notification types not yet in SI §8.1 | **Pass** | Correct. No fix needed. |
| S9-ST-16 | `decay_signal_detected` consumer `hasActiveTicket` return type | **Pass** | Correct. No fix needed. |
| S9-ST-17 | Downstream flags S9-1, S9-2, S9-3 accuracy audit | **Pass** | Correct. No fix needed. |
| S9-ST-18 | `computeCompetitorBenchmark` S8-ST-3 compliance | **Pass** | Correct. No fix needed. |
| S9-ST-19 | `quality_score_changed` event P1 payload conformance | **Pass** | Correct. No fix needed. |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §1 event bus + P1-P5 principles, §2 deferred actions (17 new actions), §4.1 `AuthSession` type, §5 email transport (4 new templates), §8 notification types (2 new), §9 decision logging (7 new decision types) |
| `data-and-listings.md` (v5 interface) | §1 emitted events (`decay_signal_detected` §1.7, `quality_score_changed` §1.8), §3 query interfaces (`getEngagementCounters` §3.2, `computeTaxonomyOverlap` §3.1, `getListingAnalytics` §3.x), §4 quality scoring contract |
| `commercial-and-revenue.md` (v3 interface) | §1 emitted events (`churn_risk_detected` §1.1), §4 TierLimits for premium feature gating, §5 conversion trigger types, §6 revenue perception extension |
| `operations.md` (v4 interface) | §3.1 `hasActiveTicket` query (consumed by §2 decay response), §3.4 `getFeatureGateFrictionSummary` (consumed by §5 friction ratios), §5 learning hypotheses |
| `platform-and-product.md` (v6 interface) | §1.x event payloads (consumed by §3 analytics, §6 consumers), §3.1 query interfaces, §4 email templates |
| `data-and-listings.md` (v6 concept design) | §3 quality scoring dimensions, decay detection pipeline, enrichment cadence. §5 ceremonies (taxonomy review, data health, verification calibration, provider outreach) |
| `commercial-and-revenue.md` (v4 concept design) | §3.2 multi-listing pricing evolution, §4 sponsored placement learning, §5 conversion trigger thresholds, §6 revenue perception full specification |
| `operations.md` (v6 concept design) | §8 learning hypotheses L1-L7, §9 ceremonies (operational health review, contractor performance, principal briefing) |
| `cross-domain-dependencies.md` (v3) | Event contracts, query interface contracts, cross-domain flow specifications |
| `slices/slice-00-infrastructure.md` (v2) | Event bus, deferred action scheduler (self-perpetuating pattern), decision logging framework, email transport service |
| `slices/slice-01-data-model.md` (v2) | Listing schema, Account schema, engagement counters, quality scores (zero-initialised), subscription tier, verification tier |
| `slices/slice-02-onboarding.md` (v2) | Profile strength meter (fallback implementation replaced by S9), taxonomy suggestion infrastructure |
| `slices/slice-03-claim-verify.md` (v2) | `claim_approved` event emission, verification tier data, claim evaluation decision logs |
| `slices/slice-04-subscriptions.md` (v2) | Subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle |
| `slices/slice-05-provider-experience.md` (v2) | Provider dashboard UI surfaces for analytics display, quality score rendering, competitor benchmarking placeholder, viewer demographics placeholder, response insights placeholder |
| `slices/slice-07-operations/index.md` (v2) | Churn risk registry, pending cancellation registry, win-back email delivery handler, support ticket query interfaces, operational decision logs |
| `slices/slice-08-commercial/index.md` (v2) | Commercial state schema, churn analysis log, conversion triggers, sponsored placement decision logs, revenue perception V1, pricing configuration, ChurnRiskFactor (3/5 V1 values) |
