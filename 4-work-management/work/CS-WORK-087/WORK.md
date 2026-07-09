---
template: work_item
id: CS-WORK-087
title: "Concurrent flow interaction"
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
  - REQ-CS-HARDEN-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/05-concurrent-flows.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-40: Erasure and closure flows for the same account each create independent orchestrated_flows rows with separate flowId values"
  - "AC-41: Closure step 4 when checkComplianceHold returns holdExists: true sets buyerDataDeferred: true in context and schedules compliance_hold_recheck with { accountId, flowId } for 7 days"
  - "AC-42: compliance_hold_recheck handler when hold cleared and buyer data exists deletes buyer data (shortlists, shortlist_items, saved_searches, search_history)"
  - "AC-43: compliance_hold_recheck handler when hold cleared and buyer data already deleted by processErasure completes as no-op"
  - "AC-44: compliance_hold_recheck handler when hold still active reschedules for another 7 days"
  - "AC-45: processErasure succeeds when listings already archived by prior closure flow (idempotent anonymisation/deletion)"
blocked_by: [CS-WORK-083, CS-WORK-084, CS-WORK-085, CS-WORK-086]
blocks: [CS-WORK-088]
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
  spec_sections: "S10 §5 (concurrent flow interaction), SI §3 (orchestrated flow engine)"
  io_profile: "db-read-write, deferred-action-schedule, integration-test-heavy"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-087: Concurrent flow interaction

## Context

Validates that erasure and closure flows coexist correctly when both target the same account. Key interaction: closure defers buyer data deletion on compliance hold (DSAR in progress), then processErasure deletes that data as part of erasure, and the eventual `compliance_hold_recheck` finds nothing to delete (no-op). Also validates idempotent behaviour — processErasure must handle already-archived listings gracefully.

AC-41 through AC-44 overlap with AC-33/AC-36/AC-37 from CS-WORK-086 but test the concurrent scenario specifically (both flows active simultaneously). AC-45 tests processErasure idempotency against prior closure state.

**Type alignment notes:**
- Both flow types already registered in `FlowType` union — aligned.
- `compliance_hold_recheck` handler from CS-WORK-086 must support the no-op path (AC-43).
- processErasure from CS-WORK-084 must handle `claimStatus: "unclaimed"` and `accountId: null` gracefully (already-anonymised listings).

## Deliverables

- [ ] `src/lib/flows/__tests__/concurrent-flows.integration.test.ts` — Integration tests for AC-40, AC-41, AC-42, AC-43, AC-44, AC-45

## References

- `3-requirements/slices/slice-10-hardening/05-concurrent-flows.md` — §5 concurrent flow interaction spec
- `3-requirements/interfaces/shared-infrastructure.md` §3 — Orchestrated flow engine
