---
template: work_item
id: CS-WORK-080
title: "Entity learning and commercial intelligence"
type: feature
status: done
owner: null
created: 2026-03-06
spawned_by: null
spawned_children: []
chapter: CH-CS-011
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-07
priority: high
effort: large
traces_to:
  - REQ-CS-INTEL-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/05-entity-learning.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-70: learning_hypothesis_analysis updates all 7 rows L1-L7 with currentValue, previousValue, trend, lastMeasuredAt"
  - "AC-71: learning_hypothesis_analysis sets trend insufficient_data and confoundWarning Sample size < 10 when fewer than 10 decision_logs"
  - "AC-72: proactive_churn_detection detects engagement_dropping when profile views decline >30% over 30 days"
  - "AC-73: proactive_churn_detection detects billing_cadence_switch_to_monthly when account switches from annual to monthly within 7 days"
  - "AC-74: proactive_churn_detection emits churn_risk_detected with CR §1.2 payload when overallRisk >= medium"
  - "AC-75: proactive_churn_detection does NOT emit churn_risk_detected when overallRisk is low"
  - "AC-76: proactive_churn_detection logs proactive_churn_detection decision for every invocation"
  - "AC-77: conversion_funnel_analysis computes per-gate friction ratio as complaints / conversions using Ops getFeatureGateFrictionSummary"
  - "AC-78: Friction ratio exceeding 5:1 triggers conversion_threshold_adjustment decision with escalation recommendation"
  - "AC-79: revenue_health_extended computes all 8 S9 extension fields and writes to commercial_state"
  - "AC-80: revenue_health_extended sets cac = 0 (V1 placeholder, organic only)"
  - "AC-81: sponsored_placement_learning returns insufficient_data when no sponsored_placement_selection decision logs exist"
  - "AC-82: operational_health_review aggregates L1-L7 summary, support ticket trends, task completion rates into OperationalHealthReport"
  - "AC-83: contractor_performance_review returns insufficientData true when no completed task_specs in quarter"
  - "AC-84: learning_hypothesis_analysis logs ceremony run with ceremonyType learning_hypothesis_analysis, outputs JSONB, correct inputsHash"
blocked_by: [CS-WORK-075, CS-WORK-079]
blocks: [CS-WORK-082]
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-03-06T00:00:00
    exited: 2026-03-07T00:00:00
  - node: done
    entered: 2026-03-07T00:00:00
    exited: null
artifacts:
  - src/domains/intelligence/learning/hypothesis-analysis.ts
  - src/domains/intelligence/learning/proactive-churn.ts
  - src/domains/intelligence/commercial/revenue-health-extended.ts
  - src/domains/intelligence/commercial/sponsored-learning.ts
  - src/domains/intelligence/commercial/funnel-analysis.ts
  - src/domains/intelligence/operations/health-review.ts
  - src/lib/scheduler/handlers/proactive-churn-detection.ts
  - src/lib/scheduler/handlers/revenue-health-extended.ts
  - src/lib/scheduler/handlers/sponsored-placement-learning.ts
  - src/lib/scheduler/handlers/operational-health-review.ts
  - src/lib/scheduler/handlers/contractor-performance-review.ts
  - src/lib/scheduler/handlers/learning-hypothesis-analysis.ts
  - src/server/routers/admin/intelligence.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §5 (entity learning, commercial intelligence), CR §1.1 (churn_risk_detected), CR §6 (RevenuePerception extension), Ops §3.4 (getFeatureGateFrictionSummary), Ops §8 (L1-L7 hypotheses), SI §9.2 (proactive_churn_detection, conversion_threshold_adjustment)"
  io_profile: "db-read-write, event-emit"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-07T00:00:00
---

# CS-WORK-080: Entity learning and commercial intelligence

## Context

Implements entity learning feedback loops and advanced commercial intelligence. 7 deferred action handlers across 3 sub-entities: `learning_hypothesis_analysis` (L1-L7 measurements from decision logs, confound warnings), `proactive_churn_detection` (weekly — engagement_dropping + billing_cadence_switch_to_monthly, producing remaining 2/5 ChurnRiskFactor values S8 deferred), `sponsored_placement_learning` (quality floor calibration + fairness cap tuning from decision logs), `conversion_funnel_analysis` (per-gate friction ratios using Ops `getFeatureGateFrictionSummary` — CR-X-6 5:1 threshold), `revenue_health_extended` (8 S9 extension fields: churnByTier, annualRenewalRate, ltv, cac=0 V1, discountCohortDivergence, downgradeToPaidChurnRatio, avgSubscriptionLifetimeDays, secondaryListingChurnRate), `operational_health_review` (L1-L7 + ticket trends + task rates), `contractor_performance_review` (task completion, quality gate pass rate).

Depends on CS-WORK-079 for ceremony infrastructure (`checkCeremonyIdempotency`, `logCeremonyRun`, `evaluateCeremonyOutcome`). `proactive_churn_detection` emits `churn_risk_detected` event — existing `ChurnRiskDetectedEvent` payload already has `riskFactors: ChurnRiskFactor[]` and `ChurnRiskFactor` already includes `"engagement_dropping"` and `"billing_cadence_switch_to_monthly"`.

**Type alignment notes:**
- `ChurnRiskFactor` already includes all 5 values in `src/lib/events/types.ts`.
- `getFeatureGateFrictionSummary` exists at `src/domains/operations/friction/` — grep for exact export.
- `proactive_churn_detection` already in `DeferredActionParamsMap`.
- `commercial_state` table already exists in `src/db/schema/commercial.ts` — S9 extension fields will be added as new columns or JSONB fields.

Also adds 2 admin intelligence routes: `admin.intelligence.learningHypotheses` and `admin.intelligence.revenueHealth`.

## Deliverables

- [x] `src/domains/intelligence/learning/hypothesis-analysis.ts` — L1-L7 measurement pipeline, confound detection
- [x] `src/domains/intelligence/learning/proactive-churn.ts` — Engagement dropping + billing cadence detection, risk scoring
- [x] `src/domains/intelligence/commercial/revenue-health-extended.ts` — 8 S9 extension field computation
- [x] `src/domains/intelligence/commercial/sponsored-learning.ts` — Quality floor + fairness cap learning from decision logs
- [x] `src/domains/intelligence/commercial/funnel-analysis.ts` — Per-gate friction ratio computation
- [x] `src/domains/intelligence/operations/health-review.ts` — Operational health aggregation (type export only)
- [ ] `src/domains/intelligence/operations/contractor-review.ts` — Absorbed into handler (`contractor-performance-review.ts`)
- [x] `src/lib/scheduler/handlers/proactive-churn-detection.ts` — Weekly handler (self-perpetuating)
- [x] `src/lib/scheduler/handlers/revenue-health-extended.ts` — Monthly handler
- [x] `src/lib/scheduler/handlers/sponsored-placement-learning.ts` — Monthly handler
- [x] `src/lib/scheduler/handlers/operational-health-review.ts` — Monthly handler
- [x] `src/lib/scheduler/handlers/contractor-performance-review.ts` — Quarterly handler
- [x] `src/lib/scheduler/handlers/learning-hypothesis-analysis.ts` — Monthly handler
- [x] `src/domains/intelligence/learning/__tests__/hypothesis-analysis.test.ts` — Unit tests
- [x] `src/lib/scheduler/handlers/__tests__/entity-learning.integration.test.ts` — Integration tests
- [x] `src/server/routers/admin/intelligence.ts` — `learningHypotheses` and `revenueHealth` routes

## References

- `3-requirements/slices/slice-09-entity-intelligence/05-entity-learning.md` — Full §5 spec
- `3-requirements/interfaces/commercial-and-revenue.md` §1.1 — `ChurnRiskDetectedEvent`
- `3-requirements/interfaces/commercial-and-revenue.md` §6 — `RevenuePerception` extension
- `3-requirements/interfaces/operations.md` §3.4 — `getFeatureGateFrictionSummary`
- `3-requirements/interfaces/operations.md` §5 — Learning hypotheses L1-L7
