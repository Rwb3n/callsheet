# S9 Phase 1A: Decisions

**Status:** Phase 1 foundation output
**Slice:** S9 — Entity Intelligence
**Generated:** 2026-02-15
**Purpose:** Resolve all conditional decisions and open questions so Schema (1B) and Router Plan (1C) agents proceed without ambiguity.

---

## Decision Summary

9 decisions resolved. Net schema impact: 6 new tables (unchanged), listing column amendments reduced from 5 to 2, email templates reduced from 5 to 4, notification types reduced from 5 to 2 new, decision types held at 7 new.

---

## D1. `perception_aggregates` Table Structure

| Aspect | Detail |
|--------|--------|
| **Decision** | Single table with `aggregateType` discriminator + JSONB `data` column |
| **Options** | (A) Single table with discriminator. (B) Separate tables per aggregate type. |
| **Recommendation** | A |
| **Rationale** | S9 has 4 aggregate types (search_terms, viewer_demographics, competitor_benchmarking, enquiry_response) sharing identical lifecycle: per-listing, per-period, scheduled write, on-demand read. JSONB `data` column provides type-specific field flexibility without schema migrations. Single table simplifies the deferred action pipeline — one `perception_aggregates` writer, not 4. Query performance adequate with composite index on `(listingId, aggregateType, periodStart)`. Separate tables justified only when query patterns diverge significantly — they do not (all per-listing lookups). |

---

## D2. Enrichment Tracking

| Aspect | Detail |
|--------|--------|
| **Decision** | Separate `enrichment_schedules` table. Remove 3 listing column amendments. |
| **Options** | (A) 3 new columns on `listings` table (`lastEnrichmentAt`, `nextEnrichmentAt`, `enrichmentTier`). (B) Separate `enrichment_schedules` table. |
| **Recommendation** | B |
| **Rationale** | Enrichment scheduling is per-check-type, not per-listing. 5 check types (website, email, CH, social, postcode) each have independent `nextCheckAt` and `lastCheckAt` dates. A single `nextEnrichmentAt` column on `listings` loses check-type granularity. The `enrichment_schedules` table stores `listingId`, `checkType`, `nextCheckAt`, `lastCheckAt`, `lastFullCycleAt`, `cadenceTier` — one row per listing per check type. This means the 3 listing column amendments in checklist §5.2 (`lastEnrichmentAt`, `nextEnrichmentAt`, `enrichmentTier`) are NOT needed. |

**Schema impact:** Listing column amendments reduced from 5 to 2. Only `quality_scores.calculatedBy` and `quality_scores.algorithmVersion` remain.

---

## D3. Ceremony Run Frequency Storage

| Aspect | Detail |
|--------|--------|
| **Decision** | Self-perpetuating deferred action pattern. No separate frequency storage. |
| **Options** | (A) Store frequency/cadence in a `ceremony_schedules` table. (B) Self-perpetuating deferred action pattern — each handler schedules its next run as its final step. |
| **Recommendation** | B |
| **Rationale** | Established pattern from S0 §2 and S5 §9. The deferred action schedule IS the frequency. `ceremony_runs` table logs execution history only (which ceremony ran, when, inputs hash, outputs, decisions made). No separate cadence storage needed — the handler's final statement `scheduleDeferred("taxonomy_review_preparation", {}, nextQuarterDate)` is the single source of truth for scheduling. Adding a `ceremony_schedules` table would create a second source of truth with no consumer. |

---

## D4. Learning Hypothesis Table

| Aspect | Detail |
|--------|--------|
| **Decision** | Static rows (7) with mutable measurement columns |
| **Options** | (A) Static rows with `currentValue`, `previousValue`, `trend` columns updated monthly. (B) Append-only measurement log. |
| **Recommendation** | A |
| **Rationale** | 7 hypotheses are fixed by design (L1–L7, [Source: Ops CD §8]). Monthly measurements update `currentValue`, `previousValue`, `trend` in-place. Full measurement history is preserved in `ceremony_runs` — each `learning_hypothesis_analysis` execution logs its complete output as the ceremony run's `outputs` JSONB. Append-only adds query complexity for "current value of L3" (requires `ORDER BY measuredAt DESC LIMIT 1` per hypothesis) without benefit. These are not time-series metrics — they are entity self-knowledge snapshots. |

---

## D5. `RevenuePerception` Type Extension

| Aspect | Detail |
|--------|--------|
| **Decision** | Single type with optional fields. No versioning. |
| **Options** | (A) Single type, S9 populates fields S8 left null. (B) Versioned types (`RevenuePerceptionV1`, `RevenuePerceptionV2`). |
| **Recommendation** | A |
| **Rationale** | S8's V1 fields (`mrr`, `arr`, `churnRate`, `activeSubscriptions`, `trialConversions`, `averageRevenuePerListing`, `revenueConcentrationIndex`, `projectedMonthlyRevenue`) become non-optional once S9's `revenue_health_extended` handler runs. S9 adds ~12 fields (`churnByTier`, `annualRenewalRate`, `netRevenueRetention`, `ltv`, `cac`, `discountCohortDivergence`, etc.) as optional — null until first computation. TypeScript compiler catches field access on null for callers that expect S9 fields. Versioned types add indirection without safety benefit — the V1/V2 boundary is temporal (pre/post S9 first run), not structural. |

---

## D6. Template Overlap Resolution

| Aspect | Detail |
|--------|--------|
| **Decision** | S7's `listing_decay_warning` covers the initial warning. S9 adds `decay_final_notice` for 90-day no-response. Remove checklist's `decay_warning_provider` — S7 already covers it. |
| **Analysis** | S7 §11.2 (`11-email-delivery.md`) implements the `listing_decay_warning` template, triggered by `decay_signal_detected` event consumption. It handles the initial decay notification to claimed listing owners. The template is registered in SI §5.2 under Operations Compliance category. S7's handler includes severity-based suppression logic and support ticket suppression — it is a single-severity initial warning, not a multi-stage escalation. |
| **Rationale** | S9 needs a distinct `decay_final_notice` for the 90-day no-response case (different content, different urgency, non-unsubscribable). S9 does NOT need a `decay_warning_provider` template because S7's `listing_decay_warning` IS the provider decay warning. Adding a separate template would create duplicate outreach for the same signal. |

**Template count:** 4 new (not 5). S9 adds: `decay_final_notice`, `enrichment_confirmation_request`, `credit_confirmation_outreach`, `principal_briefing`. Total after S9: **30 templates** (26 + 4).

---

## D7. Notification Type Overlap

| Aspect | Detail |
|--------|--------|
| **Decision** | Use existing `quality_score_changed` and `decay_warning` notification types. Add 2 new types, not 5. |
| **Analysis** | SI §8.1 already registers `quality_score_changed` (line 668) and `decay_warning` (line 671). The checklist proposed 5 new types: `quality_score_improved`, `quality_score_declined`, `decay_warning`, `enrichment_confirmation_due`, `ceremony_action_required`. |
| **Resolution** | `quality_score_changed` already exists — S9 populates the notification with a `direction` field in the `body` content ("`improved`" or "`declined`") rather than splitting into two types. The existing type handles band-crossing directionality through notification content, not type proliferation. `decay_warning` already exists — S7 registered it. S9 reuses it. Two genuinely new types remain: `enrichment_confirmation_due` (annual provider confirmation prompt) and `ceremony_action_required` (ceremony produces recommendation requiring principal action). |

**Notification type count:** 2 new (not 5). Total after S9: **19 notification types** (17 existing + 2 new).

---

## D8. Decision Type Consolidation

| Aspect | Detail |
|--------|--------|
| **Decision** | Keep `proactive_churn_detection` separate from `churn_intervention`. 7 new decision types. |
| **Options** | (A) Reuse existing `churn_intervention` for proactive detection. (B) Separate `proactive_churn_detection` type. |
| **Recommendation** | B |
| **Rationale** | `churn_intervention` (S8, [Source: SI §9.2]) is reactive — triggered by `subscription_ended` event with `origin: "paddle"`. `proactive_churn_detection` (S9) is a periodic batch scan for `engagement_dropping` and `billing_cadence_switch_to_monthly` signals. Different trigger contexts (event-driven vs scheduled), different input shapes (cancellation reason + recent engagement vs 30-day engagement trend + billing cadence change), different output actions (show retention data vs emit `churn_risk_detected`). Conflating them into one type loses the ability to query decision logs by trigger mechanism — "how often does proactive detection fire vs reactive intervention" becomes unqueryable. |

**Decision type count:** 7 new (unchanged). S9 adds: `quality_score_band_evaluation`, `decay_response_evaluation`, `enrichment_cadence_adjustment`, `taxonomy_promotion_evaluation`, `proactive_churn_detection`, `conversion_threshold_adjustment`, `ceremony_outcome_evaluation`. Total after S9: **26 decision types** (19 + 7).

---

## D9. S2-4 Taxonomy Suggestions Assignment

| Aspect | Detail |
|--------|--------|
| **Decision** | S2-4 implementation belongs in §3 (Analytics Pipeline), not a separate section. |
| **Rationale** | S2-4 (data-driven taxonomy suggestions from listing sector distribution) is a subset of the taxonomy gap identification pipeline. The skeleton assigns it to §3 alongside zero-result detection and search term frequency analysis. This is correct — the data source is the same (listing distribution + search patterns), and the consumer is the same (`taxonomy_review_preparation` ceremony in §4). No separate section needed. |

---

## OQ-1. PP-Q5 Resolution (Analytics Tooling)

| Aspect | Detail |
|--------|--------|
| **Question** | PP-Q5: Analytics / product metrics tooling |
| **Resolution** | In-database aggregation via `perception_aggregates` table + scheduled deferred actions. No external analytics service (PostHog, Mixpanel) at V1. |
| **Rationale** | S6 provides event emission infrastructure (`search_performed`, `profile_viewed`, etc.). S9 builds the aggregation pipeline that consumes those events and writes pre-computed aggregates. The `perception_aggregates` table with JSONB `data` column provides flexible per-listing-per-period storage. Scheduled deferred actions (nightly/weekly/monthly depending on aggregate type) handle the computation. External tooling deferred to post-launch operational decision — V1 volume (~1,000 listings, ~5,000 accounts) does not justify the integration cost or data residency complexity. Consistent with S0's "no external monitoring service at V1" decision. |

---

## Schema Impact Summary (for Schema Agent)

| Element | Checklist Default | Decision Outcome | Delta |
|---------|------------------|-------------------|-------|
| `perception_aggregates` structure | Single table + JSONB | Single table + JSONB (D1) | No change |
| Enrichment tracking | Separate table | Separate `enrichment_schedules` table (D2) | Remove 3 listing column amendments |
| Ceremony frequency | Deferred action pattern | Self-perpetuating pattern (D3) | No change |
| `learning_hypotheses` | Static rows | Static rows with mutable columns (D4) | No change |
| `RevenuePerception` | Single type | Single type, optional fields (D5) | No change |
| Listing column amendments | 5 | **2** (`quality_scores.calculatedBy`, `quality_scores.algorithmVersion`) | -3 |
| Email templates (new) | 5 | **4** (remove `decay_warning_provider`) | -1 |
| Email templates (total) | 31 | **30** | -1 |
| Notification types (new) | 5 | **2** (`enrichment_confirmation_due`, `ceremony_action_required`) | -3 |
| Notification types (total) | 22 | **19** | -3 |
| Decision types (new) | 7 | **7** (keep `proactive_churn_detection` separate) | No change |
| Decision types (total) | 26 | **26** | No change |
| New tables | 6 | **6** | No change |
| New pgEnums | 4 | **4** | No change |

---

## Cumulative Snapshot Corrections (for Skeleton Update)

The skeleton §11 states "5 column amendments" — correct to **2**.

The skeleton §9 states "up to 5 new templates" — correct to **4 new, 30 total**.

The skeleton §10 states "5 new notification types" — correct to **2 new, 19 total**.

The skeleton §11 cumulative states "31 email templates" — correct to **30**.

---

## Downstream Flag Notes (for §13)

S10 (Hardening) should address:

1. **Enrichment cadence threshold tuning** — the paid/claimed/unclaimed cadence tiers are hardcoded. S10 should add admin configuration and monitoring for false positive rates.
2. **Quality score dimension weight calibration** — the 5-dimension weights (25/25/20/15/15) are initial estimates. S10 should add A/B testing infrastructure for weight adjustment.
3. **Ceremony schedule optimisation** — 17 new deferred actions create scheduling density. S10 should add stagger logic to prevent ceremony clustering.
4. **Monitoring infrastructure for 17 new deferred actions** — failure alerting, execution duration tracking, ceremony run health dashboard.
5. **Proactive churn detection threshold tuning** — the >30% view decline / 30-day window are initial parameters. S10 should add threshold adjustment based on false positive rate from decision logs.

---

## Authoritative Type Signatures (Phase 1 Decision Summary for Content Agents)

Content agents must use these authoritative type references. Do not redefine — reference the source document.

| Type | Authoritative Source | Content Agents That Must Reference |
|------|---------------------|-----------------------------------|
| `QualityScore` | D&L interface §4 | Agent 1 (authoritative for scoring logic), Agent 6 (consumer invocations) |
| `DecaySignalDetectedEvent` | D&L interface §1.7 / SI §1 `EventPayloadMap` | Agent 2 (emission), Agent 6 (consumer) |
| `QualityScoreChangedEvent` | D&L interface §1.8 / SI §1 `EventPayloadMap` | Agent 1 (emission), Agent 6 (consumer) |
| `ChurnRiskDetectedEvent` | CR interface §1.1 / SI §1 `EventPayloadMap` | Agent 5 (emission), Agent 6 (consumer) |
| `DecisionLog` | SI §9.2 | Agent 1, 2, 4, 5 (all log decisions). Agent 5 authoritative for consumption pattern. |
| `RevenuePerception` | CR interface §6 / S8 §5.4 | Agent 5 (extension). S8's V1 type is authoritative base. |
| `TierLimits` | CR interface §4.1 | Agent 3 (premium feature gating). Import, never copy (P4). |
| `AuthSession` | SI §4.1 | All agents with admin routes. Use `ctx.session?.accountId`, not `ctx.session?.id`. |
| `DeferredActionParamsMap` | SI §2.1 | Schema agent adds 17 entries. Content agents reference, don't redefine. |
| `FeatureAccess` | CR interface §4.2 | Agent 3 (analytics gating). All feature gates via `computeFeatureAccess`. |

**D5 authority split:** Agent 6 (event consumers) is authoritative for consumer handler code. Agents 1–5 are authoritative for the decision logic those consumers invoke. When Agent 6 references a function from Agents 1–5, it calls the function by name with typed parameters — it does not re-implement the logic.
