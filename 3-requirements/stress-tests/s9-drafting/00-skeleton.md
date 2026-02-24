# Slice 9: Entity Intelligence

**Status:** Draft v1
**Primary Owner:** All (D&L perception + CR intelligence + Ops learning + PP analytics pipeline)
**Last updated:** 2026-02-15
**Dependencies:** S0 (event bus, deferred action scheduler, decision logging, email transport), S1 (Listing, Account, engagement counters, quality scores, verification tiers, subscription tier), S2 (onboarding, profile strength meter, taxonomy suggestion infrastructure), S3 (claim approval event emission, verification tier data, claim evaluation decision logs), S4 (subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle), S5 (provider dashboard UI surfaces for analytics display, quality score rendering, competitor benchmarking placeholder), S7 (churn risk registry, pending cancellation registry, support ticket queries, win-back email delivery, operational decision logs), S8 (commercial state, churn analysis log, conversion triggers, sponsored placement decision logs, revenue perception V1, pricing configuration)
**Inputs:** `interfaces/shared-infrastructure.md` (v8), `interfaces/data-and-listings.md` (v5), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v6), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/data-and-listings.md` (v6), `2-concept-design/operations.md` (v6), `2-concept-design/commercial-and-revenue.md` (v4), `2-concept-design/platform-and-product.md` (v5), `2-concept-design/cross-domain-dependencies.md` (v3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-02-onboarding.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2), `slices/slice-05-provider-experience.md` (v2), `slices/slice-07-operations/index.md` (v2), `slices/slice-08-commercial/index.md` (v2)
**Downstream:** S10 (Hardening)

---

## Summary

[Phase 3 assembler will write summary]

## V1 Scope Boundary

[Phase 3 assembler will write scope boundary]

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions: 6 new tables (`enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`), 5 column amendments, 4 new pgEnums, cumulative snapshot |
| 00 | `00-router-plan.md` | 6 admin routes, 15 consumer handlers, 17 deferred action handlers, file tree |
| 01 | `01-quality-scoring.md` | §1 Quality Scoring & Data Health |
| 02 | `02-decay-enrichment.md` | §2 Decay Detection & Enrichment |
| 03 | `03-analytics-pipeline.md` | §3 Analytics Pipeline |
| 04 | `04-ceremony-automation.md` | §4 Ceremony Automation |
| 05 | `05-entity-learning.md` | §5 Entity Learning & Commercial Intelligence |
| 06 | `06-event-consumers.md` | §6 Event Consumer Implementations |

---

## §1 Quality Scoring & Data Health

[Content agent 1 will write this section.]

**Scope:** Implements calibrated quality scoring to replace S1's zero-initialised stubs. Delivers `computeQualityScore` with 5 additive dimensions (Completeness 0–25, Freshness 0–25, Accuracy 0–20, Richness 0–15, Verification 0–15) producing composite 0–100. Implements `quality_score_recalculation` deferred action handler (event-driven + nightly batch). Wires `quality_score_changed` event emission when band boundaries are crossed. Implements `profile_viewed` P2 deduplication (time-window: same viewer + same listing within 1 hour = single count). Implements `claim_abandonment_check` daily batch (pending_review >90 days reverts to unclaimed). Replaces S2's profile strength meter fallback with `quality_score_explanations`-driven improvement recommendations.

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

[Content agent 2 will write this section.]

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

[Content agent 3 will write this section.]

**Scope:** Implements the analytics aggregation pipeline that S5/S6 surfaces consume. Builds search term frequency analysis from `search_performed` events. Implements zero-result pattern detection and taxonomy gap identification. Delivers viewer demographics bucketing (entity type, sector, location distribution). Implements competitor benchmarking computation via D&L `computeTaxonomyOverlap` (anonymised median views, enquiries, scores for taxonomy-overlapping listings). Computes enquiry response insights (response rate, median response time, conversion-to-booking estimates). Resolves PP-Q5: in-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service at V1.

**Upstream flags resolved:** S1-4 (search terms + trend data), S5-3 (competitor benchmarking), S5-4 (viewer demographics), S5-5 (enquiry response insights), S5-6 (top search terms per listing), S6-3 (search analytics pipeline), S6-4 (PP-Q5 analytics tooling).

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

[Content agent 4 will write this section.]

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

[Content agent 5 will write this section.]

**Scope:** Implements entity learning feedback loops and advanced commercial intelligence. Delivers `learning_hypothesis_analysis` handler (L1–L7 measurements from decision logs, confound warnings). Implements `proactive_churn_detection` weekly scan (engagement_dropping: >30% view decline over 30 days; billing_cadence_switch_to_monthly signal — produces remaining 2/5 ChurnRiskFactor values that S8 deferred). Implements `sponsored_placement_learning` handler (quality floor hit rate, fairness cap activation frequency from decision logs). Implements conversion-denominated friction ratios (per-gate conversion attribution enabling CR-X-6 5:1 escalation threshold). Delivers `revenue_health_extended` handler extending S8's V1 `RevenuePerception` type with per-tier churn, annual renewal rate, NRR, LTV, CAC, discount cohort divergence. Implements conversion trigger threshold recommendations from funnel analysis.

**Upstream flags resolved:** S7-2/S8-2 (conversion-denominated friction ratios), S7-3 (perception wiring from decision logs), S8-1 (advanced revenue health), S8-3 (learned churn prediction), S8-5 (sponsored placement decision learning).

**Handlers/agents implemented:**
- `learning_hypothesis_analysis` deferred action handler (L1–L7)
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

[Content agent 6 will write this section.]

**Scope:** Implements all 15 new consumer handler registrations for S9's perception signal ingestion. All consumers are async. This section is authoritative for consumer handler code; §1–§5 are authoritative for the decision logic those consumers invoke. Each consumer entry specifies: event consumed, consumer ID (format `{domain}:{event}:{purpose}`), mode, handler pseudocode, cross-domain reads, and event emissions.

**Consumers (15 total):**

| Event | Consumer Domain | Mode | Invokes |
|-------|----------------|------|---------|
| `profile_edited` | D&L (S9) | async | §1 `quality_score_recalculation` trigger, freshness reset |
| `listing_created` | D&L (S9) | async | §1 initial quality score, §2 enrichment schedule |
| `claim_approved` | D&L (S9) | async | §1 quality recalculation (+5 verification), §2 enrichment at claimed cadence, §5 L2/L3 hypothesis tracking |
| `profile_viewed` | D&L (S9) | async | §3 engagement trend aggregation, §3 viewer demographics (S5-4), §1 deduplication (S1-8) |
| `search_performed` | D&L (S9) | async | §3 search term frequency, §3 zero-result detection, §3 taxonomy gap identification (S6-3) |
| `shortlist_added` | D&L (S9) | async | §1 quality calibration perception signal (S6-5) |
| `contact_attempt` | D&L (S9) | async | §2 unreachable listing detection |
| `account_closed` | D&L (S9) | async | §2 enrichment suspension (S1-11), cancel pending deferred actions |
| `subscription_tier_changed` | CR (S9) | async | §5 revenue perception update, §5 conversion trigger effectiveness |
| `subscription_ended` | CR (S9) | async | §5 churn analysis entry, §5 win-back attribution refinement |
| `conversion_milestone` | CR (S9) | async | §5 trigger effectiveness analysis, §5 per-gate conversion attribution (S8-2) |
| `enquiry_submitted` | D&L (S9) | async | §3 enquiry analytics, §1 quality signal, §4 provider outreach prioritisation |
| `enquiry_responded` | D&L (S9) | async | §3 response insights computation (S5-5), response time metrics |
| `winback_delivery_result` | CR (S9) | async | §5 win-back effectiveness learning, attribution refinement |
| `decay_signal_detected` | Ops (S9) | async | Active support ticket check annotation, duplicate outreach suppression |

**EVENT_CONSUMER_MATRIX delta:** +15 new consumer entries.

**Note on existing consumers:** Several events already have consumers registered in S1–S8. S9 adds additional consumers for perception/intelligence purposes. These are distinct handler registrations.

---

## §7 Event Consumers Registered in S9

[Phase 2/3 will populate. Aggregate table of all 15 consumers with consumer ID, mode, handler description, new/existing status.]

| Event | Consumer ID | Mode | Handler Description | New? |
|-------|------------|------|---------------------|------|
| | | | | |

**EVENT_CONSUMER_MATRIX delta:** +15 new consumer entries.

---

## §8 Deferred Actions Registered in S9

[Phase 2/3 will populate. Aggregate table of all 17 deferred actions from checklist §1.]

| Action | Params Type | Owner | Schedule | Retry | On Failure | New? |
|--------|-------------|-------|----------|-------|------------|------|
| | | | | | | |

**Total DeferredActionParamsMap entries after S9:** 34 (17 from S8/SI v8 + 17 new).

---

## §9 Email Templates Registered in S9

[Phase 2/3 will populate. Up to 5 new templates from checklist §2. Schema agent to verify S7 `listing_decay_warning` coverage.]

| Template ID | Category | Trigger | Merge Fields Populated | New? |
|-------------|----------|---------|----------------------|------|
| | | | | |

**Current count:** 26 templates (SI §5.2). After S9: up to **31** templates (pending S7 overlap resolution).

---

## §10 Notification Types Used in S9

[Phase 2/3 will populate. 5 new notification types from checklist §8.]

| Type | Trigger | New? |
|------|---------|------|
| | | |

---

## §11 Schema Additions

Full schema in `00-schema.md`. Summary placeholder:

**6 new tables:** `enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`.

**5 column amendments:** `listings.lastEnrichmentAt`, `listings.nextEnrichmentAt`, `listings.enrichmentTier`, `quality_scores.calculatedBy`, `quality_scores.algorithmVersion`.

**4 new pgEnums:** `decay_signal_type`, `decay_signal_severity`, `enrichment_check_type`, `ceremony_type`.

**Cumulative schema after S9:** 44 tables (38 from S8 + 6 new). 36 pgEnums (32 from S8 + 4 new). 34 deferred actions (17 from S8/SI v8 + 17 new). 31 email templates (26 from S8 + 5 new).

---

## §12 Upstream Flag Resolutions

S9 resolves 23 upstream flags across 6 clusters. [Source: `s9-pre-draft-checklist.md` §6]

| Flag | Source | Section | Resolution |
|------|--------|---------|-----------|
| S1-2 | S1 §13 | §1 | Quality scoring algorithms: `computeQualityScore` with 5 additive dimensions, composite 0–100. |
| S1-8 | S1 §13 | §1 | `profile_viewed` P2 deduplication: time-window check (same viewer + same listing within 1 hour). |
| S2-3 | S2 §15 | §1 | Profile strength meter: replaced fallback with `quality_score_explanations`-driven recommendations. |
| S3-7 | S3 §13 | §1 | Claim abandonment: `claim_abandonment_check` daily batch, >90 days pending_review reverts to unclaimed. |
| S5-7 | S5 §19 | §1 | Quality scoring calibration: S9 computes calibrated scores, S5 renders them. |
| S6-5 | S6 §16 | §1 | Engagement event quality signals: `profile_viewed` and `shortlist_added` as perception inputs. |
| S1-11 | S1 §13 | §2 | `account_closed` enrichment suspension: cancel pending decay/enrichment deferred actions. |
| S1-4 | S1 §13 | §3 | Search terms + trend data: aggregated from `search_performed` into `perception_aggregates`. |
| S5-3 | S5 §19 | §3 | Competitor benchmarking: anonymised comparison via `computeTaxonomyOverlap` + engagement aggregates. |
| S5-4 | S5 §19 | §3 | Viewer demographics: aggregated `profile_viewed` events by entity type, sector, location. |
| S5-5 | S5 §19 | §3 | Enquiry response insights: response rate, median response time, conversion estimates. |
| S5-6 | S5 §19 | §3 | Top search terms per listing: aggregated from `search_performed` + zero-result queries. |
| S6-3 | S6 §16 | §3 | Search analytics pipeline: term frequencies, zero-result detection, taxonomy gap identification. |
| S6-4 | S6 §16 | §3 | PP-Q5 analytics tooling: in-database aggregation via `perception_aggregates` + deferred actions. |
| S3-4 | S3 §13 | §4 | Verification calibration ceremony: quarterly `claim_evaluation` accuracy analysis from decision logs. |
| S3-5 | S3 §13 | §4 | Credit confirmation outreach: `credit_confirmation_outreach` email scheduling. |
| S8-4 | S8 §17 | §4 | Multi-listing pricing evaluation: quarterly ceremony with 20+ account threshold. |
| S2-4 | S2 §15 | §3 | Generic taxonomy suggestions: data-driven suggestions from listing sector distribution. |
| S7-2 / S8-2 | S7 §20, S8 §17 | §5 | Conversion-denominated friction ratios: per-gate conversion attribution for CR-X-6 5:1 threshold. |
| S7-3 | S7 §20 | §5 | Perception wiring from decision logs: L1–L7 hypothesis measurements + confound warnings. |
| S8-1 | S8 §17 | §5 | Advanced revenue health: per-tier churn, annual renewal rate, NRR, LTV, CAC, discount cohort divergence. |
| S8-3 | S8 §17 | §5 | Learned churn prediction: proactive `engagement_dropping` + `billing_cadence_switch_to_monthly` detection. |
| S8-5 | S8 §17 | §5 | Sponsored placement decision learning: quality floor calibration + fairness cap tuning from decision logs. |

---

## §13 Downstream Flags

[Phase 2/3 will populate. S9 may produce flags targeting S10 (Hardening) for operational tuning, threshold calibration, and monitoring infrastructure.]

| # | Flag | Target Slice | Description |
|---|------|-------------|-------------|
| | | | |

---

## §14 Open Question Resolutions

S9 resolves 1 open question. [Source: `s9-pre-draft-checklist.md` §7]

| # | Question | Resolution |
|---|----------|-----------|
| PP-Q5 | Analytics / product metrics tooling | In-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service at V1. S6 provides event emission infrastructure. S9 builds the aggregation pipeline. External tooling (PostHog, Mixpanel) deferred to post-launch operational decision. |

---

## §15 Acceptance Criteria

[Phase 2/3 will populate. Estimated ~90 AC across 6 functional areas.]

### §1 Quality Scoring & Data Health (~20 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

### §2 Decay Detection & Enrichment (~15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

### §3 Analytics Pipeline (~18 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

### §4 Ceremony Automation (~15 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

### §5 Entity Learning & Commercial Intelligence (~12 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

### §6 Event Consumer Implementations (~10 AC)

| # | Criterion | Test Type |
|---|-----------|-----------|
| | | |

**Estimated total: ~90 acceptance criteria.**

---

## §16 Stress Test Resolution Log

[Empty in v1. Populated by stress test + fix-applier skill.]

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §1 event bus + P1–P5 principles, §2 deferred actions (17 new actions), §4.1 `AuthSession` type, §5 email transport (5 new templates), §8 notification types (5 new), §9 decision logging (7 new decision types) |
| `data-and-listings.md` (v5 interface) | §1 emitted events (`decay_signal_detected` §1.7, `quality_score_changed` §1.8), §3 query interfaces (`getEngagementCounters` §3.2, `computeTaxonomyOverlap` §3.1, `getListingAnalytics` §3.x), §4 quality scoring contract |
| `commercial-and-revenue.md` (v3 interface) | §1 emitted events (`churn_risk_detected` §1.1), §4 TierLimits for premium feature gating, §5 conversion trigger types, §6 revenue perception extension |
| `operations.md` (v4 interface) | §3.1 `hasActiveTicket` query (consumed by §2 decay response), §3.4 `getFeatureGateFrictionSummary` (consumed by §5 friction ratios), §5 learning hypotheses |
| `platform-and-product.md` (v6 interface) | §1.x event payloads (consumed by §3 analytics, §6 consumers), §3.1 query interfaces, §4 email templates |
| `data-and-listings.md` (v6 concept design) | §3 quality scoring dimensions, decay detection pipeline, enrichment cadence. §5 ceremonies (taxonomy review, data health, verification calibration, provider outreach) |
| `commercial-and-revenue.md` (v4 concept design) | §3.2 multi-listing pricing evolution, §4 sponsored placement learning, §5 conversion trigger thresholds, §6 revenue perception full specification |
| `operations.md` (v6 concept design) | §8 learning hypotheses L1–L7, §9 ceremonies (operational health review, contractor performance, principal briefing) |
| `cross-domain-dependencies.md` (v3) | Event contracts, query interface contracts, cross-domain flow specifications |
| `slices/slice-00-infrastructure.md` (v2) | Event bus, deferred action scheduler (self-perpetuating pattern), decision logging framework, email transport service |
| `slices/slice-01-data-model.md` (v2) | Listing schema, Account schema, engagement counters, quality scores (zero-initialised), subscription tier, verification tier |
| `slices/slice-02-onboarding.md` (v2) | Profile strength meter (fallback implementation replaced by S9), taxonomy suggestion infrastructure |
| `slices/slice-03-claim-verify.md` (v2) | `claim_approved` event emission, verification tier data, claim evaluation decision logs |
| `slices/slice-04-subscriptions.md` (v2) | Subscription schema, Paddle subscription fields, billing cadence, subscription lifecycle |
| `slices/slice-05-provider-experience.md` (v2) | Provider dashboard UI surfaces for analytics display, quality score rendering, competitor benchmarking placeholder, viewer demographics placeholder, response insights placeholder |
| `slices/slice-07-operations/index.md` (v2) | Churn risk registry, pending cancellation registry, win-back email delivery handler, support ticket query interfaces, operational decision logs |
| `slices/slice-08-commercial/index.md` (v2) | Commercial state schema, churn analysis log, conversion triggers, sponsored placement decision logs, revenue perception V1, pricing configuration, ChurnRiskFactor (3/5 V1 values) |
