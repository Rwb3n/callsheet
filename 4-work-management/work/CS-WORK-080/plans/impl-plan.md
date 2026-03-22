# Implementation Plan — CS-WORK-080: Entity learning and commercial intelligence

**IO profile:** db-read-write, event-emit
**Blocked by:** CS-WORK-075 (done), CS-WORK-079 (done) — all clear
**Spec sources:** `05-entity-learning.md` (S9 §5), ceremony infrastructure, existing handlers

---

## AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|------------------|
| AC-70 | `learning_hypothesis_analysis` updates all 7 rows L1-L7 with currentValue, previousValue, trend, lastMeasuredAt | needs-impl | Handler doesn't exist yet |
| AC-71 | `learning_hypothesis_analysis` sets trend `insufficient_data` + confoundWarning `Sample size < 10` when <10 decision_logs | needs-impl | Pure logic in hypothesis-analysis.ts |
| AC-72 | `proactive_churn_detection` detects engagement_dropping when views decline >30% over 30d | needs-impl | Handler doesn't exist yet |
| AC-73 | `proactive_churn_detection` detects billing_cadence_switch_to_monthly within 7 days | needs-impl | Handler doesn't exist yet |
| AC-74 | `proactive_churn_detection` emits churn_risk_detected with CR §1.2 payload when overallRisk >= medium | needs-impl | `ChurnRiskDetectedEvent` + `emitChurnRiskDetected` already exist in churn-intervention.ts |
| AC-75 | `proactive_churn_detection` does NOT emit when overallRisk is low | needs-impl | Pure logic test |
| AC-76 | `proactive_churn_detection` logs proactive_churn_detection decision for every invocation | needs-impl | Decision type not yet registered in decisions/ |
| AC-77 | `conversion_funnel_analysis` computes per-gate friction ratio using Ops getFeatureGateFrictionSummary | partial | Handler exists (079) with per-trigger firing rate analysis. Needs ADDING friction ratio computation via `getFeatureGateFrictionSummary` |
| AC-78 | Friction ratio >5:1 triggers conversion_threshold_adjustment decision with escalation | partial | Handler already logs `conversion_threshold_adjustment` for outlier firing rates. Needs adding 5:1 friction ratio check per spec §5.4 |
| AC-79 | `revenue_health_extended` computes all 8 S9 extension fields, writes to commercial_state | needs-impl | Handler doesn't exist. `commercial_state` table lacks S9 columns — needs JSONB approach |
| AC-80 | `revenue_health_extended` sets cac = 0 (V1 placeholder) | needs-impl | Part of revenue-health-extended logic |
| AC-81 | `sponsored_placement_learning` returns insufficient_data when no decision logs exist | needs-impl | Handler doesn't exist yet |
| AC-82 | `operational_health_review` aggregates L1-L7 summary, ticket trends, task completion rates into OperationalHealthReport | partial | Handler exists (079) with basic report. Needs enriching with full OperationalHealthReport shape per spec §5.6 |
| AC-83 | `contractor_performance_review` returns insufficientData true when no completed task_specs in quarter | pre-satisfied | Handler exists (079) — already returns `{ status: "insufficient_data", reason: "no completed task_specs this quarter" }` at line 79. Needs verification test only. |
| AC-84 | `learning_hypothesis_analysis` logs ceremony run with ceremonyType, outputs JSONB, correct inputsHash | needs-impl | Part of handler implementation |

**Pre-satisfied:** 1 / 15 (AC-83 — needs verification test only)
**Partial:** 3 / 15 (AC-77, AC-78, AC-82 — existing handlers need enhancement)
**Needs implementation:** 11 / 15

---

## Type Alignment

### Already aligned (no action needed)
- `ChurnRiskFactor` includes all 5 values including `engagement_dropping` and `billing_cadence_switch_to_monthly` (`src/lib/events/types.ts:203-208`)
- `ChurnRiskDetectedEvent` payload correct (`types.ts:210-216`)
- `emitChurnRiskDetected()` helper exists in `src/domains/commercial/churn-intervention.ts:164-180`
- `proactive_churn_detection` in `DeferredActionParamsMap` (`scheduler/types.ts:45`)
- All ceremony types registered in `CEREMONY_ACTION_MAP` and `CEREMONY_CADENCE` (infrastructure.ts)
- `learning_hypotheses` table has correct schema with `currentValue`, `previousValue`, `trend`, `confoundWarning`, `lastMeasuredAt` columns

### Needs action
1. **`commercial_state` S9 extension storage:** Table lacks 8 S9 columns. Options:
   - **JSONB column approach (recommended):** Add a single `revenueHealthExtended: jsonb("revenue_health_extended")` column to `commercial_state`. No migration needed if we use the existing `updatedAt` + a new nullable JSONB column via migration. Simpler than 8 separate columns.
   - **Alternative:** 8 separate columns. More DB-native but requires wider migration.
   - **Decision:** Use JSONB column. Single migration, typed via `$type<RevenuePerceptionExtended>()`.

2. **`churn_risk_registry` limitation:** Has `riskLevel: text` but no `riskFactors: ChurnRiskFactor[]`. Spec §5.2.1 references checking `churn_risk_registry` for existing reactive factors. **V1 approach:** Query `churn_risk_registry` for existence (risk detected = at least one factor present), but use `churn_analysis_log` to infer which reactive factors have been logged recently for that listing. This is a pragmatic approximation.

3. **`conversion_funnel_analysis` handler enhancement:** Existing handler (079) analyses conversion trigger firing rates. AC-77/78 require ADDING per-gate friction ratio computation using `getFeatureGateFrictionSummary`. The existing handler already logs `conversion_threshold_adjustment` — need to add the 5:1 friction ratio check alongside the existing firing rate checks.

4. **`operational_health_review` handler enhancement:** Existing handler (079) has basic counts. AC-82 requires enriching to full `OperationalHealthReport` shape with `supportTicketTrends.topCategories`, `taskCompletionRates.avgCompletionDays`, `signalSummary`.

5. **Admin intelligence router:** Needs 2 new routes: `learningHypotheses` (read learning_hypotheses table) and `revenueHealth` (call S8 `computeRevenuePerception` + read S9 extended fields from commercial_state).

---

## Implementation Order

### Phase 1: Schema + Types (foundation)
1. Migration: add `revenue_health_extended` JSONB column to `commercial_state`
2. Define `RevenuePerceptionExtended` type
3. Run `/migration-close`

### Phase 2: Pure Logic Modules (no DB, unit-testable)
4. `src/domains/intelligence/learning/hypothesis-analysis.ts` — L1-L7 measurement queries, `computeTrend()`, `computeConfoundWarning()`, trend determination logic
5. `src/domains/intelligence/learning/proactive-churn.ts` — `computeOverallRisk()`, signal detection types
6. `src/domains/intelligence/commercial/revenue-health-extended.ts` — 8 S9 field computation functions
7. `src/domains/intelligence/commercial/sponsored-learning.ts` — quality floor + fairness cap analysis from decision logs
8. `src/domains/intelligence/commercial/funnel-analysis.ts` — per-gate friction ratio computation (calls `getFeatureGateFrictionSummary`)

### Phase 3: Handlers
9. `src/lib/scheduler/handlers/learning-hypothesis-analysis.ts` — monthly, self-perpetuating
10. `src/lib/scheduler/handlers/proactive-churn-detection.ts` — weekly, self-perpetuating, emits churn_risk_detected
11. `src/lib/scheduler/handlers/revenue-health-extended.ts` — monthly, writes to commercial_state
12. `src/lib/scheduler/handlers/sponsored-placement-learning.ts` — monthly, Pattern #15
13. Enhance `conversion-funnel-analysis.ts` — add friction ratio computation (AC-77/78)
14. Enhance `operational-health-review.ts` — full OperationalHealthReport shape (AC-82)

### Phase 4: Admin Routes
15. Add `learningHypotheses` and `revenueHealth` routes to admin intelligence router

### Phase 5: Tests
16. Unit tests: `src/domains/intelligence/learning/__tests__/hypothesis-analysis.test.ts`
17. Integration tests: `src/lib/scheduler/handlers/__tests__/entity-learning.integration.test.ts`

---

## Deliverables

| File | Status | Action |
|------|--------|--------|
| `src/domains/intelligence/learning/hypothesis-analysis.ts` | NEW | Create — L1-L7 measurement pipeline |
| `src/domains/intelligence/learning/proactive-churn.ts` | NEW | Create — engagement drop + billing cadence detection |
| `src/domains/intelligence/commercial/revenue-health-extended.ts` | NEW | Create — 8 S9 extension fields |
| `src/domains/intelligence/commercial/sponsored-learning.ts` | NEW | Create — quality floor + fairness cap learning |
| `src/domains/intelligence/commercial/funnel-analysis.ts` | NEW | Create — per-gate friction ratios |
| `src/domains/intelligence/operations/health-review.ts` | NEW | Create — OperationalHealthReport type + aggregation |
| `src/domains/intelligence/operations/contractor-review.ts` | NEW | Create — ContractorPerformanceReport type |
| `src/lib/scheduler/handlers/learning-hypothesis-analysis.ts` | NEW | Create |
| `src/lib/scheduler/handlers/proactive-churn-detection.ts` | NEW | Create |
| `src/lib/scheduler/handlers/revenue-health-extended.ts` | NEW | Create |
| `src/lib/scheduler/handlers/sponsored-placement-learning.ts` | NEW | Create |
| `src/lib/scheduler/handlers/conversion-funnel-analysis.ts` | EXISTS | Enhance with friction ratio (AC-77/78) |
| `src/lib/scheduler/handlers/operational-health-review.ts` | EXISTS | Enhance with full report shape (AC-82) |
| `src/lib/scheduler/handlers/contractor-performance-review.ts` | EXISTS | Verify AC-83 (pre-satisfied) |
| `src/domains/intelligence/learning/__tests__/hypothesis-analysis.test.ts` | NEW | Unit tests |
| `src/lib/scheduler/handlers/__tests__/entity-learning.integration.test.ts` | NEW | Integration tests |
| `src/server/routers/admin/intelligence.ts` | EXISTS | Add 2 routes |
| `src/db/schema/commercial.ts` | EXISTS | Add JSONB column |
| Migration file | NEW | drizzle-kit generate |

---

## Key Patterns (from sibling — ceremony-handlers)

- **Ceremony handler shape:** `registerXxxHandler(registry, deps)` → `registry.register(actionName, async (_params) => { ... })`. Deps = `{ db, schedulerDb, decisionLogDb }`.
- **Ceremony infrastructure:** Always use `checkCeremonyIdempotency` → compute → `logCeremonyRun` → `scheduleCeremonyNextRun`. On idempotency skip, still call `scheduleCeremonyNextRun`.
- **Test pattern:** `createMockSchedulerDb()` for scheduler, `createMockDecisionLogDb()` for decisions. `invokeHandler(registry, actionName, params)`. Integration tests use real DB with `resetDb()`.
- **Insufficient data pattern:** Log ceremony run with `{ status: "insufficient_data", reason: "..." }`, then schedule next run and return.

---

## Sub-Agent Delegation Assessment

**Effort:** Large (15 AC, 19 files to create/modify)

**Parallelisable workstreams:**

| Agent | Files | Shared Files |
|-------|-------|-------------|
| Agent 1: Learning + Proactive Churn | `hypothesis-analysis.ts`, `proactive-churn.ts`, `learning-hypothesis-analysis.ts` handler, `proactive-churn-detection.ts` handler, unit tests for AC-71/75 | None with other agents |
| Agent 2: Commercial Intelligence | `revenue-health-extended.ts`, `sponsored-learning.ts`, `funnel-analysis.ts`, `revenue-health-extended.ts` handler, `sponsored-placement-learning.ts` handler | `commercial.ts` schema (migration) |
| Agent 3: Ops Enhancement + Admin Routes | Enhance `operational-health-review.ts`, enhance `conversion-funnel-analysis.ts`, `health-review.ts` domain, `contractor-review.ts` domain, admin routes | `admin/intelligence.ts` |

**Max parallel agents:** 3 — but schema migration in Agent 2 must complete before integration tests. Consider running Agent 2 first for migration, then 1+3 in parallel.

**Main context role:** Orchestrate agents, apply migration, wire integration tests (shared test file), run final `tsc --noEmit` + full test suite.

### Spec Constants Block

```typescript
const SPEC = {
  // Trend determination (§5.1.3)
  TREND_STABLE_THRESHOLD: 0.05, // <5% relative change = stable

  // Confound detection (§5.1.4)
  MIN_SAMPLE_SIZE: 10,
  SEASONAL_LOW_MONTHS: [8, 12], // August, December (0-indexed: 7, 11)

  // Proactive churn detection (§5.2)
  ENGAGEMENT_DROP_THRESHOLD: 0.30, // 30% decline
  CADENCE_SWITCH_WINDOW_DAYS: 7,
  PROACTIVE_CHURN_CADENCE: "weekly", // 7 days

  // Overall risk computation (§5.2.2)
  // 0 factors = low, 1 factor = medium (except payment_at_risk = high), 2+ = high

  // Sponsored placement learning (§5.3)
  QUALITY_FLOOR_EXCLUSION_HIGH: 0.50, // >50% excluded → "lower"
  QUALITY_FLOOR_EXCLUSION_LOW: 0.10, // <10% excluded → "raise"
  FAIRNESS_CAP_ACTIVATION_HIGH: 0.80, // >80% service areas hit cap → "loosen"
  // capActivationRate === 0 → "tighten"

  // Conversion friction (§5.4)
  FRICTION_RATIO_ESCALATION: 5.0, // >5:1 complaints/conversions → escalate

  // Conversion funnel firing rates (existing in 079)
  CONVERSION_FIRING_RATE_LOW: 0.05,
  CONVERSION_FIRING_RATE_HIGH: 0.50,

  // Revenue health extended (§5.5)
  CAC_V1: 0, // £0 — organic only
  LTV_CAP_YEARS: 10, // 120 months if churn rate = 0

  // Insufficient data output shapes
  INSUFFICIENT_DATA_QUALITY_FLOOR: {
    totalEligibleListings: 0,
    excludedByFloor: 0,
    floorHitRate: 0,
    recommendation: "insufficient_data" as const,
  },
  INSUFFICIENT_DATA_FAIRNESS_CAP: {
    totalServiceAreas: 0,
    capsActivated: 0,
    capActivationRate: 0,
    recommendation: "insufficient_data" as const,
  },
} as const
```

### AC-to-Spec Mapping

| AC | Spec Section | Handler | Test Type |
|----|-------------|---------|-----------|
| AC-70 | §5.1.1 | learning_hypothesis_analysis | Integration |
| AC-71 | §5.1.4 Pattern #15 | learning_hypothesis_analysis | Unit |
| AC-72 | §5.2.1 Signal 1 | proactive_churn_detection | Integration |
| AC-73 | §5.2.1 Signal 2 | proactive_churn_detection | Integration |
| AC-74 | §5.2.3 | proactive_churn_detection | Integration |
| AC-75 | §5.2.2 | proactive_churn_detection | Unit |
| AC-76 | §5.2.1 | proactive_churn_detection | Integration |
| AC-77 | §5.4.2 | conversion_funnel_analysis | Unit |
| AC-78 | §5.4.2 CR-X-6 | conversion_funnel_analysis | Unit |
| AC-79 | §5.5.2 | revenue_health_extended | Integration |
| AC-80 | §5.5.2 | revenue_health_extended | Unit |
| AC-81 | §5.3 Pattern #15 | sponsored_placement_learning | Unit |
| AC-82 | §5.6 | operational_health_review | Integration |
| AC-83 | §5.7 Pattern #15 | contractor_performance_review | Unit (pre-satisfied) |
| AC-84 | §5.1.1 | learning_hypothesis_analysis | Integration |
