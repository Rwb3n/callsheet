---
template: work_item
id: CS-WORK-086
title: "Closure data operations"
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
priority: high
effort: medium
traces_to:
  - REQ-CS-HARDEN-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-10-hardening/03-closure-flow.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-31: Step 3 sets senderAccountId = null and senderDisplayName = '[Account closed]' on all enquiry_records where senderAccountId = accountId"
  - "AC-32: Step 3 preserves messageContent on provider-visible enquiry records (providers retain enquiry history without sender identity)"
  - "AC-33: Step 4 calls checkComplianceHold(accountId) — if hold exists, schedules compliance_hold_recheck deferred action with { accountId, flowId } for 7 days and sets context.buyerDataDeferred = true"
  - "AC-34: Step 4 with no compliance hold deletes: shortlists (cascade deletes shortlist_items), saved_searches, search_history for the account"
  - "AC-35: Step 4 per-table deletion — failure deleting saved_searches does not roll back prior shortlists deletion; retry re-attempts remaining tables"
  - "AC-36: compliance_hold_recheck handler re-checks hold after 7 days — if hold cleared, executes executeBuyerDataDeletion and updates flow context"
  - "AC-37: compliance_hold_recheck handler reschedules for another 7 days if hold still active (repeating cycle)"
  - "AC-38: compliance_hold_recheck handler after hold clears updates context.buyerDataDeleted = true in orchestrated_flows record"
  - "AC-39: Step 6 AccountClosedEvent.complianceHoldActive reflects context.buyerDataDeferred — consumers know whether buyer data was fully deleted or deferred"
blocked_by: [CS-WORK-085]
blocks: [CS-WORK-087, CS-WORK-088]
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
  spec_sections: "S10 §4 (closure data operations), Ops §3.2 (checkComplianceHold)"
  io_profile: "db-read-write, deferred-action-schedule"
version: "2.0"
generated: 2026-03-28
last_updated: 2026-03-28T00:00:00
---

# CS-WORK-086: Closure data operations

## Context

Implements closure flow steps 3-4 and the `compliance_hold_recheck` deferred action handler. Step 3 anonymises buyer enquiry data (null sender, preserve message content for providers). Step 4 conditionally deletes buyer data (shortlists, saved_searches, search_history) — deferred if compliance hold active. The `compliance_hold_recheck` handler is the async follow-up: re-checks hold, deletes data when cleared, reschedules if still active. AC-39 ensures the closure event payload reflects deferred state.

**Type alignment notes:**
- `compliance_hold_recheck` already registered in `DeferredActionParamsMap` with `{ accountId: UUID; flowId: UUID }` — aligned.
- `checkComplianceHold` in `src/domains/operations/compliance/queries.ts` — returns `{ holdExists: boolean }`. Verify shape.
- `enquiry_records` table has `senderAccountId` and `senderDisplayName` columns — verify in schema.
- `shortlists`, `saved_searches`, `search_history` tables exist in S6 schema — verify cascade behaviour.
- The handler path convention: `src/lib/scheduler/handlers/compliance-hold-recheck.ts`.

## Deliverables

- [ ] `src/lib/flows/closure.ts` — Step 3 (`anonymiseEnquiryData`) and step 4 (`deleteDeferBuyerData`) implementations wired into CLOSURE_FLOW_STEPS
- [ ] `src/lib/scheduler/handlers/compliance-hold-recheck.ts` — Handler for `compliance_hold_recheck` deferred action
- [ ] `src/lib/flows/__tests__/closure-data-ops.integration.test.ts` — Integration tests for AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39

## References

- `3-requirements/slices/slice-10-hardening/03-closure-flow.md` — §4 closure data operations
- `3-requirements/interfaces/operations.md` §3.2 — `checkComplianceHold` query
- `3-requirements/interfaces/shared-infrastructure.md` §2 — Deferred action scheduler
