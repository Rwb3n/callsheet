---
template: work_item
id: CS-WORK-072
title: "Feature gate friction, low-quality intervention, and refund evaluation"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-010
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-06
priority: high
effort: medium
traces_to:
  - REQ-CS-CR-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/05-support-sections.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-47: evaluateFeatureGateFriction returns critical for any gate with frictionRatio > 0.15 and warning for frictionRatio > 0.05"
  - "AC-48: overallLevel equals the worst severity across all gate assessments (critical > warning > ok)"
  - "AC-49: Each GateFrictionAssessment includes the gate name, ticket count, friction ratio, and a non-empty recommendation string"
  - "AC-50: triggerLowQualityIntervention creates a quality_score_changed notification with the listing's current composite score and a link to the listing's quality page"
  - "AC-51: triggerLowQualityIntervention schedules a check_quality_improvement deferred action with baselineScore equal to the current composite and executeAt 30 days from now"
  - "AC-52: handleCheckQualityImprovement emits churn_risk_detected with riskFactors [low_quality_paid] when the listing's quality score remains below 40 after 30 days"
  - "AC-53: handleCheckQualityImprovement takes no action (no event emitted) when the listing's quality score has improved to 40 or above"
  - "AC-54: handleCheckQualityImprovement takes no action when the listing no longer exists, has no quality score, or has been downgraded to free tier"
  - "AC-55: evaluateRefund returns refundType deny when enquiriesReceivedSinceSubscription > 10, regardless of subscription age"
  - "AC-56: evaluateRefund returns refundType deny when a prior refund was issued within the last 12 months for the same listing"
  - "AC-57: evaluateRefund returns refundType full with amount equal to effectivePriceAtSubscription when subscription age is 30 days or less and no deny guards trigger"
  - "AC-58: evaluateRefund returns refundType partial with a pro-rata amount when subscription age is 31-90 days and no deny guards trigger"
  - "AC-59: evaluateRefund returns refundType deny when subscription age exceeds 90 days"
blocked_by: [CS-WORK-066]
blocks: []
enables: [CS-WORK-073]
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: 2026-03-06T00:00:00
  - node: done
    entered: 2026-03-06T00:00:00
    exited: null
artifacts:
  - src/domains/commercial/feature-gate-friction.ts
  - src/domains/commercial/refund-evaluation.ts
  - src/domains/commercial/low-quality-intervention.ts
  - src/lib/scheduler/handlers/check-quality-improvement.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §6 (friction), §7 (low-quality), §8 (refund), Ops §3.4 (getFeatureGateFrictionSummary), SI §2.1 (check_quality_improvement)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-072: Feature gate friction, low-quality intervention, and refund evaluation

## Context

Three support decision architectures grouped by their shared pattern: domain-internal evaluation functions consumed by other slices' admin routes or event consumers.

**§6 Feature gate friction** (`evaluateFeatureGateFriction`): Consumes Ops' `getFeatureGateFrictionSummary` query result. Per-gate assessment with 3-level severity (ok/warning/critical). Thresholds: >15% critical, >5% warning. S7's `admin.friction.getSummary` route calls this. No tRPC route in S8.

**§7 Low-quality intervention** (`triggerLowQualityIntervention` + `handleCheckQualityImprovement`): Creates a notification on quality drop below 40 for paid subscribers. Schedules `check_quality_improvement` deferred action at 30 days. The handler checks if quality improved; if not, emits `churn_risk_detected` with `low_quality_paid`. The trigger function is called by the `quality_score_changed` consumer (CS-WORK-073).

**§8 Refund evaluation** (`evaluateRefund`): Decision architecture for refund requests — full (≤30 days), partial (31–90 days pro-rata), deny (>90 days, engagement guard, prior refund guard). S7's `admin.refunds.evaluate` route calls this. No tRPC route in S8.

AC-47 through AC-49 are pure function tests (feature gate friction). AC-50 through AC-54 test the quality intervention pipeline including deferred action. AC-55 through AC-59 are pure function tests (refund evaluation).

**Type alignment notes:**
- `check_quality_improvement` already registered in `DeferredActionParamsMap`. Handler needs `registerCheckQualityImprovementHandler()`.
- `refund_evaluation` and `feature_gate_friction_evaluation` decision types need SI §9.2 registration if not present.

## Deliverables

- [x] `src/domains/commercial/feature-gate-friction.ts` — `evaluateFeatureGateFriction`, `GateFrictionAssessment`/`FrictionEvaluationResult` types
- [x] `src/domains/commercial/low-quality-intervention.ts` — `triggerLowQualityIntervention`, quality check scheduling
- [x] `src/domains/commercial/refund-evaluation.ts` — `evaluateRefund`, `RefundEvaluationInput`/`RefundDecision` types
- [x] `src/lib/scheduler/handlers/check-quality-improvement.ts` — `registerCheckQualityImprovementHandler()` deferred action handler
- [x] `src/domains/commercial/__tests__/feature-gate-friction.test.ts` — Unit tests for AC-47, AC-48, AC-49
- [x] `src/domains/commercial/__tests__/refund-evaluation.test.ts` — Unit tests for AC-55 through AC-59
- [x] `src/domains/commercial/__tests__/low-quality-intervention.integration.test.ts` — Integration tests for AC-50 through AC-54

## References

- `3-requirements/slices/slice-08-commercial/05-support-sections.md` §6, §7, §8
- `3-requirements/interfaces/operations.md` §3.4 — `getFeatureGateFrictionSummary` query
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 — `check_quality_improvement` deferred action
