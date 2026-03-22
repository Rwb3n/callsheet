---
template: work_item
id: CS-WORK-071
title: "Revenue perception and metrics"
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
  - REQ-CS-CR-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/04-revenue-perception.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
acceptance_criteria:
  - "AC-39: computeRevenuePerception returns MRR calculated as SUM of (annualPrice / 12) for annual subscribers and monthlyPrice for monthly subscribers, using the PRICING const for tier-to-price mapping"
  - "AC-40: computeRevenuePerception returns ARR = MRR × 12"
  - "AC-41: tierDistribution returns a Record<SubscriptionTier, number> with counts for all 4 tiers (including free), summing to total active listings"
  - "AC-42: churnRate30d and churnRate90d compute as (churns in period / paid at start of period) × 100, where paid-at-start is approximated as current paid + churns in period. Returns 0 when no paid listings exist"
  - "AC-43: conversionRate30d computes as (conversion events in 30 days / free claimed listings) × 100. Excludes unclaimed listings (accountId IS NULL) from denominator. Returns 0 when no free claimed listings exist"
  - "AC-44: netRevenueRetention computes as ((startMRR + monthly upgrades - monthly downgrades - monthly churn revenue) / startMRR) × 100, with annual revenue deltas from churn_analysis_log divided by 12. Returns 0 when MRR is 0"
  - "AC-45: evaluateRevenueHealth returns critical when churnRate30d > 8% or NRR < 90%; warning when churnRate30d is 3-8%, NRR is 90-100%, or conversionRate30d < 2%; healthy otherwise. Each metric produces an independent signal"
  - "AC-46: commercial.getRevenuePerception route is adminProcedure (returns 403 for non-admin sessions). Returns the full RevenuePerception type"
blocked_by: [CS-WORK-066]
blocks: []
enables: []
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
  - src/domains/commercial/revenue-perception.ts
  - src/domains/commercial/__tests__/revenue-perception.test.ts
  - src/server/routers/commercial.ts
  - src/server/routers/__tests__/revenue-perception.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §5, CR §6 (RevenuePerception type), SI §7.1 (CSR admin)"
  io_profile: "db-read"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-071: Revenue perception and metrics

## Context

Implements the entity's real-time revenue understanding — 8-metric `RevenuePerception` type computed on-demand from `churn_analysis_log` + aggregate `listings` subscription data. No caching at V1 — ~200 paid subscribers makes the aggregate query trivial (<100ms p95).

`computeRevenuePerception` is a pure aggregate query function. `evaluateRevenueHealth` interprets the metrics against thresholds (critical: churnRate30d > 8% OR NRR < 90%; warning: churnRate30d 3–8%, NRR 90–100%, conversionRate30d < 2%; healthy: otherwise). Each metric produces an independent signal — a single invocation may return both critical and warning signals for different metrics.

The `commercial.getRevenuePerception` route is `adminProcedure` — admin dashboard only. Returns the full `RevenuePerception` type for the admin revenue panel.

AC-39 through AC-44 are unit-testable — they test computation logic against known data. AC-45 tests threshold evaluation (unit). AC-46 tests the route integration (admin guard + return type).

This is a read-only work item — `io_profile: "db-read"`. No writes to any table. All data comes from `churn_analysis_log` (written by CS-WORK-073 consumers) and `listings` aggregate queries.

## Deliverables

- [x] `src/domains/commercial/revenue-perception.ts` — `computeRevenuePerception`, `evaluateRevenueHealth`, `RevenuePerception`/`RevenueHealthSignal` types
- [x] `src/domains/commercial/__tests__/revenue-perception.test.ts` — Unit tests for AC-39 through AC-45
- [x] `src/server/routers/commercial.ts` — Add `getRevenuePerception` admin route
- [x] `src/server/routers/__tests__/revenue-perception.integration.test.ts` — Integration test for AC-46

## References

- `3-requirements/slices/slice-08-commercial/04-revenue-perception.md` §5
- `3-requirements/interfaces/commercial-and-revenue.md` §6 — RevenuePerception type, NFR
- `3-requirements/slices/slice-08-commercial/00-router-plan.md` §2.2 — `getRevenuePerception` route spec
