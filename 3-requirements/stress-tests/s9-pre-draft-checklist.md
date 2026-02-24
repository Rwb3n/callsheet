# S9 Pre-Draft Checklist — Entity Intelligence

**Generated:** 2026-02-15
**Slice:** `slices/slice-09-entity-intelligence/` (multi-file, S6+ format)
**Primary domain:** All (D&L perception + CR intelligence + Ops learning + PP analytics pipeline)
**Upstream specs:** `shared-infrastructure.md` (v8), `data-and-listings.md` (v5), `operations.md` (v4), `platform-and-product.md` (v6), `commercial-and-revenue.md` (v3)

---

## 1. Deferred Actions to Register

S9 introduces periodic intelligence actions that do not exist in S0–S8. All scheduled via the existing deferred action infrastructure (S0 §2).

| Action | Params Type | Owner | Schedule | Retry | On Failure | Source |
|--------|-------------|-------|----------|-------|------------|--------|
| `quality_score_recalculation` | `{ listingId: UUID }` | D&L | Triggered by `profile_edited`, `claim_approved`, enrichment cycle completion, and periodic batch (nightly for all active listings) | `retry_3` | `log` | D&L CD §3 |
| `decay_liveness_check` | `{ listingId: UUID, checkType: "website" \| "email" \| "ch" \| "social" \| "postcode" }` | D&L | Per enrichment cadence: weekly/fortnightly/monthly by tier | `retry_3` | `log` | D&L CD §3 |
| `enrichment_full_cycle` | `{ listingId: UUID }` | D&L | Per enrichment cadence: quarterly/semi-annual/annual by tier. Self-perpetuating. | `retry_3` | `alert_principal` (cost-bearing) | D&L CD §3 |
| `claim_abandonment_check` | `Record<string, never>` | D&L | Daily batch. Scans `pending_review` listings >90 days. | `once` | `log` | S3-7 |
| `taxonomy_review_preparation` | `Record<string, never>` | D&L | Quarterly. Produces free-text tag clustering report + zero-result aggregation. | `once` | `log` | D&L CD §5 |
| `data_health_review` | `Record<string, never>` | D&L | Monthly. Aggregates quality score distribution, decay trends, enrichment coverage. | `once` | `log` | D&L CD §5 |
| `verification_calibration_review` | `Record<string, never>` | D&L | Quarterly. Analyses `claim_evaluation` decision logs for accuracy rates. | `once` | `log` | D&L CD §5, S3-4 |
| `provider_outreach_ranking` | `Record<string, never>` | D&L | Monthly. Ranks unclaimed listings by estimated value for outreach prioritisation. | `once` | `log` | D&L CD §5 |
| `conversion_funnel_analysis` | `Record<string, never>` | CR | Monthly. Evaluates trigger effectiveness, cold start performance, threshold recommendations. | `once` | `log` | CR CD §Layer 3 |
| `revenue_health_extended` | `Record<string, never>` | CR | Monthly. Computes advanced revenue metrics (per-tier churn, LTV, CAC, NRR, renewal rate). | `once` | `log` | S8-1, CR CD §6.2 |
| `multi_listing_pricing_evaluation` | `Record<string, never>` | CR | Quarterly. `evaluateMultiListingPricingEvolution`. Requires 20+ accounts threshold. | `once` | `log` | S8-4, CR CD §3.2 |
| `sponsored_placement_learning` | `Record<string, never>` | CR | Monthly. Analyses `sponsored_placement_selection` decision logs for quality floor + fairness cap tuning. | `once` | `log` | S8-5, CR CD §4.4 |
| `operational_health_review` | `Record<string, never>` | Ops | Monthly. Hypothesis analysis (L1–L7), health trends, signal history. | `once` | `log` | Ops CD §9 |
| `contractor_performance_review` | `Record<string, never>` | Ops | Quarterly. Completion rates, quality scores, cost per task. | `once` | `log` | Ops CD §9 |
| `principal_briefing_generation` | `Record<string, never>` | Ops | Monthly. Generates `PrincipalBriefing` report. | `once` | `log` | Ops CD §9 |
| `proactive_churn_detection` | `Record<string, never>` | CR | Weekly. Scans for `engagement_dropping` and `billing_cadence_switch_to_monthly` signals. | `retry_3` | `log` | S8-3, CR CD §4 |
| `learning_hypothesis_analysis` | `Record<string, never>` | Ops | Monthly. Computes L1–L7 measurements against decision logs. | `once` | `log` | Ops CD §8 |

**Total new deferred actions:** 17. Current SI §2.1 count: 17. After S9: **34 deferred actions**.

**SI §2.1 entries to add:**

```typescript
// S9 — Entity Intelligence
quality_score_recalculation: { listingId: UUID }
decay_liveness_check: { listingId: UUID, checkType: "website" | "email" | "ch" | "social" | "postcode" }
enrichment_full_cycle: { listingId: UUID }
claim_abandonment_check: Record<string, never>
taxonomy_review_preparation: Record<string, never>
data_health_review: Record<string, never>
verification_calibration_review: Record<string, never>
provider_outreach_ranking: Record<string, never>
conversion_funnel_analysis: Record<string, never>
revenue_health_extended: Record<string, never>
multi_listing_pricing_evaluation: Record<string, never>
sponsored_placement_learning: Record<string, never>
operational_health_review: Record<string, never>
contractor_performance_review: Record<string, never>
principal_briefing_generation: Record<string, never>
proactive_churn_detection: Record<string, never>
learning_hypothesis_analysis: Record<string, never>
```

**SI §2.2 rows to add:**

| Domain | Action | Trigger | Retry | On Failure |
|--------|--------|---------|-------|------------|
| D&L | `quality_score_recalculation` | Event-driven (`profile_edited`, `claim_approved`, enrichment completion) + nightly batch | `retry_3` | `log` |
| D&L | `decay_liveness_check` | Per enrichment cadence (weekly/fortnightly/monthly by tier). Self-perpetuating. | `retry_3` | `log` |
| D&L | `enrichment_full_cycle` | Per enrichment cadence (quarterly/semi-annual/annual by tier). Self-perpetuating. | `retry_3` | `alert_principal` |
| D&L | `claim_abandonment_check` | Daily batch | `once` | `log` |
| D&L | `taxonomy_review_preparation` | Quarterly | `once` | `log` |
| D&L | `data_health_review` | Monthly | `once` | `log` |
| D&L | `verification_calibration_review` | Quarterly | `once` | `log` |
| D&L | `provider_outreach_ranking` | Monthly | `once` | `log` |
| CR | `conversion_funnel_analysis` | Monthly | `once` | `log` |
| CR | `revenue_health_extended` | Monthly | `once` | `log` |
| CR | `multi_listing_pricing_evaluation` | Quarterly (requires 20+ multi-listing accounts) | `once` | `log` |
| CR | `sponsored_placement_learning` | Monthly | `once` | `log` |
| CR | `proactive_churn_detection` | Weekly | `retry_3` | `log` |
| Ops | `operational_health_review` | Monthly | `once` | `log` |
| Ops | `contractor_performance_review` | Quarterly | `once` | `log` |
| Ops | `principal_briefing_generation` | Monthly | `once` | `log` |
| Ops | `learning_hypothesis_analysis` | Monthly | `once` | `log` |

---

## 2. Email Templates to Register

S9 is primarily a perception/intelligence slice, not a communication slice. Most outreach emails already exist (S2 claim outreach, S7 decay warning, S7 win-back delivery). S9 adds ceremony output distribution.

| Template ID | Trigger | Category | Unsubscribable | Owner |
|-------------|---------|----------|----------------|-------|
| `decay_warning_provider` | Decay signal detected on claimed listing (high severity) | `listing_status` | No (operational) | D&L |
| `decay_final_notice` | 90-day no-response to decay warning | `listing_status` | No (operational) | D&L |
| `enrichment_confirmation_request` | Annual confirmation prompt to claimed providers | `listing_status` | No (operational) | D&L |
| `credit_confirmation_outreach` | Automated client credit confirmation (S3-5) | `listing_status` | Yes | D&L |
| `principal_briefing` | Monthly Principal Operations Briefing | `internal` | No (principal-only) | Ops |

**Current count:** 26 templates (SI §5.2 / PP §4). After S9: **31 templates**.

Checklist default: 5 new templates. The `decay_warning_provider` and `decay_final_notice` may overlap with S7's `listing_decay_warning` template — schema agent must verify whether S7's template covers both severity levels or only the initial warning. If S7 covers both, reduce to 3 new templates. Override if schema agent finds reason.

---

## 3. Event Emissions

S9 emits existing event types (already in `EventPayloadMap`). No new event types needed.

| Event | Emitted By | Key Payload Fields | P1 Check | Notes |
|-------|-----------|-------------------|----------|-------|
| `decay_signal_detected` | D&L (S9 handler) | `listingId`, `accountId`, `signals[]`, `activeSupportTicket?` | Verify `accountId` nullable (unclaimed listings) | D&L §1.7. S9 implements the emission; event type already registered. |
| `quality_score_changed` | D&L (S9 handler) | `listingId`, `accountId`, `previousScore`, `newScore`, `dimensions` | Verify all fields present per D&L §1.8 | D&L §1.8. S9 implements calibrated scoring; S1 had zero-initialised stubs. |
| `churn_risk_detected` | CR (S9 handler) | `accountId`, `listingId`, `riskFactors[]`, `overallRisk`, `recommendedAction` | All present per CR §1.1 | CR §1.1. S9 adds proactive emission (S8 only emits reactively on events). |

**No new event types to add to `EventPayloadMap`.** All three events are already registered in their respective interface specs. S9 operationalises the emission logic.

---

## 4. Event Consumers

S9 registers new consumers for perception signal ingestion. These are all async.

| Event | Consumer Domain | Mode | Handler Description |
|-------|----------------|------|---------------------|
| `profile_edited` | D&L (S9) | async | Trigger `quality_score_recalculation` for edited listing. Reset freshness. |
| `listing_created` | D&L (S9) | async | Trigger initial `quality_score_recalculation`. Schedule enrichment per tier. |
| `claim_approved` | D&L (S9) | async | Recalculate quality (+5 verification). Schedule enrichment at claimed cadence. L2/L3 hypothesis tracking. |
| `profile_viewed` | D&L (S9) | async | Aggregate for engagement trends, viewer demographics (S5-4), deduplication (S1-8). |
| `search_performed` | D&L (S9) | async | Search term frequency analysis, zero-result detection, taxonomy gap identification (S6-3). |
| `shortlist_added` | D&L (S9) | async | Perception signal for quality score calibration (S6-5). |
| `contact_attempt` | D&L (S9) | async | Data quality perception — unreachable listing detection. |
| `account_closed` | D&L (S9) | async | Suspend scheduled enrichment for archived listings (S1-11). Cancel pending deferred actions. |
| `subscription_tier_changed` | CR (S9) | async | Revenue perception update. Conversion trigger effectiveness tracking. |
| `subscription_ended` | CR (S9) | async | Churn analysis entry. Win-back attribution window refinement. |
| `conversion_milestone` | CR (S9) | async | Trigger effectiveness analysis. Per-gate conversion attribution (S8-2). |
| `enquiry_submitted` | D&L (S9) | async | Enquiry analytics. Quality signal. Provider outreach prioritisation. |
| `enquiry_responded` | D&L (S9) | async | Response insights computation (S5-5). Response time metrics. |
| `winback_delivery_result` | CR (S9) | async | Win-back effectiveness learning. Attribution refinement. |
| `decay_signal_detected` | Ops (S9) | async | Annotate with active support ticket check. Suppress duplicate outreach. |

**EVENT_CONSUMER_MATRIX delta:** +15 new consumer entries.

**Note on existing consumers:** Several events already have consumers registered in S1–S8 (e.g., `profile_edited` has D&L and PP consumers). S9 adds additional consumers for perception/intelligence purposes. These are distinct handlers — not modifications to existing consumers.

---

## 5. Schema Amendments and New Tables

### 5.1 New Tables

| Table | Owner | Est. Rows (12 months) | Purpose |
|-------|-------|----------------------|---------|
| `enrichment_schedules` | D&L | ~4,700 (1 per listing) | Tracks per-listing enrichment cadence, next check dates, last full cycle |
| `decay_signals` | D&L | ~500–2,000 | Detected decay signals with severity, resolution status |
| `perception_aggregates` | D&L | ~50,000 | Pre-computed engagement aggregates (search terms, demographics, benchmarking) per listing per period |
| `ceremony_runs` | All | ~120 | Ceremony execution log (which ceremony, when, inputs hash, outputs, decisions) |
| `learning_hypotheses` | Ops | ~7 (static) + measurements | L1–L7 hypothesis state, last measurement, current value, trend |
| `principal_briefings` | Ops | ~12 | Generated monthly briefing snapshots |

Checklist default: 6 new tables. Total after S9: **44 tables** (38 from S8 + 6 new).

### 5.2 Schema Amendments to Existing Tables

| Table | New Column | Type | Default | Source |
|-------|-----------|------|---------|--------|
| `listings` | `lastEnrichmentAt` | `timestamp` (with timezone) | `null` | S9 enrichment scheduling |
| `listings` | `nextEnrichmentAt` | `timestamp` (with timezone) | `null` | S9 enrichment scheduling |
| `listings` | `enrichmentTier` | `text` | `null` | Cached enrichment cadence tier (`"paid"`, `"claimed"`, `"unclaimed"`) |
| `quality_scores` | `calculatedBy` | `text` | `"zero_init"` | Distinguishes S1 zero-init from S9 calibrated scores (`"zero_init"` / `"calibrated"`) |
| `quality_scores` | `algorithmVersion` | `integer` | `1` | Enables score version tracking for calibration |

Checklist default: 5 column amendments. The `enrichmentTier` column is a denormalised cache of the tier logic — schema agent may decide this is computed at read time instead. Override if schema agent finds reason.

### 5.3 New pgEnums

| Enum | Values | Source |
|------|--------|--------|
| `decay_signal_type` | `"website_dead"`, `"email_bounced"`, `"ch_not_active"`, `"stale_listing"`, `"social_dead"`, `"postcode_invalid"`, `"domain_expired"` | D&L CD §3 |
| `decay_signal_severity` | `"critical"`, `"high"`, `"medium"` | D&L CD §3 |
| `enrichment_check_type` | `"website"`, `"email"`, `"ch"`, `"social"`, `"postcode"`, `"imdb"` | D&L CD §3 |
| `ceremony_type` | `"taxonomy_review"`, `"data_health_review"`, `"verification_calibration"`, `"provider_outreach"`, `"conversion_funnel_analysis"`, `"revenue_review"`, `"multi_listing_pricing"`, `"sponsored_placement_learning"`, `"operational_health_review"`, `"contractor_performance_review"`, `"principal_briefing"`, `"learning_hypothesis_analysis"` | D&L/CR/Ops CD §5/§9 |

**Total new pgEnums:** 4. Cumulative after S9: **36 pgEnums** (32 from S8 + 4 new).

### 5.4 Cumulative Schema Snapshot After S9

**Total tables: 44** (38 from S8 cumulative snapshot + 6 new).
**Total pgEnums: 36** (32 from S8 + 4 new).
**Total deferred actions: 34** (17 from S8/SI v8 + 17 new).
**Total email templates: 31** (26 from S8/SI v8 + 5 new).
**Total EVENT_CONSUMER_MATRIX entries:** prior count + 15 new.

---

## 6. Upstream Flags to Resolve

**Total: 23 flags** from S1, S2, S3, S5, S6, S7, S8.

### D&L Quality Scoring Cluster (6 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S1-2 | S1 §13 | Quality scoring algorithms deferred. S1 provides zero-initialised storage. | Implement `computeQualityScore` with 5 dimensions (Completeness 0–25, Freshness 0–25, Accuracy 0–20, Richness 0–15, Verification 0–15). Straight additive sum = 0–100. Use `quality_scores` + `quality_score_explanations` tables. |
| S2-3 | S2 §15 | Profile strength meter fallback field-presence check. S9 wires real scoring. | Replace fallback with `quality_score_explanations`-driven missing field identification. Surface top 3 improvement recommendations. |
| S5-7 | S5 §19 | Quality scoring calibration — S5 displays zero-initialised scores until S9. | See S1-2. S5 renders the results. S9 computes them. |
| S6-5 | S6 §16 | Quality scoring data from engagement events (`profile_viewed`, `shortlist_added`). | Consume these events as perception signals for quality score dimensions (engagement component feeds into Richness/Freshness weighting). |
| S1-8 | S1 §13 | `profile_viewed` P2 deduplication deferred. V1 accepts approximate counting. | Implement idempotency layer: event ID set or time-window check (e.g., same viewer + same listing within 1 hour = single count). |
| S3-7 | S3 §13 | Claim abandonment detection: `pending_review` >90 days reverts to `unclaimed`. | Implement `claim_abandonment_check` daily batch. Reset `claimStatus` to `unclaimed`. Coordinate with S2's `pre_claim_snapshot_cleanup`. |

### Analytics Pipeline Cluster (7 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S1-4 | S1 §13 | Search terms + trend data deferred. | Aggregate `search_performed` events into `perception_aggregates`. Populate per-listing search term frequencies + engagement trend data. |
| S5-3 | S5 §19 | Competitor benchmarking data (premium tier). | Use D&L `computeTaxonomyOverlap` to identify competitors. Aggregate engagement counters. Surface anonymised comparison (median views, enquiries, scores). |
| S5-4 | S5 §19 | Viewer demographics bucketing (premium tier). | Aggregate `profile_viewed` events by entity type, sector, location. Bucket into distribution percentages. |
| S5-5 | S5 §19 | Enquiry response insights (premium tier). | Compute response rate (D&L `getEngagementCounters`), median response time (`enquiry_responded` timestamps), conversion-to-booking estimates. |
| S5-6 | S5 §19 | Top search terms per listing (standard+ tier). | Aggregate from `search_performed` events + `zero_result_queries`. Surface top N terms that led to listing impressions. |
| S6-3 | S6 §16 | Search analytics pipeline (term frequency, zero-result, taxonomy gaps). | Build aggregation pipeline: term frequencies, zero-result pattern detection, taxonomy gap identification (common searches not covered by taxonomy). |
| S6-4 | S6 §16 | PP-Q5 analytics tooling. S6 emits raw events. S9 owns pipeline. | Resolve PP-Q5: custom aggregation via `perception_aggregates` table. No external analytics service at V1 (consistent with S0's "no external monitoring service at V1" decision). Checklist default: in-database aggregation via scheduled deferred actions. |

### Ceremony Automation Cluster (3 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S3-4 | S3 §13 | Verification calibration ceremony automation. Quarterly. | `verification_calibration_review` handler: query `decision_logs` for `claim_evaluation`, compute auto-approve accuracy, false positive/negative rates. Log findings in `ceremony_runs`. Surface threshold adjustment recommendations. |
| S3-5 | S3 §13 | Client credit confirmation outreach scheduling. | `credit_confirmation_outreach` email. Schedule periodic outreach to credited clients requesting verification. Feed results into `evaluateVerificationUpgrade`. |
| S8-4 | S8 §17 | Multi-listing pricing evaluation. Quarterly. 20+ account threshold. | `multi_listing_pricing_evaluation` handler: count multi-listing paid accounts, compute secondary churn rate, aggregate pricing support tickets. If <20 accounts → `insufficient_data`. If secondary churn >30% or pricing tickets >10 → recommend discount, escalate to principal. |

### Data Health Cluster (2 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S1-11 | S1 §13 | `account_closed` consumer enrichment suspension (currently no-op). | Implement handler: cancel all pending `decay_liveness_check` and `enrichment_full_cycle` deferred actions for the account's listings. |
| S2-4 | S2 §15 | Generic taxonomy suggestions from listing data. | Complement S2's 3 curated sectors with data-driven suggestions. Query existing listings by sector distribution. Surface as taxonomy suggestion source. |

### Entity Learning Cluster (3 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S7-3 | S7 §20 | Perception wiring from `decision_logs` (triage, reconciliation, compliance). | `learning_hypothesis_analysis` handler: query `decision_logs` by domain, compute L1–L7 measurements. Log in `learning_hypotheses` table. Surface counterintuitive results for principal review (confound warning). |
| S8-3 | S8 §17 | Learned churn prediction (proactive detection). | `proactive_churn_detection` handler: scan for `engagement_dropping` (configurable threshold: >30% view decline over 30 days) and `billing_cadence_switch_to_monthly` signals. Emit `churn_risk_detected`. Produces 5/5 `ChurnRiskFactor` values (S8 produces 3/5). |
| S8-5 | S8 §17 | Sponsored placement decision learning. | `sponsored_placement_learning` handler: query `decision_logs` for `sponsored_placement_selection`, analyse quality floor hit rate, fairness cap activation frequency. Surface calibration recommendations. |

### Advanced Commercial Intelligence Cluster (2 flags)

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S7-2 / S8-2 | S7 §20, S8 §17 | Friction ratio conversion denominator. V1 uses total tickets. S9 instruments per-gate conversion attribution. | Implement conversion attribution: track which feature gate triggered each `conversion_milestone` event. Compute `(complaints per gate) / (conversions per gate)`. Enable CR-X-6 escalation threshold (5:1). |
| S8-1 | S8 §17 | Advanced revenue health. V1: 3 thresholds. S9: full CR §6.2. | `revenue_health_extended` handler: compute `churnByTier`, `annualRenewalRate`, `netRevenueRetention`, `ltv`, `cac`, `discountCohortDivergence` from `churn_analysis_log` + `listings` + `commercial_state`. Extend `RevenuePerception` type with these fields. |

---

## 7. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| PP-Q5 | Analytics / product metrics tooling | Resolve in S9. Checklist default: in-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service at V1. S6 provides event emission infrastructure. S9 builds the aggregation pipeline. External tooling (PostHog, Mixpanel) deferred to post-launch operational decision. |

**No other open questions target S9.** SQ-3 (Paddle cancellation retry policy) targets S4 implementation, not S9. D&L-Q2 (public API) is a scope boundary decision, not S9 scope. PP-Q1 (component library) is implementation-level, not S9.

---

## 8. Notification Types

S9 may need to extend `NotificationType` (SI §8.1) for intelligence-derived notifications.

| Type | Trigger | Domain |
|------|---------|--------|
| `quality_score_improved` | Quality score crosses upward band boundary (e.g., Poor→Fair) | D&L |
| `quality_score_declined` | Quality score crosses downward band boundary | D&L |
| `decay_warning` | Decay signal detected on claimed listing (before email) | D&L |
| `enrichment_confirmation_due` | Annual provider confirmation prompt | D&L |
| `ceremony_action_required` | Ceremony produces a recommendation requiring principal action | All |

**Total new notification types:** 5. Checklist default: 5 new. The `quality_score_changed` notification already exists (S5 registered it). S9 adds band-crossing specificity. Override if schema agent determines the existing type suffices with a `direction` field.

---

## 9. Decision Types to Register

S9 may add new `DecisionLog.decisionType` entries (SI §9.2) for intelligence-specific decisions.

| Decision Type | Domain | Source |
|---------------|--------|--------|
| `quality_score_band_evaluation` | D&L | When score crosses band boundary → decide: notify provider, adjust search ranking treatment |
| `decay_response_evaluation` | D&L | When decay signal detected → decide: warn/outreach/suspend per severity |
| `enrichment_cadence_adjustment` | D&L | Monthly data health review → decide: increase/decrease enrichment frequency |
| `taxonomy_promotion_evaluation` | D&L | Quarterly taxonomy review → decide: promote free-text tag to taxonomy |
| `proactive_churn_detection` | CR | Weekly scan → decide: emit `churn_risk_detected` or suppress |
| `conversion_threshold_adjustment` | CR | Monthly funnel analysis → decide: adjust trigger thresholds |
| `ceremony_outcome_evaluation` | All | Ceremony produces recommendation → decide: auto-apply vs escalate to principal |

**Current count:** 19 decision types (SI §9.2). After S9: **26 decision types** (19 + 7 new).

Checklist default: 7 new. May be reduced if some intelligence decisions use existing types (e.g., `proactive_churn_detection` might use the existing `churn_intervention` type). Override if schema agent finds reason.

---

## 10. Cross-Domain Route Ownership

S9 is not a UI-heavy slice — it adds no user-facing pages. However, S9 adds **admin-facing routes** for ceremony management and intelligence monitoring.

| Route | Data Owner | Route Owner | Notes |
|-------|-----------|-------------|-------|
| `admin.intelligence.qualityDistribution` | D&L | PP | Quality score distribution dashboard |
| `admin.intelligence.decaySignals` | D&L | PP | Active decay signals, resolution status |
| `admin.intelligence.enrichmentStatus` | D&L | PP | Enrichment coverage, next checks, failures |
| `admin.intelligence.ceremonies` | All | PP | Ceremony run log, upcoming schedule, last results |
| `admin.intelligence.learningHypotheses` | Ops | PP | L1–L7 current values, trends, confound warnings |
| `admin.intelligence.revenueHealth` | CR | PP | Extended revenue health (complements S8's basic revenue perception route) |

Checklist default: 6 admin routes (query-only, no mutations). These extend S7's admin dashboard with an Entity Intelligence panel. Override if content agent determines these belong in S10 (Hardening) instead.

---

## 11. Scope Summary and Partition Hint

### Scope Decomposition

S9 has 6 functional areas, each mapping to concept design section locality:

| Area | Concept Design Source | Upstream Flags | Estimated AC |
|------|----------------------|----------------|-------------|
| **A. Quality Scoring & Data Health** | D&L CD §3 | S1-2, S1-8, S2-3, S3-7, S5-7, S6-5 | ~20 |
| **B. Decay Detection & Enrichment** | D&L CD §3 | S1-11 | ~15 |
| **C. Analytics Pipeline** | D&L CD §3, PP analytics | S1-4, S5-3, S5-4, S5-5, S5-6, S6-3, S6-4 | ~18 |
| **D. Ceremony Automation** | D&L/CR/Ops CD §5/§9 | S3-4, S3-5, S8-4 | ~15 |
| **E. Entity Learning & Perception** | Ops CD §8/§9 | S7-3, S8-3, S8-5 | ~12 |
| **F. Advanced Commercial Intelligence** | CR CD §6 | S7-2, S8-1, S8-2 | ~10 |

**Estimated total AC:** ~90. This is the largest "cognitive" slice — implements Layer 2 materialisation across all 4 sub-entities.

### Content Agent Partition Hint (for drafter skill)

```
Phase 2 content agents — suggested partition:

Agent 1: Quality Scoring (Area A)
  - computeQualityScore implementation (5 dimensions)
  - quality_score_recalculation handler
  - profile_viewed deduplication (S1-8)
  - claim_abandonment_check (S3-7)
  - profile strength meter wiring (S2-3)
  Reads: D&L CD §3 (scoring detail), D&L interface §4, S1 quality_scores schema
  Dependencies: Schema foundation (00-schema), router plan

Agent 2: Decay Detection & Enrichment (Area B)
  - detectDecay pipeline (liveness checks)
  - evaluateDecayResponse decision architecture
  - scheduleEnrichment tiered cadence
  - decay_signal_detected emission
  - account_closed enrichment suspension (S1-11)
  Reads: D&L CD §3 (decay/enrichment detail), D&L interface §1.7, Ops interface §3.1 (hasActiveTicket)
  Dependencies: Schema foundation, Agent 1 (quality score feeds decay response)

Agent 3: Analytics Pipeline (Area C)
  - Search term aggregation
  - Viewer demographics bucketing
  - Competitor benchmarking computation
  - Enquiry response insights
  - Zero-result pattern detection
  - Taxonomy gap identification
  Reads: PP interface §1.x (event payloads), PP interface §3.1, D&L interface §3 (queries), CR interface §4 (TierLimits for gating)
  Dependencies: Schema foundation (perception_aggregates table)

Agent 4: Ceremony Automation (Area D)
  - All ceremony handler implementations
  - ceremony_runs table usage
  - Taxonomy review preparation
  - Verification calibration
  - Data health review
  - Provider outreach ranking
  - Multi-listing pricing evaluation
  - Principal briefing generation
  Reads: D&L/CR/Ops CD §5/§9 (ceremony definitions), Ops interface (learning hypotheses)
  Dependencies: Schema foundation, Agents 1–3 (ceremonies consume their outputs)

Agent 5: Entity Learning & Commercial Intelligence (Areas E + F)
  - Learning hypothesis analysis (L1–L7)
  - Proactive churn detection
  - Sponsored placement learning
  - Conversion-denominated friction ratios
  - Advanced revenue health extension
  - Conversion trigger threshold recommendations
  Reads: CR CD §6 (revenue thresholds), CR interface §5, Ops interface §3.4 (friction), S8 schema
  Dependencies: Schema foundation, Agent 3 (analytics feed into conversion attribution)

Agent 6: Event Consumers (cross-cutting)
  - All 15 new consumer handler implementations
  - EVENT_CONSUMER_MATRIX delta
  - Consumer table format (per established slice convention)
  Reads: All interface spec §1 sections, S0 §1 (event bus contract)
  Dependencies: All other agents (consumers invoke logic from Agents 1–5)
```

**Note on D5 authority split:** S9 has a similar risk to S8 — multiple agents describe the same data flows. The **Phase 1 Decision Summary** must specify authoritative type signatures from interface specs for each handler. Agent 6 (event consumers) is authoritative for consumer handler code; Agents 1–5 are authoritative for the decision logic those consumers invoke.

---

## 12. Prior Stress Test Patterns to Watch

| Pattern | Risk in S9 | Pre-Mitigation |
|---------|-----------|----------------|
| **Three-part sync gap (9 occurrences S0–S8)** | S9 adds 17 deferred actions — highest single-slice addition. High risk. | Checklist §1 pre-populates all 17 entries. Drafter Phase 1 SI sync verification must be especially thorough. |
| **Pattern #14 (content agent divergence)** | S9 has 6 content agents all touching `quality_scores`, `decision_logs`, and perception signals. Divergence risk: high. | Phase 1 Decision Summary must include authoritative type signatures for `QualityScore`, `DecisionLog`, `PerceptionAggregate`. Designate Agent 1 as authoritative for quality score type, Agent 5 for decision log consumption pattern. |
| **Pattern #15 (runtime silent failure)** | Ceremony handlers that query empty tables (no decision logs yet, no ceremony history). | AC must include "ceremony handler returns `insufficient_data` when prerequisites not met" for each ceremony. No silent empty-set returns. |
| **P1 payload compliance** | S9 emits `decay_signal_detected` and `quality_score_changed` — verify payload matches `EventPayloadMap`. | Checklist §3 lists exact P1 fields to verify. |
| **`AuthSession` property references** | S9 admin routes use `ctx.session`. | Always use `ctx.session?.accountId` (not `ctx.session?.id`). [Source: S6-ST-4] |

---

## 13. Key Decisions for Schema Agent

The following require resolution during Phase 1 (schema/router/decisions foundations):

1. **`perception_aggregates` table structure:** Single table with `aggregateType` discriminator vs separate tables per aggregate type (search terms, demographics, benchmarking). Checklist default: single table with discriminator + JSONB `data` column. Override if schema agent determines separate tables improve query performance.

2. **Enrichment tracking:** Columns on `listings` table vs separate `enrichment_schedules` table. Checklist default: separate table (§5.1). Override if schema agent determines columns on `listings` are simpler for the 1:1 relationship.

3. **Ceremony run frequency storage:** How to represent "quarterly" / "monthly" cadence. Checklist default: deferred action self-perpetuation pattern (established in S0 §2, S5 §9). Each ceremony handler schedules its next run as its final step.

4. **Learning hypothesis table:** Static rows (7 hypotheses) with measurement columns that update monthly vs append-only measurement log. Checklist default: static rows with `lastMeasuredAt`, `currentValue`, `previousValue`, `trend` columns. Measurement history in `ceremony_runs`.

5. **`RevenuePerception` type extension:** S8's V1 type has 8 fields. S9 extends to ~20. Keep as single type with optional fields for V1-only metrics, or version the type. Checklist default: single type, S9 populates the fields S8 left null. No type versioning needed — TypeScript compiler catches missing fields.
