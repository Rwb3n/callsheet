---
template: work_item
id: CS-WORK-083
title: "GDPR erasure flow wiring"
type: feature
status: done
owner: null
created: 2026-03-28
spawned_by: null
spawned_children: []
chapter: CH-CS-012
arc: hardening
epoch: CS-E1
closed: 2026-03-28
priority: high
effort: medium
traces_to:
  - REQ-CS-HARDEN-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/01-erasure-flow.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-1: ERASURE_FLOW_STEPS contains exactly 6 steps in order: verify_identity, extract_account_data, close_active_tickets, process_erasure, close_dsar_case, emit_erasure_completed"
  - "AC-2: executeOrchestratedFlow('erasure', ...) creates OrchestratedFlowProgress record with flowType: 'erasure', status: 'initiated', and 30-day deadline"
  - "AC-3: Steps 1 (verify_identity), 4 (process_erasure), and 5 (close_dsar_case) have skippable: false. admin.flows.skipStep returns error for these steps"
  - "AC-4: Steps 2 (extract_account_data), 3 (close_active_tickets), and 6 (emit_erasure_completed) have skippable: true. admin.flows.skipStep succeeds with mandatory skipReason text"
  - "AC-5: Step 5 (close_dsar_case) calls Operations closeDSARCase directly — not dispatched via event bus. No EVENT_CONSUMER_MATRIX entry for Ops handling erasure_completed"
  - "AC-6: Step 6 emits erasure_completed event with payload matching ErasureCompletedEvent type: accountHash, senderAccountId, listingIdsAnonymised, listingIdsDeleted, freelancerListingsDeleted, timestamp"
  - "AC-7: ErasureContext serialised to JSON with OrchestratedFlowProgress. After step failure and admin retry, context restored with all fields intact"
  - "AC-8: Auto-escalation fires after 3 consecutive failures on any step. Deadline proximity alerts at 7 days and 3 days remaining"
  - "AC-9: Step 5 updates compliance_register to status: completed for DSAR case and inserts erasure_audit row with deletion/anonymisation counts"
  - "AC-10: After step 5, checkComplianceHold(accountId) returns holdExists: false for DSAR-related hold"
blocked_by: []
blocks: [CS-WORK-084, CS-WORK-087, CS-WORK-088]
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
  spec_sections: "S10 §1 (GDPR erasure flow wiring), SI §3 (orchestrated flow engine), SI §13.1 (erasure flow specification)"
  io_profile: "db-read-write, event-emit, flow-orchestration"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-083: GDPR erasure flow wiring

## Context

Wires the 6-step GDPR erasure flow into the existing orchestrated flow engine (S0/S7). Defines `ERASURE_FLOW_STEPS` as `FlowStepDefinition<ErasureContext>[]` and implements step executors for steps 1-3, 5-6 (step 4 `process_erasure` is implemented in CS-WORK-084). Step 5 calls Ops `closeDSARCase` directly (not via event bus). Step 6 emits `erasure_completed`. The existing `admin.flows.*` routes (S7) serve this flow without modification — skip constraints already defined in `src/server/routers/admin/flows.ts`.

**Type alignment notes:**
- `FlowType` already includes `"erasure"` — aligned.
- `ErasureCompletedEvent` type exists in `src/lib/events/types.ts` — verify payload fields match AC-6.
- `closeDSARCase` exists in `src/domains/operations/compliance/queries.ts` — verify export.
- `checkComplianceHold` exists in `src/domains/operations/compliance/queries.ts` — used by step 5 verification.
- `auto_escalation_check` deferred action already registered with `{ flowId, flowType }` — aligned.
- **SKIP_CONSTRAINTS key mismatch (audit finding):** `admin/flows.ts` has `close_support_tickets` but spec defines step name as `close_active_tickets`. Must rename key to match the `FlowStepDefinition.name` value, otherwise `isStepSkippable()` falls through to `?? true` default making all steps skippable.

## Deliverables

- [x] `src/lib/flows/erasure.ts` — `ERASURE_FLOW_STEPS` definition, `ErasureContext` type, step executors (1-3, 5-6). Step 4 placeholder delegates to CS-WORK-084's `processErasure`.
- [x] `src/lib/flows/erasure.ts` — Step 5 `closeDSARCase` + compliance audit record creation
- [x] `src/lib/flows/erasure.ts` — Step 6 `erasure_completed` event emission
- [x] `src/server/routers/admin/flows.ts` — Rename SKIP_CONSTRAINTS erasure key `close_support_tickets` → `close_active_tickets`
- [x] `src/lib/flows/__tests__/erasure.test.ts` — Unit tests for AC-1, AC-5
- [x] `src/lib/flows/__tests__/erasure.integration.test.ts` — Integration tests for AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10

## References

- `3-requirements/slices/slice-10-hardening/01-erasure-flow.md` — §1 full spec
- `3-requirements/interfaces/shared-infrastructure.md` §3 — Orchestrated flow engine
- `3-requirements/interfaces/shared-infrastructure.md` §13.1 — Erasure flow specification
- `3-requirements/interfaces/operations.md` §3.2 — `checkComplianceHold`, §3.6 — `closeDSARCase`
