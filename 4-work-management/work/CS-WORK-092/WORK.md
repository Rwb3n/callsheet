---
id: CS-WORK-092
title: Flow retry execution fix
chapter: CH-CS-015
arc: api-completion
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
source_files:
  - src/lib/flows/engine.ts
  - src/server/routers/admin/flows.ts
extensions:
  io_profile: db-write
  spec_sections: ["SI §3.2", "S7 §6.4"]
acceptance_criteria:
  - id: AC-1
    description: "retryStep calls resumeFlow() after resetting step state, actually re-executing the failed step"
    test_type: integration
  - id: AC-2
    description: "retryStep returns the flow progress result (flowId, status) so admin UI knows outcome"
    test_type: integration
  - id: AC-3
    description: "retryStep works for both erasure and closure flow types, reconstructing correct step definitions"
    test_type: integration
  - id: AC-4
    description: "retryStep for unknown flow type throws BAD_REQUEST (DB pgEnum enforced; code path has null guard)"
    test_type: unit
---

# CS-WORK-092: Flow retry execution fix

## Problem

The `admin.flows.retryStep` route resets step metadata (attempt count, status) and logs a decision but never calls `resumeFlow()` from the flow engine. The step status changes to `in_progress` in the DB but the step's `execute()` function is never invoked. The flow sits in `in_progress` state forever.

## Fix

After resetting the step, reconstruct the step definitions via `buildErasureSteps(deps)` or `buildClosureSteps(deps)` based on `row.flowType`, then call `resumeFlow(flowDb, flowId, steps)` to actually execute the remaining steps.

## Deliverables

- [x] `src/server/routers/admin/flows.ts` — fix `retryStep` to call `resumeFlow()` + `buildStepDefinitions` helper
- [x] `src/server/routers/__tests__/admin-flows.integration.test.ts` — 6 retry tests (AC-1, AC-2, AC-3, state guard, auth guard, decision log)
