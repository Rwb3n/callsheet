---
template: work_item
id: CS-WORK-088
title: "End-to-end validation and failure injection"
type: feature
status: done
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: 2026-03-29
priority: medium
effort: large
traces_to:
  - REQ-CS-HARDEN-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/05-concurrent-flows.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-46: Per-step failure injection for all 6 erasure steps: injected failure halts flow, sets step status to 'failed', preserves context, admin retry succeeds"
  - "AC-47: Per-step failure injection for all 6 closure steps: same verification as AC-46"
  - "AC-48: Attempt counter increments on each retry and is persisted to orchestrated_flows"
  - "AC-49: Context JSON serialisation round-trip preserves UUID arrays, ISO8601 timestamps, booleans, and nested objects"
  - "AC-50: Prior completed steps NOT re-executed when admin retries a failed step (orchestrator resumes from currentStep)"
  - "AC-51: processErasure retry with dbTransactionCompleted: true in context skips DB transaction and retries R2 cleanup only"
  - "AC-52: After 3 consecutive failures on same step, auto_escalation_check deferred action is scheduled"
  - "AC-53: Erasure deadline proximity triggers escalation: 7-day alert, 3-day auto-escalate, deadline-passed critical alert"
  - "AC-54: Skip attempt on non-skippable steps (erasure 1/4/5, closure 1/5) rejected server-side with error message"
  - "AC-55: Skip attempt on skippable steps succeeds, sets step status to 'skipped', requires non-empty reason and adminId"
  - "AC-56: Concurrent erasure + closure for same account coexist: closure defers buyer data on compliance hold, processErasure deletes it, compliance_hold_recheck is no-op"
  - "AC-57: compliance_hold_recheck reschedules when hold still active, deletes buyer data when hold cleared"
blocked_by: [CS-WORK-083, CS-WORK-084, CS-WORK-085, CS-WORK-086, CS-WORK-087]
blocks: []
enables: []
queue_position: null
cycle_phase: null
node_history: []
artifacts:
  - src/lib/flows/__tests__/erasure-e2e.integration.test.ts
  - src/lib/flows/__tests__/closure-e2e.integration.test.ts
  - src/lib/flows/__tests__/concurrent-e2e.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S10
  spec_sections: "S10 §6 (end-to-end validation and failure injection), SI §3 (orchestrated flow engine)"
  io_profile: "db-read-write, integration-test-heavy, deferred-action-schedule"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-088: End-to-end validation and failure injection

## Context

Comprehensive integration test suite for both orchestrated flows. Tests per-step failure injection (inject error → verify halt + context preservation → admin retry → verify success), retry behaviour (attempt counter, context round-trip), auto-escalation (3 failures → deferred action), deadline proximity (7-day/3-day alerts), skip constraints (server-side rejection for non-skippable steps, success for skippable), and concurrent flow interaction (erasure + closure coexistence with compliance hold lifecycle).

This work item is primarily test code. AC-46 and AC-47 each cover 6 steps = 12 failure injection scenarios. AC-56/AC-57 are the full concurrent interaction end-to-end test.

**Implementation note:** Some AC overlap with earlier work items' tests (AC-51 ≈ AC-20, AC-56 ≈ AC-40+AC-43). This work item focuses on the holistic end-to-end validation — prior items tested individual components. The test file here exercises the full flow lifecycle from `executeOrchestratedFlow` through completion or escalation.

## Deliverables

- [x] `src/lib/flows/__tests__/erasure-e2e.integration.test.ts` — AC-46, AC-48, AC-49, AC-50, AC-51, AC-52, AC-53
- [x] `src/lib/flows/__tests__/closure-e2e.integration.test.ts` — AC-47, AC-54, AC-55
- [x] `src/lib/flows/__tests__/concurrent-e2e.integration.test.ts` — AC-56, AC-57

## References

- `3-requirements/slices/slice-10-hardening/05-concurrent-flows.md` — §6 end-to-end validation spec
- `3-requirements/interfaces/shared-infrastructure.md` §3 — Orchestrated flow engine, §3.4 auto-escalation
