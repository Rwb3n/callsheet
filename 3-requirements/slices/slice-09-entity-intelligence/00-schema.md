<!-- Part of slice-09-entity-intelligence v2 -->

# Slice 9: Entity Intelligence — Schema Definitions

## 1. New pgEnum Declarations

All enums are standalone named constants per S0 pattern. [Source: S0 §1.2]

```typescript
// src/db/schema/intelligence.ts

export const decaySignalTypeEnum = pgEnum("decay_signal_type", [
  "website_dead",
  "email_bounced",
  "ch_not_active",
  "stale_listing",
  "social_dead",
  "postcode_invalid",
  "domain_expired",
])
// D&L CD §3 — liveness check failure types

export const decaySignalSeverityEnum = pgEnum("decay_signal_severity", [
  "critical",    // blocks search visibility, immediate action required
  "high",        // provider outreach, 14-day resolution window
  "medium",      // quality score impact, 30-day resolution window
  "low",         // minor data quality concern, no notification, quality score only
])
// D&L CD §3 — decay severity escalation thresholds

export const enrichmentCheckTypeEnum = pgEnum("enrichment_check_type", [
  "website",     // HTTP liveness check
  "email",       // SMTP validation
  "ch",          // Companies House API status
  "social",      // social profile URL liveness
  "postcode",    // Postcode validation
  "imdb",        // IMDb profile liveness
])
// D&L CD §3 — per-check-type scheduling

export const ceremonyTypeEnum = pgEnum("ceremony_type", [
  "taxonomy_review",                  // D&L quarterly
  "data_health_review",               // D&L monthly
  "verification_calibration",         // D&L quarterly
  "provider_outreach",                // D&L monthly
  "conversion_funnel_analysis",       // CR monthly
  "revenue_review",                   // CR monthly (revenue_health_extended)
  "multi_listing_pricing",            // CR quarterly
  "sponsored_placement_learning",     // CR monthly
  "operational_health_review",        // Ops monthly
  "contractor_performance_review",    // Ops quarterly
  "principal_briefing",               // Ops monthly
  "learning_hypothesis_analysis",     // Ops monthly (L1–L7)
])
// D&L/CR/Ops CD §5/§9 — all recurring ceremonies
```

---

## 2. New Tables

### 2.1 `enrichment_schedules`

Tracks per-listing enrichment cadence and next check dates. Each listing has one row per check type — 6 rows total per listing when fully scheduled (website, email, ch, social, postcode, imdb). [Source: D2 — separate table decision]

```typescript
export const enrichmentSchedules = pgTable("enrichment_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  checkType: enrichmentCheckTypeEnum("check_type").notNull(),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull(),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastFullCycleAt: timestamp("last_full_cycle_at", { withTimezone: true }),
  cadenceTier: text("cadence_tier").notNull(),  // "paid" | "claimed" | "unclaimed"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Composite unique: (listing_id, check_type) — ensures one row per listing per check type
// Index: (next_check_at) — batch scheduling queries for deferred action handler
// Index: (listing_id) — per-listing enrichment status queries
```

**Composite unique constraint (Drizzle):**

```typescript
// In schema file, after table definition:
export const enrichmentSchedulesUnique = uniqueIndex("enrichment_schedules_listing_check_unique")
  .on(enrichmentSchedules.listingId, enrichmentSchedules.checkType)
```

---

### 2.2 `decay_signals`

Detected decay signals with severity, resolution status, and check-specific details. [Source: checklist §5.1]

```typescript
export const decaySignals = pgTable("decay_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  signalType: decaySignalTypeEnum("signal_type").notNull(),
  severity: decaySignalSeverityEnum("severity").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),  // "auto_healed" | "manually_resolved" | "listing_archived"
  checkDetails: jsonb("check_details").$type<Record<string, unknown>>(),
    // check-type-specific data: HTTP status code, SMTP error, CH API response, etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, resolved_at) — per-listing active signal queries (WHERE resolved_at IS NULL)
// Index: (detected_at DESC) — chronological signal history
// Index: (severity, resolved_at) — admin dashboard critical signal queue (WHERE resolved_at IS NULL)
```

---

### 2.3 `perception_aggregates`

Pre-computed engagement aggregates per listing per period. Single table with `aggregateType` discriminator + JSONB `data` column for type-specific payloads. [Source: D1 — single table decision]

```typescript
export const perceptionAggregates = pgTable("perception_aggregates", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  aggregateType: text("aggregate_type").notNull(),
    // "search_terms" | "viewer_demographics" | "competitor_benchmarking" | "enquiry_response"
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    // Type-specific payload:
    // search_terms: { terms: { term: string, count: number }[], zeroResultTerms: string[] }
    // viewer_demographics: { entityTypes: { type: string, pct: number }[], sectors: {...}, regions: {...} }
    // competitor_benchmarking: { medianViews: number, medianEnquiries: number, medianQualityScore: number, sampleSize: number }
    // enquiry_response: { responseRate: number, medianResponseTime: number, conversionEstimate: number }
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  sampleSize: integer("sample_size").notNull(),  // number of events aggregated
})
// Composite unique: (listing_id, aggregate_type, period_start) — one aggregate per listing per type per period
// Index: (listing_id, aggregate_type, period_start) — per-listing type-filtered lookups
// Index: (computed_at DESC) — freshness queries
```

**Composite unique constraint (Drizzle):**

```typescript
export const perceptionAggregatesUnique = uniqueIndex("perception_aggregates_listing_type_period_unique")
  .on(perceptionAggregates.listingId, perceptionAggregates.aggregateType, perceptionAggregates.periodStart)
```

---

### 2.4 `ceremony_runs`

Ceremony execution log. Stores execution history, inputs hash for idempotency, outputs (ceremony-specific results), and next scheduled run. [Source: D3 — log table only]

```typescript
export const ceremonyRuns = pgTable("ceremony_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ceremonyType: ceremonyTypeEnum("ceremony_type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),  // "running" | "completed" | "failed"
  inputsHash: text("inputs_hash").notNull(),
    // Deterministic hash of ceremony inputs for idempotency checking
  outputs: jsonb("outputs").$type<Record<string, unknown>>(),
    // Ceremony-specific results:
    // taxonomy_review: { promotedTags: string[], zeroResultAggregates: {...} }
    // data_health_review: { qualityDistribution: {...}, decayTrends: {...}, enrichmentCoverage: number }
    // verification_calibration: { autoApproveAccuracy: number, falsePositives: number, falseNegatives: number }
    // principal_briefing: { briefingId: UUID } — FK to principal_briefings
    // learning_hypothesis_analysis: { L1: {...}, L2: {...}, ..., L7: {...} }
  decisionsLogged: integer("decisions_logged").notNull().default(0),
    // Count of decision_logs entries created during this run
  nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
    // Self-perpetuating pattern: ceremony schedules its next run
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (ceremony_type, started_at DESC) — per-ceremony chronological history
// Index: (status) WHERE status = 'running' — detect concurrent runs
// Index: (next_scheduled_at) — upcoming ceremony schedule query
```

---

### 2.5 `learning_hypotheses`

7 static rows (L1-L7) with mutable measurement columns updated monthly. [Source: D4 — static rows decision, Ops CD §8]

```typescript
export const learningHypotheses = pgTable("learning_hypotheses", {
  id: text("id").primaryKey(),  // "L1" through "L7"
  hypothesis: text("hypothesis").notNull(),
    // Human-readable hypothesis statement from Ops CD §8
  measurementQuery: text("measurement_query").notNull(),
    // Description of what is measured (which decision logs, what aggregation)
  currentValue: numeric("current_value"),  // nullable until first measurement
  previousValue: numeric("previous_value"),  // nullable until second measurement
  trend: text("trend"),  // "improving" | "stable" | "declining" | "insufficient_data"
  lastMeasuredAt: timestamp("last_measured_at", { withTimezone: true }),
  confoundWarning: text("confound_warning"),
    // Populated when external factors may invalidate measurement
    // Example: "L2 claim approval rate — manual verification bottleneck detected"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// No indexes needed — 7-row lookup table, always full table scan
```

**7 seed rows (initial migration):**

```typescript
// migrations/YYYYMMDDHHMMSS_seed_learning_hypotheses.ts
await db.insert(learningHypotheses).values([
  {
    id: "L1",
    hypothesis: "Claim rejection rate inversely correlated with onboarding funnel friction",
    measurementQuery: "claim_evaluation decision logs: (rejections / total) vs onboarding_friction decision logs",
  },
  {
    id: "L2",
    hypothesis: "Claim approval rate positively correlated with onboarding taxonomy suggestion quality",
    measurementQuery: "claim_evaluation AUTO_APPROVE vs onboarding_taxonomy_suggestion decision logs",
  },
  {
    id: "L3",
    hypothesis: "Verification upgrade rate increases when client-confirmed credits > 2",
    measurementQuery: "verification_upgrade decision logs: upgrade rate WHERE credits.sourcingMethod = 'client_confirmed' > 2",
  },
  {
    id: "L4",
    hypothesis: "Support ticket category 'feature_gating_confusion' declines when in-product education appears",
    measurementQuery: "support_tickets WHERE category = 'feature_gating_confusion' count over time vs feature_gate_nudge_delivered count",
  },
  {
    id: "L5",
    hypothesis: "Conversion rate from free to standard tier increases when analytics tease fires before 50 views",
    measurementQuery: "conversion_milestone events WHERE trigger = 'analytics_tease' AND views < 50 vs views >= 50",
  },
  {
    id: "L6",
    hypothesis: "Churn rate for claimed but unverified listings 2x higher than verified",
    measurementQuery: "churn_analysis_log WHERE verification_tier = 'claimed' vs 'verified'",
  },
  {
    id: "L7",
    hypothesis: "Human procurement task completion time inversely correlated with task spec clarity score",
    measurementQuery: "task_specs completion time vs clarity score (computed from checklist length, acceptance_criteria word count)",
  },
])
```

---

### 2.6 `principal_briefings`

Monthly Principal Operations Briefing snapshots. [Source: checklist §5.1]

```typescript
export const principalBriefings = pgTable("principal_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  content: jsonb("content").notNull().$type<PrincipalBriefing>(),
    // Structured briefing data:
    // {
    //   operationalHealth: { ... },
    //   revenueHealth: { ... },
    //   learningHypotheses: { L1: {...}, ..., L7: {...} },
    //   ceremonies: { taxonomyReview: {...}, dataHealth: {...}, ... },
    //   escalations: { count: number, critical: [...] }
    // }
  ceremonyRunId: uuid("ceremony_run_id")
    .notNull()
    .references(() => ceremonyRuns.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
    // null until principal_briefing email is sent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (generated_at DESC) — chronological briefing history
// Index: (ceremony_run_id) — FK lookup
// Index: (sent_at) WHERE sent_at IS NULL — unsent briefings admin view
```

---

## 3. Column Amendments to Existing Tables

Per D2, listing column amendments are reduced from 5 to 2. `lastEnrichmentAt`, `nextEnrichmentAt`, `enrichmentTier` are NOT needed — enrichment tracking lives in `enrichment_schedules` table.

### 3.1 `quality_scores` Table Amendments

Two columns enable S9's calibrated quality scoring to coexist with S1's zero-initialised stubs.

```typescript
// src/db/schema/data-and-listings.ts — amend existing qualityScores table

export const qualityScores = pgTable("quality_scores", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  completeness: integer("completeness").notNull().default(0),     // 0-25
  freshness: integer("freshness").notNull().default(0),           // 0-25
  accuracy: integer("accuracy").notNull().default(0),             // 0-20
  richness: integer("richness").notNull().default(0),             // 0-15
  verification: integer("verification").notNull().default(0),     // 0-15
  composite: integer("composite").notNull().default(0),           // 0-100
  lastCalculated: timestamp("last_calculated", { withTimezone: true }).notNull().defaultNow(),

  // S9 additions:
  calculatedBy: text("calculated_by").notNull().default("zero_init"),
    // "zero_init" (S1 placeholder) | "calibrated" (S9 computed)
  algorithmVersion: integer("algorithm_version").notNull().default(1),
    // Enables score version tracking for calibration experiments
})
```

**Migration (alter table):**

```sql
ALTER TABLE quality_scores
  ADD COLUMN calculated_by TEXT NOT NULL DEFAULT 'zero_init',
  ADD COLUMN algorithm_version INTEGER NOT NULL DEFAULT 1;
```

---

## 4. Cumulative Schema Snapshot After S9

### 4.1 Total Counts

- **Total tables:** 45 (39 from S8 + 6 new)
- **Total pgEnums:** 36 (32 from S8 + 4 new)
- **Total deferred actions:** 34 (17 from S8/SI v8 + 17 new — authoritative in SI §2.1)
- **Total email templates:** 30 (26 from S8 + 4 new — authoritative in SI §5.2, per D6)
- **Total notification types:** 19 (17 from S8 + 2 new — authoritative in SI §8.1, per D7)
- **Total decision types:** 26 (19 from S8 + 7 new — authoritative in SI §9.2, per D8)

### 4.2 All Tables (45 total)

Grouped by domain/slice:

**S0: Shared Infrastructure (5 tables)**

1. `deferred_actions`
2. `orchestrated_flows`
3. `notifications`
4. `decision_logs`
5. `event_consumer_errors`

**S1: Data & Listings (14 tables)**

6. `listings`
7. `verifications`
8. `quality_scores` (amended S9)
9. `quality_score_explanations`
10. `engagements`
11. `taxonomy_sectors`
12. `taxonomy_service_areas`
13. `taxonomy_specialisations`
14. `listing_taxonomy_tags`
15. `credits`
16. `media_items`
17. `social_profiles`
18. `accreditations`
19. `pending_enquiries`

**S1: Account & Buyer (8 tables)**

20. `account_profiles`
21. `shortlists`
22. `shortlist_items`
23. `saved_searches`
24. `enquiry_records`
25. `pre_claim_snapshots`
26. `additional_locations`
27. `zero_result_queries`

**S1: Search Infrastructure (2 tables)**

28. `search_synonyms`
29. `controlled_vocabulary`

**S4: Subscriptions (3 tables)**

30. `pending_cancellations`
31. `processed_paddle_events`
32. `grace_periods`

**S6: Buyer Experience (1 table)**

33. `search_history`

**S7: Operations (6 tables)**

34. `support_tickets`
35. `task_specs`
36. `churn_risk_registry`
37. `billing_holds`
38. `compliance_register`
39. `billing_reconciliation_status`

**S8: Commercial (3 tables)**

40. `commercial_state`
41. `churn_analysis_log`
42. `sponsored_impressions`

**S9: Entity Intelligence (6 tables)**

43. `enrichment_schedules`
44. `decay_signals`
45. `perception_aggregates`
46. `ceremony_runs`
47. `learning_hypotheses`
48. `principal_briefings`

### 4.3 All pgEnums (36 total)

- S0: 4 (`deferred_action_status`, `deferred_action_retry`, `deferred_action_failure`, `orchestrated_flow_status`)
- S1: 15 (`entity_type`, `claim_status`, `verification_tier`, `lifecycle_status`, `subscription_tier`, `availability_status`, `travel_willingness`, `budget_tier`, `lead_time`, `credit_format`, `credit_sourcing`, `verification_method`, `shortlist_item_status`, `media_type`, `vocabulary_category`)
- S4: 1 (`media_visibility`)
- S5: 1 (`enquiry_status`)
- S7: 7 (`support_ticket_priority`, `support_ticket_status`, `task_spec_domain`, `task_spec_priority`, `task_spec_status`, `compliance_entry_type`, `compliance_entry_status`)
- S8: 0
- **S9: 4** (`decay_signal_type`, `decay_signal_severity`, `enrichment_check_type`, `ceremony_type`)

**Using cumulative snapshot authoritative count: 32 from S8 + 4 new = 36 pgEnums.**

---

## 5. Schema File Organization

S9 introduces a new schema file for intelligence-related tables.

```
src/db/schema/
├── shared.ts              (S0 — deferred actions, orchestrated flows, notifications, decision logs, event consumer errors)
├── auth.ts                (S0 — Better Auth managed, extended with role field)
├── data-and-listings.ts   (S1 — listings, verifications, quality scores [amended S9], engagements, taxonomy, credits, media, account profiles, shortlists, enquiries, search)
├── operations.ts          (S4, S7 — pending cancellations, task specs, support tickets, compliance, billing holds, churn risk registry, billing reconciliation)
├── commercial.ts          (S4, S8 — grace periods, commercial state, churn analysis log, sponsored impressions)
├── buyer.ts               (S6 — search history)
└── intelligence.ts        (S9 — enrichment schedules, decay signals, perception aggregates, ceremony runs, learning hypotheses, principal briefings)
```

---

## 6. Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v8) | §2.1 `DeferredActionParamsMap` — S9 adds 17 new entries. §9.2 `DecisionType` — S9 adds 7 new types. |
| `data-and-listings.md` (v5 interface) | §1.7 `DecaySignalDetectedEvent` — emitted by S9 decay detection. §1.8 `QualityScoreChangedEvent` — emitted by S9 quality scoring. §4 `QualityScore` — S9 implements calibrated scoring (S1 zero-initialised). |
| `commercial-and-revenue.md` (v3 interface) | §1.1 `ChurnRiskDetectedEvent` — S9 adds proactive emission. §6 `RevenuePerception` — S9 extends with advanced metrics (per D5). |
| `operations.md` (v4 interface) | §5 `LearningHypotheses` L1-L7 — authoritative in Ops CD §8, S9 implements measurement pipeline. |
| `slices/slice-01-data-model.md` (v2) | §1.4 `quality_scores` table — S9 amends with `calculatedBy` and `algorithmVersion` columns. |
| `slices/slice-00-infrastructure.md` (v2) | §2 Deferred action scheduler — S9 uses self-perpetuating pattern for ceremony scheduling. |
| `2-concept-design/data-and-listings.md` (v6) | §3 Quality scoring dimensions, decay detection pipeline, enrichment cadence. §5 Ceremonies. |
| `2-concept-design/commercial-and-revenue.md` (v4) | §6 Revenue perception full specification. |
| `2-concept-design/operations.md` (v6) | §8 Learning hypotheses L1-L7. §9 Ceremonies. |

---

## 7. Migration Notes

### 7.1 Alter Table Migrations (S9)

```sql
-- Add columns to quality_scores
ALTER TABLE quality_scores
  ADD COLUMN calculated_by TEXT NOT NULL DEFAULT 'zero_init',
  ADD COLUMN algorithm_version INTEGER NOT NULL DEFAULT 1;
```

### 7.2 Seed Data Migrations (S9)

```sql
-- Seed learning_hypotheses with 7 static rows L1-L7
INSERT INTO learning_hypotheses (id, hypothesis, measurement_query)
VALUES
  ('L1', 'Claim rejection rate inversely correlated with onboarding funnel friction', 'claim_evaluation decision logs: (rejections / total) vs onboarding_friction decision logs'),
  ('L2', 'Claim approval rate positively correlated with onboarding taxonomy suggestion quality', 'claim_evaluation AUTO_APPROVE vs onboarding_taxonomy_suggestion decision logs'),
  ('L3', 'Verification upgrade rate increases when client-confirmed credits > 2', 'verification_upgrade decision logs: upgrade rate WHERE credits.sourcingMethod = ''client_confirmed'' > 2'),
  ('L4', 'Support ticket category ''feature_gating_confusion'' declines when in-product education appears', 'support_tickets WHERE category = ''feature_gating_confusion'' count over time vs feature_gate_nudge_delivered count'),
  ('L5', 'Conversion rate from free to standard tier increases when analytics tease fires before 50 views', 'conversion_milestone events WHERE trigger = ''analytics_tease'' AND views < 50 vs views >= 50'),
  ('L6', 'Churn rate for claimed but unverified listings 2x higher than verified', 'churn_analysis_log WHERE verification_tier = ''claimed'' vs ''verified'''),
  ('L7', 'Human procurement task completion time inversely correlated with task spec clarity score', 'task_specs completion time vs clarity score (computed from checklist length, acceptance_criteria word count)');
```

---

## 8. Decision Summary (Phase 1 Resolutions)

| Decision | Outcome | Schema Impact |
|----------|---------|---------------|
| D1: `perception_aggregates` structure | Single table with discriminator + JSONB | Table §2.3 |
| D2: Enrichment tracking | Separate `enrichment_schedules` table | Table §2.1, removes 3 listing column amendments |
| D3: Ceremony run frequency | Self-perpetuating deferred action pattern | No separate cadence storage |
| D4: Learning hypothesis table | Static rows with mutable measurement columns | Table §2.5, 7 seed rows |
| D5: `RevenuePerception` extension | Single type with optional fields | No schema change (type extension in CR domain logic) |
| D6: Template overlap resolution | S7's `listing_decay_warning` covers initial warning | 4 new templates (not 5) |
| D7: Notification type overlap | Reuse existing `quality_score_changed` and `decay_warning` | 2 new types (not 5) |
| D8: Decision type consolidation | Keep `proactive_churn_detection` separate | 7 new decision types |

---

## 9. Authoritative for Content Files

| Element | Authoritative Type Source | Schema Agent Output |
|---------|--------------------------|---------------------|
| `DecaySignalDetectedEvent` | D&L §1.7 / SI §1 `EventPayloadMap` | Consumed, not redefined |
| `QualityScoreChangedEvent` | D&L §1.8 / SI §1 `EventPayloadMap` | Consumed, not redefined |
| `ChurnRiskDetectedEvent` | CR §1.1 / SI §1 `EventPayloadMap` | Consumed, not redefined |
| `QualityScore` | D&L interface §4 | `quality_scores` table schema (this document) |
| `DeferredActionParamsMap` | SI §2.1 | 17 new entries (authoritative in SI, listed in checklist §1) |
| `PrincipalBriefing` | Ops CD §9 | `principal_briefings.content` JSONB type (this document) |
| `TierLimits` | CR interface §4.1 | Consumed, not redefined |
| `RevenuePerception` | CR interface §6 / S8 §5.4 | Extended by S9 handlers (no schema change) |

Content agents must reference these authoritative sources. Do not redefine types defined in interface specs or prior slices.
