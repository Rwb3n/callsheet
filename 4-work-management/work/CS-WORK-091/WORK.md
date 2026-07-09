---
id: CS-WORK-091
title: Erasure and closure flow initiation routes
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-29
effort: small
blocked_by: []
source_files:
  - 4-work-management/arcs/api-completion.md
extensions:
  spec_sections: []
  io_profile: db-write
acceptance_criteria:
  - id: AC-1
    description: "admin.flows.initiateErasure accepts {dsarCaseId, accountId}, calls initiateErasureFlow, returns {flowId, status}"
    test_type: integration
  - id: AC-2
    description: "admin.flows.initiateErasure validates DSAR case exists and has status open/in_progress"
    test_type: integration
  - id: AC-3
    description: "admin.flows.initiateClosureForAccount accepts {accountId}, calls initiateAccountClosure, returns {flowId, status}"
    test_type: integration
  - id: AC-4
    description: "Both routes log a decision (flow_initiation type) with admin accountId"
    test_type: integration
  - id: AC-5
    description: "Both routes reject non-admin callers (adminProcedure guard)"
    test_type: integration
  - id: AC-6
    description: "initiateErasure validates dsarCase.accountId matches input.accountId (prevents wrong-account erasure)"
    test_type: integration
  - id: AC-7
    description: "Both routes reject if a non-terminal flow already exists for same flowType + accountId (prevents duplicate concurrent flows)"
    test_type: integration
deliverables:
  - path: src/server/routers/admin/flows.ts
    action: modify
    description: "Add initiateErasure and initiateClosureForAccount procedures. Widen AdminFlowsRouterDeps."
  - path: src/server/routers/admin/index.ts
    action: modify
    description: "AdminRouterDeps intersection already includes all needed deps (bus, waitUntilFn, payment, schedulerDb, storage via root.ts). No change needed if AdminFlowsRouterDeps is widened correctly."
  - path: src/server/root.ts
    action: modify
    description: "Pass storage to admin router deps (currently missing)."
  - path: src/server/routers/__tests__/admin-flows.integration.test.ts
    action: modify
    description: "Add tests for initiateErasure and initiateClosureForAccount."
context:
  type_alignment_notes: |
    - AdminFlowsRouterDeps needs: bus (InProcessEventBus), waitUntilFn (WaitUntilFn), schedulerDb (SchedulerDb), storage (ObjectStorageService), payment (PaymentService)
    - initiateErasureFlow signature: (deps: ErasureFlowDeps, dsarCaseId: string, accountId: string) => Promise<{flowId, status}>
    - initiateAccountClosure signature: (deps: ClosureFlowDeps, accountId: string) => Promise<{flowId, status}>
    - ErasureFlowDeps = { db, flowDb, bus, waitUntilFn, schedulerDb, storage }
    - ClosureFlowDeps = { db, flowDb, bus, waitUntilFn, payment, schedulerDb }
    - Root.ts already passes bus, waitUntilFn, payment, schedulerDb to admin router. Only storage is missing.
    - Decision type: "flow_initiation" (text column, no migration needed)
    - DSAR case validation: query complianceRegister where id = dsarCaseId AND status IN ('open', 'in_progress')
---

# CS-WORK-091: Erasure and Closure Flow Initiation Routes

## Summary

Add two admin-only tRPC procedures to `admin.flows`: `initiateErasure` and `initiateClosureForAccount`. These allow admins (and later CLI agents) to trigger GDPR erasure and account closure flows directly, rather than relying on user self-service or compliance automation.

## Rationale

The existing admin flows router can manage flows after they start (list, retry, skip, escalate) but cannot initiate them. Erasure flows currently can only be triggered by internal compliance logic, and closure flows only by the user via `settings.initiateAccountClosure`. Admins need direct initiation for GDPR compliance response and account management.
