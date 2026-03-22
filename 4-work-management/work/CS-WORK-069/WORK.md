---
template: work_item
id: CS-WORK-069
title: "Win-back evaluation and delivery"
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
  - REQ-CS-CR-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/02-churn-and-winback.md
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-08-commercial/00-router-plan.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/commercial-and-revenue.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-22: win_back_evaluation deferred action is scheduled at exactly 60 days after subscription_ended only when event.origin === paddle. Not scheduled for origin archival or closure"
  - "AC-23: evaluateWinBack returns no_action with reason listing_not_active when lifecycleStatus !== active, and listing_ownership_changed when current owner differs from cancelledAccountId"
  - "AC-24: evaluateWinBack returns send_email with fully populated mergeFields (subject, body, listingName, and at least one of enquiryCount/viewCount) when engagement thresholds are met (enquiries > 3 OR views > 100)"
  - "AC-25: winback_eligible emission matches EventPayloadMap exactly: { type, listingId, cancelledAccountId, mergeFields: { subject, body, listingName, enquiryCount?, viewCount? }, timestamp } (P1)"
  - "AC-26: Pending win_back_evaluation deferred actions are cancelled on claim_approved (for the reclaimed listing), erasure_completed (for all affected listings), and account_closed (for all listings in listingsArchived)"
  - "AC-27: When a former subscriber resubscribes within 90 days of a win_back_sent log entry, a win_back_converted entry is written to churn_analysis_log with attribution metadata"
  - "AC-28: Every evaluateWinBack invocation produces a DecisionLog entry with decisionType winback_evaluation, capturing inputs and output"
blocked_by: [CS-WORK-066, CS-WORK-068]
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
  - src/domains/commercial/winback-evaluation.ts
  - src/lib/scheduler/handlers/win-back-evaluation.ts
  - src/lib/events/types.ts
  - src/domains/commercial/__tests__/winback-evaluation.test.ts
  - src/domains/commercial/__tests__/winback-evaluation.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "S8 §3, CR §2.4 (evaluateWinBack), SI §2.1 (win_back_evaluation deferred action), SI §5.2 (winback email template)"
  io_profile: "db-write"
version: "2.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-069: Win-back evaluation and delivery

## Context

Implements the win-back deferred action handler and `evaluateWinBack` decision architecture. The `win_back_evaluation` deferred action fires 60 days after `subscription_ended` (paddle origin only). The handler reads the listing's current state (lifecycle, ownership, engagement) and decides: `no_action` (listing inactive or ownership changed), `send_email` (engagement thresholds met), or `no_action` (insufficient engagement).

When `send_email` is returned, the handler emits `winback_eligible` with merge fields for the `winback` email template. The Ops domain picks up the event and delivers via Resend.

AC-26 tests cancellation of pending win-back deferred actions. Three cancellation paths: `claim_approved` (reclaim), `erasure_completed` (all affected listings), `account_closed` (all archived listings). The cancellation logic is called by consumer handlers (CS-WORK-073) but the `cancelWinBackSchedules` function is implemented and exported here.

AC-27 tests win-back attribution — when a former subscriber resubscribes within 90 days of a `win_back_sent` log, a `win_back_converted` entry is written. This is triggered by the `claim_approved` consumer (CS-WORK-073) but the attribution logic lives here.

Depends on CS-WORK-068 because it uses `logChurnEvent` and `churn_analysis_log` patterns.

**Type alignment notes:**
- `WinbackEligibleEvent` may be a stub. Populate: `{ type, listingId, cancelledAccountId, mergeFields: { subject, body, listingName, enquiryCount?, viewCount? }, timestamp }`.
- `winback_evaluation` decision type needs SI §9.2 registration.

## Deliverables

- [x] `src/domains/commercial/winback-evaluation.ts` — `evaluateWinBack`, `cancelWinBackSchedules`, `checkWinBackAttribution`, `logWinBackDecision`, `getEngagementCountersForWinBack`, `WinBackInput`/`WinBackResult` types
- [x] `src/lib/scheduler/handlers/win-back-evaluation.ts` — `registerWinBackEvaluationHandler()` deferred action handler
- [x] `src/domains/commercial/__tests__/winback-evaluation.test.ts` — 10 unit tests (AC-23, AC-24, AC-25)
- [x] `src/domains/commercial/__tests__/winback-evaluation.integration.test.ts` — 11 integration tests (AC-22, AC-25, AC-26, AC-27, AC-28)
- [x] `src/lib/events/types.ts` — `WinbackEligibleEvent` populated with typed `mergeFields` + `timestamp`

## References

- `3-requirements/slices/slice-08-commercial/02-churn-and-winback.md` §3
- `3-requirements/interfaces/commercial-and-revenue.md` §1.3 — `winback_eligible` event
- `3-requirements/interfaces/shared-infrastructure.md` §2.1 — `win_back_evaluation` deferred action
