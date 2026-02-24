<!-- Part of slice-09-entity-intelligence v2 -->

# Slice 9: Entity Intelligence — Router Plan

## 1. File Tree

S9 is a backend-only slice. No user-facing pages. All routes are admin-facing queries. The bulk of S9's logic lives in deferred action handlers (17), event consumer handlers (15), and domain-internal decision architectures.

```
src/server/routers/admin/
└── intelligence.ts                        # tRPC router (6 query-only routes)

src/server/intelligence/
├── quality-scoring.ts                     # computeQualityScore, band evaluation, claim abandonment (§1)
├── decay-detection.ts                     # detectDecay, evaluateDecayResponse, enrichment scheduling (§2)
├── analytics-pipeline.ts                  # aggregation pipelines, competitor benchmarking, demographics (§3)
├── ceremony-handlers.ts                   # all 12 ceremony implementations (§4)
├── entity-learning.ts                     # L1-L7 hypothesis analysis, proactive churn, sponsored learning (§5)
└── commercial-intel.ts                    # revenue health extended, conversion attribution, funnel analysis (§5)

src/server/actions/intelligence/
├── quality-score-recalculation.ts         # Deferred action: quality score computation
├── decay-liveness-check.ts                # Deferred action: per-check-type liveness verification
├── enrichment-full-cycle.ts               # Deferred action: full enrichment cycle (self-perpetuating)
├── claim-abandonment-check.ts             # Deferred action: daily batch >90 days pending_review
├── taxonomy-review-preparation.ts         # Deferred action: quarterly ceremony
├── data-health-review.ts                  # Deferred action: monthly ceremony
├── verification-calibration-review.ts     # Deferred action: quarterly ceremony
├── provider-outreach-ranking.ts           # Deferred action: monthly ceremony
├── conversion-funnel-analysis.ts          # Deferred action: monthly ceremony (CR)
├── revenue-health-extended.ts             # Deferred action: monthly ceremony (CR)
├── multi-listing-pricing-evaluation.ts    # Deferred action: quarterly ceremony (CR)
├── sponsored-placement-learning.ts        # Deferred action: monthly ceremony (CR)
├── operational-health-review.ts           # Deferred action: monthly ceremony (Ops)
├── contractor-performance-review.ts       # Deferred action: quarterly ceremony (Ops)
├── principal-briefing-generation.ts       # Deferred action: monthly ceremony (Ops)
├── proactive-churn-detection.ts           # Deferred action: weekly scan (CR)
└── learning-hypothesis-analysis.ts        # Deferred action: monthly L1-L7 measurement (Ops)

src/server/consumers/intelligence/
├── profile-edited.ts                      # Trigger quality score recalc, freshness reset
├── listing-created.ts                     # Initial quality score, enrichment schedule
├── claim-approved.ts                      # Quality recalc (+5 verification), enrichment at claimed cadence, L2/L3 hypothesis tracking
├── profile-viewed.ts                      # Engagement trend aggregation, viewer demographics, deduplication
├── search-performed.ts                    # Search term frequency, zero-result detection, taxonomy gap identification
├── shortlist-added.ts                     # Quality calibration perception signal
├── contact-attempt.ts                     # Unreachable listing detection
├── account-closed.ts                      # Enrichment suspension, cancel pending deferred actions
├── subscription-tier-changed.ts           # Revenue perception update, conversion trigger effectiveness (CR)
├── subscription-ended.ts                  # Churn analysis entry, win-back attribution refinement (CR)
├── conversion-milestone.ts                # Trigger effectiveness, per-gate conversion attribution (CR)
├── enquiry-submitted.ts                   # Enquiry analytics, quality signal, provider outreach prioritisation
├── enquiry-responded.ts                   # Response insights, response time metrics
├── winback-delivery-result.ts             # Win-back effectiveness learning, attribution refinement (CR)
└── decay-signal-detected.ts               # Active support ticket check annotation, duplicate outreach suppression (Ops)

src/db/schema/intelligence.ts              # 6 new tables
```

**Backend-only sections (no dedicated admin pages):**

| Section | Why No Route | Where Logic Lives |
|---------|-------------|-------------------|
| §1 Quality Scoring | Deferred-action-driven + event-driven. Quality scores surface in existing provider dashboard (S5). | `src/server/intelligence/quality-scoring.ts` + `src/server/actions/intelligence/quality-score-recalculation.ts` |
| §2 Decay Detection | Deferred-action-driven. Decay signals trigger email + support tickets (S7). | `src/server/intelligence/decay-detection.ts` + `src/server/actions/intelligence/decay-liveness-check.ts` + `enrichment-full-cycle.ts` |
| §3 Analytics Pipeline | Event-driven aggregation. Analytics surface in provider dashboard (S5). | `src/server/intelligence/analytics-pipeline.ts` — imported by consumers |
| §4 Ceremony Automation | Deferred-action-driven. 12 ceremony outputs surface in admin intelligence routes. | `src/server/intelligence/ceremony-handlers.ts` + 7 deferred action handlers |
| §5 Entity Learning | Deferred-action-driven + monthly ceremonies. Outputs surface in admin intelligence routes. | `src/server/intelligence/entity-learning.ts` + `commercial-intel.ts` + 5 deferred action handlers |
| §6 Event Consumers | Handler registrations in `EVENT_CONSUMER_MATRIX`. Code modules, not routes. | `src/server/consumers/intelligence/*.ts` |

---

## 2. tRPC Router Inventory

### 2.1 admin.intelligence (`src/server/routers/admin/intelligence.ts`)

6 routes. All queries. All `adminProcedure`. No mutations — S9 has no user-initiated intelligence actions. All state changes flow through deferred actions or event consumers.

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.intelligence.qualityDistribution` | `adminProcedure.query` | `{ period?: DateRange }` | `QualityDistribution` | §1 | Quality score distribution histogram + band counts |
| `admin.intelligence.decaySignals` | `adminProcedure.query` | `DecaySignalsInput` | `PaginatedDecaySignals` | §2 | Active/resolved decay signals with resolution status |
| `admin.intelligence.enrichmentStatus` | `adminProcedure.query` | `EnrichmentStatusInput` | `PaginatedEnrichmentStatus` | §2 | Enrichment coverage, next checks, failures |
| `admin.intelligence.ceremonies` | `adminProcedure.query` | `CeremoniesInput` | `PaginatedCeremonyRuns` | §4 | Ceremony run log, upcoming schedule, last results |
| `admin.intelligence.learningHypotheses` | `adminProcedure.query` | none | `LearningHypothesis[]` | §5 | L1-L7 current values, trends, confound warnings |
| `admin.intelligence.revenueHealth` | `adminProcedure.query` | none | `RevenuePerception` (extended) | §5 | Extended revenue health (S9 fields populated) |

**Total routes:** 6 (all `adminProcedure`, all query, 0 mutation).

Full route specifications, input schemas, and return types are defined in the content files (§1 through §5). This router plan is authoritative for file tree and route inventory.

---

## 3. Deferred Action Handler Inventory

17 deferred action handlers. All `domain: "intelligence"` except where noted. All `retryPolicy: "retry_3"` except batch actions (`once`). All `onFailure: "log"` except `enrichment_full_cycle` (`alert_principal` — cost-bearing API calls).

| Action | Params Type | Owner | Schedule | Retry | On Failure | Section | Handler Module |
|--------|-------------|-------|----------|-------|------------|---------|----------------|
| `quality_score_recalculation` | `{ listingId: UUID }` | D&L | Event-driven + nightly batch | `retry_3` | `log` | §1 | `quality-score-recalculation.ts` |
| `decay_liveness_check` | `{ listingId: UUID, checkType: EnrichmentCheckType }` | D&L | Per enrichment cadence (weekly/fortnightly/monthly). Self-perpetuating. | `retry_3` | `log` | §2 | `decay-liveness-check.ts` |
| `enrichment_full_cycle` | `{ listingId: UUID }` | D&L | Per enrichment cadence (quarterly/semi-annual/annual). Self-perpetuating. | `retry_3` | `alert_principal` | §2 | `enrichment-full-cycle.ts` |
| `claim_abandonment_check` | `Record<string, never>` | D&L | Daily batch. Scans `pending_review` listings >90 days. | `once` | `log` | §1 | `claim-abandonment-check.ts` |
| `taxonomy_review_preparation` | `Record<string, never>` | D&L | Quarterly | `once` | `log` | §4 | `taxonomy-review-preparation.ts` |
| `data_health_review` | `Record<string, never>` | D&L | Monthly | `once` | `log` | §4 | `data-health-review.ts` |
| `verification_calibration_review` | `Record<string, never>` | D&L | Quarterly | `once` | `log` | §4 | `verification-calibration-review.ts` |
| `provider_outreach_ranking` | `Record<string, never>` | D&L | Monthly | `once` | `log` | §4 | `provider-outreach-ranking.ts` |
| `conversion_funnel_analysis` | `Record<string, never>` | CR | Monthly | `once` | `log` | §4 | `conversion-funnel-analysis.ts` |
| `revenue_health_extended` | `Record<string, never>` | CR | Monthly | `once` | `log` | §5 | `revenue-health-extended.ts` |
| `multi_listing_pricing_evaluation` | `Record<string, never>` | CR | Quarterly (requires 20+ accounts threshold) | `once` | `log` | §4 | `multi-listing-pricing-evaluation.ts` |
| `sponsored_placement_learning` | `Record<string, never>` | CR | Monthly | `once` | `log` | §5 | `sponsored-placement-learning.ts` |
| `operational_health_review` | `Record<string, never>` | Ops | Monthly | `once` | `log` | §5 | `operational-health-review.ts` |
| `contractor_performance_review` | `Record<string, never>` | Ops | Quarterly | `once` | `log` | §5 | `contractor-performance-review.ts` |
| `principal_briefing_generation` | `Record<string, never>` | Ops | Monthly | `once` | `log` | §4 | `principal-briefing-generation.ts` |
| `proactive_churn_detection` | `Record<string, never>` | CR | Weekly | `retry_3` | `log` | §5 | `proactive-churn-detection.ts` |
| `learning_hypothesis_analysis` | `Record<string, never>` | Ops | Monthly | `once` | `log` | §5 | `learning-hypothesis-analysis.ts` |

**Total SI §2.1/§2.2 updates:** +17 `DeferredActionParamsMap` entries, +17 registered action rows. Prior count: 17 (S0-S8). After S9: **34 deferred actions**.

---

## 4. Event Consumer Handler Inventory

15 consumer handlers registered in `EVENT_CONSUMER_MATRIX`. All `domain: "intelligence"` except where noted. All `mode: "async"`.

| Event | Consumer Domain | Consumer ID | Mode | Handler Module | Invokes | Section |
|-------|----------------|-------------|------|----------------|---------|---------|
| `profile_edited` | D&L (S9) | `intelligence:profile_edited:qualityRecalc` | async | `profile-edited.ts` | §1 `scheduleDeferred("quality_score_recalculation")`, freshness reset | §6 |
| `listing_created` | D&L (S9) | `intelligence:listing_created:initialQuality` | async | `listing-created.ts` | §1 initial quality score, §2 enrichment schedule | §6 |
| `claim_approved` | D&L (S9) | `intelligence:claim_approved:qualityUpgrade` | async | `claim-approved.ts` | §1 quality recalc (+5 verification), §2 enrichment at claimed cadence, §5 L2/L3 hypothesis tracking | §6 |
| `profile_viewed` | D&L (S9) | `intelligence:profile_viewed:engagement` | async | `profile-viewed.ts` | §3 engagement trend aggregation, §3 viewer demographics, §1 deduplication | §6 |
| `search_performed` | D&L (S9) | `intelligence:search_performed:searchAnalytics` | async | `search-performed.ts` | §3 search term frequency, §3 zero-result detection, §3 taxonomy gap identification | §6 |
| `shortlist_added` | D&L (S9) | `intelligence:shortlist_added:qualitySignal` | async | `shortlist-added.ts` | §1 quality calibration perception signal | §6 |
| `contact_attempt` | D&L (S9) | `intelligence:contact_attempt:unreachableDetection` | async | `contact-attempt.ts` | §2 unreachable listing detection (data quality perception) | §6 |
| `account_closed` | D&L (S9) | `intelligence:account_closed:enrichmentSuspension` | async | `account-closed.ts` | §2 enrichment suspension, cancel pending deferred actions | §6 |
| `subscription_tier_changed` | CR (S9) | `intelligence:subscription_tier_changed:revenuePerception` | async | `subscription-tier-changed.ts` | §5 revenue perception update, §5 conversion trigger effectiveness | §6 |
| `subscription_ended` | CR (S9) | `intelligence:subscription_ended:churnAnalysis` | async | `subscription-ended.ts` | §5 churn analysis entry, §5 win-back attribution refinement | §6 |
| `conversion_milestone` | CR (S9) | `intelligence:conversion_milestone:attribution` | async | `conversion-milestone.ts` | §5 trigger effectiveness, §5 per-gate conversion attribution | §6 |
| `enquiry_submitted` | D&L (S9) | `intelligence:enquiry_submitted:enquiryAnalytics` | async | `enquiry-submitted.ts` | §3 enquiry analytics, §1 quality signal, §4 provider outreach prioritisation | §6 |
| `enquiry_responded` | D&L (S9) | `intelligence:enquiry_responded:responseInsights` | async | `enquiry-responded.ts` | §3 response insights, response time metrics | §6 |
| `winback_delivery_result` | CR (S9) | `intelligence:winback_delivery_result:effectiveness` | async | `winback-delivery-result.ts` | §5 win-back effectiveness learning, attribution refinement | §6 |
| `decay_signal_detected` | Ops (S9) | `intelligence:decay_signal_detected:supportCheck` | async | `decay-signal-detected.ts` | Annotate with active support ticket check, duplicate outreach suppression | §6 |

**EVENT_CONSUMER_MATRIX delta:** +15 new consumer entries. Prior count: ~50 (S0-S8). After S9: **~65 consumers**.

---

## 5. Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §1 event bus + P1-P5 principles, §2 deferred actions (17 new actions), §4.1 `AuthSession` type (admin guard), §5 email transport (4 new templates), §8 notification types (2 new), §9 decision logging (7 new decision types) |
| `data-and-listings.md` (v5 interface) | §1 emitted events (`decay_signal_detected` §1.7, `quality_score_changed` §1.8), §3 query interfaces (`getEngagementCounters` §3.2, `computeTaxonomyOverlap` §3.1, `getListingAnalytics` §3.x), §4 quality scoring contract |
| `commercial-and-revenue.md` (v3 interface) | §1 emitted events (`churn_risk_detected` §1.1), §4 TierLimits for premium feature gating, §5 conversion trigger types, §6 revenue perception extension |
| `operations.md` (v4 interface) | §3.1 `hasActiveTicket` query (consumed by §2 decay response), §3.4 `getFeatureGateFrictionSummary` (consumed by §5 friction ratios), §5 learning hypotheses |
| `platform-and-product.md` (v6 interface) | §1.x event payloads (consumed by §3 analytics, §6 consumers), §3.1 query interfaces, §4 email templates |
