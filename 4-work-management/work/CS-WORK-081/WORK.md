---
template: work_item
id: CS-WORK-081
title: "Event consumers — D&L perception"
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
effort: medium
traces_to:
  - REQ-CS-INTEL-007
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/06-event-consumers.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-86: profile_viewed consumer deduplicates events: same viewerAccountId + same listingId within 1 hour produces single engagement record"
  - "AC-87: account_closed consumer cancels all pending decay_liveness_check and enrichment_full_cycle deferred actions for every listing in event.listingsArchived, deletes enrichment_schedules rows"
  - "AC-89: contact_attempt consumer with result unreachable creates decay signal via evaluateDecayResponse; reached produces no decay signal"
  - "AC-91: decay_signal_detected consumer calls hasActiveTicket, annotates checkDetails with supportAnnotation if active ticket"
  - "AC-92: listing_created consumer schedules quality_score_recalculation and enrichment schedule creation"
  - "AC-95: profile_edited consumer schedules quality_score_recalculation with listingId and resets freshness timestamp"
  - "AC-96: claim_approved consumer schedules quality recalc (verification +5), updates enrichment to claimed cadence, records L2/L3 hypothesis tracking"
  - "AC-97: shortlist_added consumer records quality calibration perception signal in perception_aggregates"
  - "AC-100: enquiry_submitted consumer invokes aggregateEnquiryAnalytics, recordQualityCalibrationSignal, and updateProviderOutreachPrioritisation"
blocked_by: [CS-WORK-075, CS-WORK-076, CS-WORK-077]
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
  - src/domains/intelligence/consumers/helpers.ts
  - src/domains/intelligence/consumers/profile-viewed.ts
  - src/domains/intelligence/consumers/account-closed.ts
  - src/domains/intelligence/consumers/contact-attempt.ts
  - src/domains/intelligence/consumers/decay-signal-detected.ts
  - src/domains/intelligence/consumers/listing-created.ts
  - src/domains/intelligence/consumers/profile-edited.ts
  - src/domains/intelligence/consumers/claim-approved.ts
  - src/domains/intelligence/consumers/search-performed.ts
  - src/domains/intelligence/consumers/shortlist-added.ts
  - src/domains/intelligence/consumers/enquiry-submitted.ts
  - src/domains/intelligence/consumers/index.ts
  - src/lib/events/types.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §6 (event consumers — D&L perception subset), D&L §1.7 (DecaySignalDetectedEvent), Ops §3.1 (hasActiveTicket)"
  io_profile: "db-read-write, deferred-action-schedule"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-081: Event consumers — D&L perception

## Context

Implements 10 of 15 S9 event consumer handlers — the D&L perception consumers that feed quality scoring, decay detection, and analytics pipelines. Each consumer is async, wraps its body in try/catch per SI §1.3, and uses the `intelligence:{event}:{purpose}` consumer ID format. Consumers invoke domain logic from CS-WORK-076 (quality scoring), CS-WORK-077 (decay/enrichment), and CS-WORK-078 (analytics) — they are thin orchestration layers, not decision-making logic.

Consumer list (10 handlers):
1. `profile_edited` → schedules `quality_score_recalculation`, resets freshness timestamp
2. `listing_created` → schedules initial quality score, creates enrichment schedule
3. `claim_approved` → schedules quality recalc (+5 verification), upgrades enrichment to claimed cadence, L2/L3 tracking
4. `profile_viewed` → deduplication (dedup logic from 076), engagement trend aggregation
5. `search_performed` → search term frequency aggregation (delegates to 078 analytics)
6. `shortlist_added` → quality calibration perception signal
7. `contact_attempt` → unreachable listing detection → decay signal (delegates to 077)
8. `account_closed` → enrichment suspension (cancel deferred actions, delete schedules)
9. `enquiry_submitted` → enquiry analytics, quality signal, outreach prioritisation
10. `decay_signal_detected` → hasActiveTicket annotation

Consumer barrel exports from `src/domains/intelligence/consumers/index.ts`. Matrix entries added but NOT wired into singleton yet (CS-WORK-082 does final wiring + AC-85/AC-93/AC-94 validation).

## Deliverables

- [x] `src/domains/intelligence/consumers/profile-edited.ts` — Handler for AC-95
- [x] `src/domains/intelligence/consumers/listing-created.ts` — Handler for AC-92
- [x] `src/domains/intelligence/consumers/claim-approved.ts` — Handler for AC-96
- [x] `src/domains/intelligence/consumers/profile-viewed.ts` — Handler for AC-86
- [x] `src/domains/intelligence/consumers/search-performed.ts` — Handler (analytics delegation)
- [x] `src/domains/intelligence/consumers/shortlist-added.ts` — Handler for AC-97
- [x] `src/domains/intelligence/consumers/contact-attempt.ts` — Handler for AC-89
- [x] `src/domains/intelligence/consumers/account-closed.ts` — Handler for AC-87
- [x] `src/domains/intelligence/consumers/enquiry-submitted.ts` — Handler for AC-100
- [x] `src/domains/intelligence/consumers/decay-signal-detected.ts` — Handler for AC-91
- [x] `src/domains/intelligence/consumers/index.ts` — Barrel export + `registerIntelligenceConsumers` function
- [x] `src/domains/intelligence/consumers/__tests__/dl-consumers.test.ts` — Unit tests for AC-86, AC-89, AC-92, AC-95, AC-96, AC-97, AC-100
- [x] `src/domains/intelligence/consumers/__tests__/dl-consumers.integration.test.ts` — Integration tests for AC-87, AC-91

## References

- `3-requirements/slices/slice-09-entity-intelligence/06-event-consumers.md` — Full §6 spec
- `3-requirements/interfaces/data-and-listings.md` §1.7 — `DecaySignalDetectedEvent`
- `3-requirements/interfaces/operations.md` §3.1 — `hasActiveTicket` query
