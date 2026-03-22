---
template: work_item
id: CS-WORK-077
title: "Decay detection and enrichment scheduling"
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
priority: critical
effort: large
traces_to:
  - REQ-CS-INTEL-003
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-09-entity-intelligence/02-decay-enrichment.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-22: detectDecay(listingId, website) returns website_dead/high on 4xx/5xx, domain_expired/medium on DNS failure"
  - "AC-23: detectDecay(listingId, email) returns email_bounced when MX lookup returns zero records or SMTP probe invalid"
  - "AC-24: detectDecay(listingId, ch) returns ch_not_active/high when Companies House status !== active, null when active"
  - "AC-25: detectDecay(listingId, social) returns social_dead/medium on 404/5xx, null when all profiles respond 2xx/3xx"
  - "AC-26: detectDecay(listingId, postcode) returns postcode_invalid/medium on terminated/invalid postcode, null for valid"
  - "AC-27: When website_dead and email_bounced both active (unresolved), severity escalates to critical for the second signal"
  - "AC-28: evaluateDecayResponse does not insert new decay_signals row when unresolved signal of same type exists; updates checkDetails"
  - "AC-29: evaluateDecayResponse suppresses notification and does not emit decay_signal_detected when hasActiveTicket returns non-null"
  - "AC-30: scheduleEnrichment creates correct enrichment_schedules rows per tier: 6 paid, 6 claimed, 3 unclaimed (website, email, ch only)"
  - "AC-31: decay_liveness_check handler self-perpetuates at interval matching listing cadenceTier"
  - "AC-32: account_closed consumer cancels all pending decay/enrichment deferred actions and deletes enrichment_schedules for closed account listings"
  - "AC-33: decay_signal_detected event payload matches D&L §1.7 DecaySignalDetectedEvent type"
  - "AC-34: Every evaluateDecayResponse invocation logs decay_response_evaluation decision via logDecision"
  - "AC-35: enrichment_full_cycle handler runs all applicable check types and schedules next full cycle at correct interval"
  - "AC-36: Every evaluateEnrichmentCadenceAdjustment logs enrichment_cadence_adjustment decision"
blocked_by: [CS-WORK-075]
blocks: [CS-WORK-079]
enables: [CS-WORK-081]
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
  - src/domains/data-and-listings/decay/detection.ts
  - src/domains/data-and-listings/decay/liveness-services.ts
  - src/lib/scheduler/handlers/decay-liveness-check.ts
  - src/lib/scheduler/handlers/enrichment-full-cycle.ts
  - src/domains/data-and-listings/consumers/account-closed.ts
  - src/server/routers/admin/intelligence.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S9
  spec_sections: "S9 §2 (decay detection, enrichment), D&L §1.7 (DecaySignalDetectedEvent), Ops §3.1 (hasActiveTicket), SI §9.2 (decay_response_evaluation, enrichment_cadence_adjustment)"
  io_profile: "db-read-write, event-emit, external-api"
version: "2.0"
generated: 2026-03-06
last_updated: 2026-03-06T00:00:00
---

# CS-WORK-077: Decay detection and enrichment scheduling

## Context

Implements the decay detection pipeline and tiered enrichment scheduling. `detectDecay` performs per-check-type liveness verification (website HTTP HEAD, email MX/SMTP, Companies House API, social URL, postcode validation). `evaluateDecayResponse` is the decision architecture: severity escalation (dual website+email → critical), duplicate suppression (update existing unresolved signal), active ticket suppression (Ops `hasActiveTicket` query). Tiered enrichment cadence: paid (weekly liveness, quarterly full cycle), claimed (fortnightly liveness, semi-annual full cycle), unclaimed (monthly liveness, annual full cycle). Self-perpetuating deferred action pattern for both `decay_liveness_check` and `enrichment_full_cycle`. `account_closed` enrichment suspension via P1-compliant `event.listingsArchived`.

External service interfaces: HTTP HEAD (website), DNS MX lookup (email), Companies House API (ch), HTTP GET (social), postcode API (postcode). These are injected dependencies — integration tests use stubs.

**Type alignment notes:**
- `DecaySignalDetectedEvent` already populated in `src/lib/events/types.ts` with correct fields.
- `hasActiveTicket` exists at `src/domains/operations/support/` — grep for exact export location.
- `decay_liveness_check` and `enrichment_full_cycle` already in `DeferredActionParamsMap`.

Also adds 2 admin intelligence routes: `admin.intelligence.decaySignals` and `admin.intelligence.enrichmentStatus`.

## Deliverables

- [x] `src/domains/data-and-listings/decay/detection.ts` — `detectDecay` per-check-type functions, `evaluateDecayResponse` decision architecture, cadence maps
- [x] `src/domains/data-and-listings/decay/liveness-services.ts` — Service interfaces for external liveness checks (website, email, CH, social, postcode)
- [x] `src/domains/data-and-listings/decay/__tests__/detection.test.ts` — 18 unit tests for AC-27, AC-28, AC-29, AC-30, AC-33, AC-34, AC-36
- [x] `src/lib/scheduler/handlers/decay-liveness-check.ts` — Deferred action handler (self-perpetuating per cadence tier)
- [x] `src/lib/scheduler/handlers/enrichment-full-cycle.ts` — Deferred action handler (self-perpetuating)
- [x] `src/lib/scheduler/handlers/__tests__/decay-liveness-check.integration.test.ts` — 8 integration tests for AC-22 through AC-26, AC-31
- [x] `src/lib/scheduler/handlers/__tests__/enrichment-full-cycle.integration.test.ts` — 4 integration tests for AC-35
- [x] `src/domains/data-and-listings/consumers/account-closed.ts` — Enrichment suspension (replaced no-op)
- [x] `src/domains/data-and-listings/consumers/__tests__/account-closed-enrichment.integration.test.ts` — 4 integration tests for AC-32
- [x] `src/server/routers/admin/intelligence.ts` — Added `decaySignals` and `enrichmentStatus` routes

## References

- `3-requirements/slices/slice-09-entity-intelligence/02-decay-enrichment.md` — Full §2 spec
- `3-requirements/interfaces/data-and-listings.md` §1.7 — `DecaySignalDetectedEvent` payload
- `3-requirements/interfaces/operations.md` §3.1 — `hasActiveTicket` query
- `3-requirements/interfaces/shared-infrastructure.md` §9.2 — `decay_response_evaluation`, `enrichment_cadence_adjustment` decision types
