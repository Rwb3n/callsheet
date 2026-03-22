---
template: work_item
id: CS-WORK-079
title: "Ceremony automation"
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
  - REQ-CS-INTEL-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/04-ceremony-automation.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-55: Every ceremony handler schedules its next run as final step via scheduleDeferred (self-perpetuating)"
  - "AC-56: Duplicate ceremony run within same scheduling period prevented by inputsHash check"
  - "AC-57: evaluateCeremonyOutcome logs ceremony_outcome_evaluation decision via SI §9.2 for every actionable recommendation"
  - "AC-58: taxonomy_review_preparation returns insufficient_data when listing_taxonomy_tags is empty, still schedules next run"
  - "AC-59: verification_calibration_review returns insufficient_data when no claim_evaluation decision logs exist for the quarter"
  - "AC-60: conversion_funnel_analysis returns insufficient_data when no conversion_trigger_evaluation decision logs exist for the month"
  - "AC-61: multi_listing_pricing_evaluation returns insufficient_data when fewer than 20 multi-listing paid accounts"
  - "AC-62: contractor_performance_review returns insufficient_data when no task_specs completed in the quarter"
  - "AC-63: multi_listing_pricing_evaluation checks 20+ threshold before computation, first operation after idempotency guard"
  - "AC-64: principal_briefing_generation aggregates outputs from all ceremony types that ran in the month, stores in principal_briefings"
  - "AC-65: principal_briefing_generation sends principal_briefing email with category transactional, sentAt updated on success"
  - "AC-66: credit_confirmation_outreach email sent annually for each client-confirmed credit with verifiedAt 330-365 days ago"
  - "AC-67: taxonomy_promotion_evaluation decision logged for every promotable tag (frequency >= 20, clean mapping)"
  - "AC-68: conversion_threshold_adjustment decision logged when conversion trigger has firing rate below 5% or above 50%"
  - "AC-69: Every ceremony execution logged to ceremony_runs with ceremonyType, status, inputsHash, outputs, decisionsLogged, nextScheduledAt"
blocked_by: [CS-WORK-075, CS-WORK-076, CS-WORK-077]
blocks: [CS-WORK-080]
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
  - src/domains/intelligence/ceremony/infrastructure.ts
  - src/domains/intelligence/ceremony/email-templates.ts
  - src/lib/scheduler/handlers/taxonomy-review-preparation.ts
  - src/lib/scheduler/handlers/data-health-review.ts
  - src/lib/scheduler/handlers/verification-calibration-review.ts
  - src/lib/scheduler/handlers/provider-outreach-ranking.ts
  - src/lib/scheduler/handlers/conversion-funnel-analysis.ts
  - src/lib/scheduler/handlers/multi-listing-pricing-evaluation.ts
  - src/lib/scheduler/handlers/principal-briefing-generation.ts
  - src/lib/scheduler/handlers/credit-confirmation-outreach.ts
  - src/lib/scheduler/handlers/operational-health-review.ts
  - src/lib/scheduler/handlers/contractor-performance-review.ts
  - src/server/routers/admin/intelligence.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §4 (ceremony automation), SI §2.1 (deferred actions), SI §5.2 (principal_briefing, credit_confirmation_outreach, decay_final_notice, enrichment_confirmation_request templates), SI §9.2 (taxonomy_promotion_evaluation, ceremony_outcome_evaluation decision types)"
  io_profile: "db-read-write, email-send"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-079: Ceremony automation

## Context

Implements all 12 recurring ceremony handlers. Each follows the self-perpetuating deferred action pattern (handler schedules its next run as final step). Execution logged to `ceremony_runs` table with idempotency guard via `inputsHash`. Shared ceremony infrastructure: `checkCeremonyIdempotency`, `evaluateCeremonyOutcome` (disposition: auto_apply vs escalate — all escalate at V1 per S9-1/S9-2 downstream flags). Implements 7 D&L ceremonies (taxonomy review, data health, verification calibration, provider outreach), 4 CR ceremonies (conversion funnel, revenue extended stub, multi-listing pricing, sponsored placement stub), and 1 Ops ceremony (principal briefing generation). The actual D&L/CR ceremony bodies reference quality scoring (076) and decay (077) output. `principal_briefing_generation` aggregates all monthly ceremony outputs. Registers 4 email templates: `principal_briefing`, `credit_confirmation_outreach`, `decay_final_notice`, `enrichment_confirmation_request`.

Pattern #15 (insufficient_data): 5 ceremonies return early with `{ status: "insufficient_data" }` but still schedule their next run.

**Type alignment notes:**
- 7 ceremony deferred actions already in `DeferredActionParamsMap`.
- `principal_briefing` and `credit_confirmation_outreach` templates need registration via `registerXxxTemplate()` pattern.
- `ceremony_outcome_evaluation` and `taxonomy_promotion_evaluation` are new decision types — `text` column, no schema change.

Also adds `admin.intelligence.ceremonies` route.

## Deliverables

- [x] `src/domains/intelligence/ceremony/infrastructure.ts` — `checkCeremonyIdempotency`, `logCeremonyRun`, `evaluateCeremonyOutcome`, `scheduleCeremonyNextRun`
- [x] `src/lib/scheduler/handlers/taxonomy-review-preparation.ts` — D&L quarterly ceremony
- [x] `src/lib/scheduler/handlers/data-health-review.ts` — D&L monthly ceremony
- [x] `src/lib/scheduler/handlers/verification-calibration-review.ts` — D&L quarterly ceremony
- [x] `src/lib/scheduler/handlers/provider-outreach-ranking.ts` — D&L monthly ceremony
- [x] `src/lib/scheduler/handlers/conversion-funnel-analysis.ts` — CR monthly ceremony
- [x] `src/lib/scheduler/handlers/multi-listing-pricing-evaluation.ts` — CR quarterly ceremony (20+ threshold)
- [x] `src/lib/scheduler/handlers/principal-briefing-generation.ts` — Ops monthly ceremony (aggregator + email)
- [x] `src/lib/scheduler/handlers/credit-confirmation-outreach.ts` — Annual per-credit email (part of enrichment pipeline)
- [x] `src/domains/intelligence/ceremony/__tests__/infrastructure.test.ts` — Unit tests for AC-55, AC-56, AC-69
- [x] `src/lib/scheduler/handlers/__tests__/ceremony-handlers.integration.test.ts` — Integration tests for AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68
- [x] `src/server/routers/admin/intelligence.ts` — Add `ceremonies` route

## References

- `3-requirements/slices/slice-09-entity-intelligence/04-ceremony-automation.md` — Full §4 spec
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 — Deferred action registry (7 ceremony actions)
- `3-requirements/interfaces/shared-infrastructure.md` §5.2 — Email templates (4 new)
- `3-requirements/interfaces/shared-infrastructure.md` §9.2 — Decision types (2 new: taxonomy_promotion_evaluation, ceremony_outcome_evaluation)
