---
template: work_item
id: CS-WORK-089
title: "Autonomy graduation"
type: feature
status: todo
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: null
priority: medium
effort: medium
traces_to:
  - REQ-CS-HARDEN-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md
  - D:/PROJECTS/callsheet/0-strategic-frame/entity-architecture-frame.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-58: evaluateGraduationCriteria('data-and-listings', 'enrichment_cadence_adjustment') returns graduated: false when fewer than 12 decisions in 6-month window (insufficient data)"
  - "AC-59: evaluateGraduationCriteria('data-and-listings', 'enrichment_cadence_adjustment') returns graduated: true when false positive rate is 1.5% and enrichment ROI is 0.7 (both within thresholds)"
  - "AC-60: evaluateCeremonyGraduation returns graduated: false for any recommendation where isFinancial = true, regardless of precedent count"
  - "AC-61: evaluateCeremonyGraduation returns graduated: true when precedentCount >= 50 AND isFinancial = false AND isUserVisible = false"
  - "AC-62: dispatchGraduatedDecision logs graduation_evaluation decision via logDecision (SI §9.2) on every invocation, including graduated: true and graduated: false outcomes"
  - "AC-63: withinGovernanceBounds('enrichment_cadence_adjustment') returns false after 10 auto-applied adjustments in current calendar month, causing 11th to escalate"
  - "AC-64: admin.graduation.override with graduated: false causes subsequent evaluateGraduationCriteria to return graduated: false (manual override takes precedence)"
blocked_by: []
blocks: [CS-WORK-090]
enables: []
queue_position: null
cycle_phase: null
node_history: []
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S10
  spec_sections: "S10 §7 (autonomy graduation), entity-architecture-frame.md §Design Principle 5 (autonomy graduation)"
  io_profile: "db-read-write, decision-log"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-089: Autonomy graduation

## Context

Implements the autonomy graduation evaluation logic and admin override routes. Three graduation capabilities: enrichment cadence adjustment (D&L), ceremony auto-apply (cross-domain), and algorithm rollout (cross-domain, implemented in CS-WORK-090). Each evaluation reads from `decision_logs` to compute metrics (false positive rate, ROI, precedent count) and compares against thresholds. `withinGovernanceBounds` enforces monthly rate limits on auto-applied decisions. All evaluations log `graduation_evaluation` decisions via `logDecision`.

**Type alignment notes:**
- `Domain` type in `src/lib/decisions/logger.ts` is `"data-and-listings" | "operations" | "platform" | "commercial"` — does NOT include `"cross-domain"` or `"intelligence"`. Graduation evaluations are cross-domain per spec. Options: (1) add `"cross-domain"` to `Domain` union, (2) use `additionalContext` for sub-entity tagging. Decision needed at implementation time — document in Context.
- `graduation_evaluation` decision type not yet registered — needs SI §9.2 registration (add to any const/type that enumerates decision types).
- `admin.graduation.*` routes (5 routes) go in new `src/server/routers/admin/graduation.ts`. Wire into `src/server/routers/admin/index.ts`.

## Deliverables

- [ ] `src/domains/intelligence/graduation/evaluate.ts` — `evaluateGraduationCriteria`, `evaluateCeremonyGraduation`, `withinGovernanceBounds`
- [ ] `src/domains/intelligence/graduation/dispatch.ts` — `dispatchGraduatedDecision` (logs decision via `logDecision`)
- [ ] `src/server/routers/admin/graduation.ts` — 3 routes: `status`, `history`, `override` (2 remaining routes in CS-WORK-090)
- [ ] `src/server/routers/admin/index.ts` — Wire graduation router
- [ ] `src/lib/decisions/logger.ts` — Extend `Domain` union to include `"cross-domain"` (or equivalent)
- [ ] `src/domains/intelligence/graduation/__tests__/evaluate.test.ts` — Unit tests for AC-58, AC-59, AC-60, AC-61
- [ ] `src/domains/intelligence/graduation/__tests__/graduation.integration.test.ts` — Integration tests for AC-62, AC-63, AC-64

## References

- `3-requirements/slices/slice-10-hardening/07-autonomy-graduation.md` — §7 full spec
- `3-requirements/slices/slice-10-hardening/00-router-plan.md` — §2 graduation routes
- `0-strategic-frame/entity-architecture-frame.md` §Design Principle 5 — Autonomy graduation criteria
- `3-requirements/interfaces/shared-infrastructure.md` §9.2 — Decision logging
