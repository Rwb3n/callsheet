---
template: work_item
id: CS-WORK-082
title: "Event consumers — CR/Ops and matrix wiring"
type: feature
status: done
owner: null
created: 2026-03-06
spawned_by: null
spawned_children: []
chapter: CH-CS-011
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-08
priority: high
effort: medium
traces_to:
  - REQ-CS-INTEL-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/06-event-consumers.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-85: All 15 consumer handlers registered in EVENT_CONSUMER_MATRIX with correct consumer IDs, mode async, and matching domain"
  - "AC-88: subscription_tier_changed consumer with upgrade triggers scheduleEnrichment with paid cadence tier"
  - "AC-90: conversion_milestone consumer records per-gate conversion attribution by correlating event.milestone with most recent conversion_trigger_evaluation decision log"
  - "AC-93: All 15 consumer handlers wrap body in try/catch per SI §1.3; logConsumerError called on error, no exception propagates"
  - "AC-94: EVENT_CONSUMER_MATRIX contains exactly 15 new entries after S9 registration with correct domain and mode async"
  - "AC-98: subscription_ended consumer creates churn_analysis_log entry for ALL origins, branches on paddle for win-back attribution refinement only"
  - "AC-99: winback_delivery_result consumer records event.status against original winback_eligible listingId for attribution refinement"
  - "AC-101: enquiry_responded consumer computes response time delta and updates perception_aggregates with enquiry_response aggregate"
blocked_by: [CS-WORK-075, CS-WORK-080, CS-WORK-081]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-03-06T00:00:00
    exited: 2026-03-08T00:00:00
  - node: done
    entered: 2026-03-08T00:00:00
    exited: null
artifacts:
  - src/domains/intelligence/consumers/subscription-tier-changed.ts
  - src/domains/intelligence/consumers/subscription-ended.ts
  - src/domains/intelligence/consumers/conversion-milestone.ts
  - src/domains/intelligence/consumers/winback-delivery-result.ts
  - src/domains/intelligence/consumers/enquiry-responded.ts
  - src/domains/intelligence/consumers/index.ts
  - src/lib/events/types.ts
  - src/lib/events/singleton.ts
  - src/domains/intelligence/consumers/__tests__/cr-ops-consumers.test.ts
  - src/domains/intelligence/consumers/__tests__/matrix-wiring.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §6 (event consumers — CR/Ops subset + matrix wiring), SI §1.5 (EVENT_CONSUMER_MATRIX registration)"
  io_profile: "db-read-write, deferred-action-schedule"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-082: Event consumers — CR/Ops and matrix wiring

## Context

Implements the remaining 5 of 15 S9 event consumer handlers (CR and Ops intelligence consumers) and performs final `EVENT_CONSUMER_MATRIX` wiring for all 15 S9 consumers. This is the last consumer work item — it adds +15 matrix entries, wires consumers into `src/lib/events/singleton.ts` via `registerIntelligenceConsumers`, and validates AC-85/AC-93/AC-94 (matrix completeness, error handling pattern, entry count).

Consumer list (5 handlers):
1. `subscription_tier_changed` → revenue perception signal, conversion trigger effectiveness, enrichment cadence upgrade on tier upgrade
2. `subscription_ended` → churn analysis entry for ALL origins (paddle/archival/closure), win-back attribution refinement for paddle origin only
3. `conversion_milestone` → per-gate conversion attribution via decision log correlation
4. `winback_delivery_result` → win-back effectiveness tracking (delivered/failed outcome recording)
5. `enquiry_responded` → response time delta computation, `enquiry_response` perception aggregate update

Matrix wiring: adds all 15 intelligence consumer entries to `EVENT_CONSUMER_MATRIX` in `src/lib/events/types.ts`. Updates `src/lib/events/singleton.ts` to register intelligence consumers.

**Type alignment notes:**
- `subscription_tier_changed` consumer calls `scheduleEnrichment` from CS-WORK-077 — must import.
- `conversion_milestone` consumer correlates with `conversion_trigger_evaluation` decision logs — query by `listingId` + most recent entry.
- `subscription_ended` consumer does NOT schedule win-back (S8 handles that). It only records churn analysis + refines attribution.
- `enquiry_responded` consumer handles orphan responses gracefully (returns without error when enquiry record not found).

## Deliverables

- [x] `src/domains/intelligence/consumers/subscription-tier-changed.ts` — Handler for AC-88
- [x] `src/domains/intelligence/consumers/subscription-ended.ts` — Handler for AC-98
- [x] `src/domains/intelligence/consumers/conversion-milestone.ts` — Handler for AC-90
- [x] `src/domains/intelligence/consumers/winback-delivery-result.ts` — Handler for AC-99
- [x] `src/domains/intelligence/consumers/enquiry-responded.ts` — Handler for AC-101
- [x] `src/lib/events/types.ts` — Add 5 intelligence consumer entries to `EVENT_CONSUMER_MATRIX` (+5 = 15 total)
- [x] `src/lib/events/singleton.ts` — Wire `registerIntelligenceConsumers` into `getEventBus()`
- [x] `src/domains/intelligence/consumers/__tests__/cr-ops-consumers.test.ts` — Unit tests for AC-88, AC-90, AC-93, AC-98, AC-99, AC-101
- [x] `src/domains/intelligence/consumers/__tests__/matrix-wiring.integration.test.ts` — Integration tests for AC-85, AC-94

## References

- `3-requirements/slices/slice-09-entity-intelligence/06-event-consumers.md` — Full §6 spec
- `3-requirements/interfaces/shared-infrastructure.md` §1.5 — `EVENT_CONSUMER_MATRIX` registration pattern
- `3-requirements/interfaces/commercial-and-revenue.md` §1.1 — `ChurnRiskDetectedEvent`
