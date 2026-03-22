---
template: work_item
id: CS-WORK-068
title: "Churn detection and intervention"
type: feature
status: todo
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-010
arc: commercial-and-intelligence
epoch: CS-E1
closed: null
priority: critical
effort: medium
traces_to:
  - REQ-CS-CR-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/02-churn-and-winback.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-14: When subscription_ended fires with origin paddle and reason cancellation, the consumer calls evaluateChurnIntervention with engagement data from getEngagementCounters(listingId) and returns one of show_retention_data | accept | grace_period"
  - "AC-15: When evaluateChurnIntervention returns show_retention_data, the response contains enquiries > 0 OR views > 50 and S5 can render the retention UI. If the provider confirms cancellation, churn is logged and win-back is scheduled"
  - "AC-16: When subscription_ended fires with reason grace_period_expired, the consumer logs churn with reason payment_failure and emits churn_risk_detected with riskFactors containing payment_at_risk"
  - "AC-17: V1 produces 3 of 5 ChurnRiskFactor values: low_quality_paid (§7 quality re-check), payment_at_risk (§10.2 payment failure), quality_declining (§10.5 quality threshold). The remaining 2 (engagement_dropping, billing_cadence_switch_to_monthly) require proactive periodic detection — deferred to S9"
  - "AC-18: churn_risk_detected emission matches EventPayloadMap exactly: { type, listingId, accountId, riskFactors: ChurnRiskFactor[], timestamp }. No extra fields, no missing fields (P1)"
  - "AC-19: pending_cancellation_created is emitted on all 3 trigger paths (voluntary cancellation, account closure, listing archival) with correct CancellationReason value and paddleSubscriptionId from the listing"
  - "AC-20: Every churn path writes to churn_analysis_log with correct eventType churn, reason matching CancellationReason, subscriptionTier from event payload or local state, and annualRevenue as negative value matching PRICING config"
  - "AC-21: Every evaluateChurnIntervention invocation produces a DecisionLog entry with decisionType churn_intervention, capturing inputs and output"
blocked_by: [CS-WORK-066]
blocks: [CS-WORK-069]
enables: [CS-WORK-073]
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §2, CR §2.3 (churn intervention), CR §1.2 (churn_risk_detected), CR §5 (CancellationReason), SI §9.2 (churn_intervention decision type)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-068: Churn detection and intervention

## Context

Implements `evaluateChurnIntervention` — the decision architecture for voluntary cancellation retention. Called by the `subscription_ended` consumer (CS-WORK-073) when `event.origin === "paddle"` and `event.reason === "cancellation"`. Other reason values (`grace_period_expired`, `account_closure`, `paddle_reconciliation`) bypass intervention — the consumer logs churn directly.

The function accepts a 7-field `ChurnInterventionInput` (listing, account, cancellation reason, previous tier, recent engagement, subscription start date, last churn event) and returns one of 3 results: `show_retention_data` (display engagement data to the provider), `accept` (process cancellation), or `grace_period` (14-day grace). Hard constraint: no aggressive retention tactics — one transparent data-driven prompt, then accept.

Also implements churn log writing — all 5 churn paths write to `churn_analysis_log` with `eventType: "churn"`. Exports `logChurnEvent` for reuse by consumer handlers. Exports `ChurnRiskFactor` type and `emitChurnRiskDetected` helper.

AC-14 through AC-16, AC-19, and AC-20 describe behaviour triggered by event consumers. The pure decision logic and log-writing functions are implemented and tested here; the consumer handlers that call them live in CS-WORK-073.

**Type alignment notes:**
- `ChurnRiskDetectedEvent` may be a stub in `src/lib/events/types.ts`. Populate: `{ type, listingId, accountId, riskFactors: ChurnRiskFactor[], timestamp }`.
- `PendingCancellationCreatedEvent` fields must include `paddleSubscriptionId`. Verify against SI §1.2.
- `CancellationReason` type: `"voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"`. May already exist in `src/domains/commercial/subscription/types.ts`.

## Deliverables

- [ ] `src/domains/commercial/churn-intervention.ts` — `evaluateChurnIntervention`, `logChurnEvent`, `ChurnInterventionInput`/`ChurnInterventionResult` types
- [ ] `src/domains/commercial/__tests__/churn-intervention.test.ts` — Unit tests for AC-18
- [ ] `src/domains/commercial/__tests__/churn-intervention.integration.test.ts` — Integration tests for AC-14, AC-15, AC-16, AC-19, AC-20, AC-21
- [ ] `src/lib/events/types.ts` — Populate `ChurnRiskDetectedEvent` fields if stub

## References

- `3-requirements/slices/slice-08-commercial/02-churn-and-winback.md` §2
- `3-requirements/interfaces/commercial-and-revenue.md` §1.2 — `churn_risk_detected` event
- `3-requirements/interfaces/commercial-and-revenue.md` §7 — `ChurnRiskFactor` type
