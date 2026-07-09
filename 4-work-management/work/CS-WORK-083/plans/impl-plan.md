# Implementation Plan — CS-WORK-083: GDPR Erasure Flow Wiring

**IO profile:** db-read-write, event-emit, flow-orchestration
**Blocked by:** None — all clear
**Spec sources:** `slice-10-hardening/01-erasure-flow.md` §1, SI §3 (flow engine), SI §13.1, Ops §3.2/§3.6

---

## AC Summary

| AC | Description (short) | Status | Evidence / Notes |
|----|---------------------|--------|-----------------|
| AC-1 | ERASURE_FLOW_STEPS 6 steps in order | needs-impl | No `src/lib/flows/erasure.ts` exists |
| AC-2 | executeOrchestratedFlow creates record with erasure type + 30-day deadline | needs-impl | Engine exists, needs erasure step definitions wired |
| AC-3 | Steps 1, 4, 5 non-skippable; skipStep errors | needs-impl | Engine `skipStep` checks `skippable` flag already. SKIP_CONSTRAINTS has key mismatch to fix |
| AC-4 | Steps 2, 3, 6 skippable with mandatory skipReason | needs-impl | Same skip engine — needs correct step names |
| AC-5 | Step 5 calls closeDSARCase directly, no matrix entry for Ops | needs-impl | `closeDSARCase` doesn't exist yet. Matrix has `erasure_completed: [{ consumer: "erasureCleanup", domain: "commercial" }]` — no Ops entry (correct) |
| AC-6 | Step 6 emits erasure_completed with correct payload | needs-impl | `ErasureCompletedEvent` type exists and matches AC-6 fields |
| AC-7 | ErasureContext serialised/restored on resume | needs-impl | Engine already serialises `context` to JSONB and restores via `resumeFlow()` — need to verify UUID arrays survive |
| AC-8 | Auto-escalation after 3 failures; deadline alerts at 7d/3d | partial | `CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD = 3` + escalation logic in `runSteps`. Deadline proximity alerts not implemented (deferred action scheduling) |
| AC-9 | Step 5 updates compliance_register + inserts erasure_audit row | needs-impl | `closeDSARCase` doesn't exist |
| AC-10 | After step 5, checkComplianceHold returns holdExists: false | needs-impl | `checkComplianceHold` exists and works. Need step 5 to close the DSAR case → status changes from "open" to "completed" → hold clears |

**Pre-satisfied:** 0 / 10
**Partially satisfied:** 1 / 10 (AC-8 — escalation logic exists, deadline alerts need wiring)
**Needs implementation:** 9 / 10

---

## Type Alignment

1. **SKIP_CONSTRAINTS erasure key mismatch (audit finding):** `admin/flows.ts` line 31 has `close_support_tickets` but spec step name is `close_active_tickets`. Must rename. Closure flow keys are internally consistent (flows.ts matches settings.ts) — spec-drift issue deferred to CS-WORK-085.
2. **`FlowStepDefinition` type:** Matches spec — `name`, `domain`, `execute`, `skippable`. Aligned.
3. **`ErasureCompletedEvent` type (types.ts:96-104):** Matches AC-6 fields exactly. Aligned.
4. **`closeDSARCase` function:** Does not exist — must create in `src/domains/operations/compliance/queries.ts`.
5. **`complianceEntryTypeEnum` MISMATCH:** Enum has `"erasure"` but spec requires `"erasure_audit"` for the audit record. Must add `"erasure_audit"` to the enum — prevents query pollution in `getDSARStatus` which filters on `type: "erasure"`. Requires schema migration.
6. **`complianceEntryStatusEnum` values:** `["open", "in_progress", "completed", "overdue"]` — has `"completed"` for closing DSAR case. Aligned.
7. **`EVENT_CONSUMER_MATRIX.erasure_completed`:** Has `[{ consumer: "erasureCleanup", domain: "commercial", mode: "async" }]`. No Ops entry — correct per AC-5.
8. **`auto_escalation_check` deferred action:** Type registered in scheduler with `{ flowId, flowType }` params. **Handler does not exist** — must implement for AC-8 deadline proximity alerts (7d/3d).

---

## Implementation Order

### 1. Schema migration: add `"erasure_audit"` to complianceEntryTypeEnum
Add value to `src/db/schema/operations.ts` pgEnum. Run `drizzle-kit generate` + `drizzle-kit push`. Required before closeDSARCase can insert audit rows.

### 2. Fix SKIP_CONSTRAINTS key mismatch (admin/flows.ts)
Rename `close_support_tickets` → `close_active_tickets` in the erasure section. Only fix erasure keys — closure keys are internally consistent (flows.ts matches settings.ts); spec-drift deferred to CS-WORK-085.

### 3. Create ErasureContext type + ERASURE_FLOW_STEPS (src/lib/flows/erasure.ts)
- Define `ErasureContext` type per spec §1.2
- Define `ERASURE_FLOW_STEPS` as a builder function `buildErasureSteps(deps)` returning `FlowStepDefinition<ErasureContext>[]` — same pattern as `buildClosureSteps(deps)` in settings.ts
- Step executors for steps 1-3, 5-6 (step 4 placeholder delegates to CS-WORK-084)
- `initiateErasureFlow(deps)` function per spec §1.5, schedules deadline proximity deferred actions
- Export from `src/lib/flows/index.ts`

### 4. Implement closeDSARCase (src/domains/operations/compliance/queries.ts)
- Add `closeDSARCase` function per Ops §3.6
- Updates compliance_register SET status → "completed", completedAt → now() WHERE id = dsarCaseId
- Inserts new compliance_register row with type: "erasure_audit", details JSONB containing deletion/anonymisation data
- Hold clearing is automatic — checkComplianceHold queries for status: "open", which no longer matches

### 5. Implement auto_escalation_check handler (src/lib/scheduler/handlers/)
- ~40 lines. Reads orchestrated_flows by flowId, checks deadline proximity
- 7 days remaining → admin notification
- 3 days remaining → auto-escalate (flow status → "escalated")
- Deadline passed → critical alert
- Self-perpetuates with 24h delay while flow is active

### 6. Wire deadline proximity scheduling in initiateErasureFlow
- Schedule `auto_escalation_check` at 7-day and 3-day marks from deadline
- Uses `scheduleDeferredAction` with calculated executeAt dates

### 7. Unit tests (src/lib/flows/__tests__/erasure.test.ts)
- AC-1: ERASURE_FLOW_STEPS has 6 steps in correct order with correct names
- AC-5: Step 5 executor calls closeDSARCase directly (mock verification), no Ops in EVENT_CONSUMER_MATRIX for erasure_completed

### 8. Integration tests (src/lib/flows/__tests__/erasure.integration.test.ts)
- AC-2: executeOrchestratedFlow creates flow record with erasure type + 30-day deadline
- AC-3: Non-skippable steps (1, 4, 5) reject skipStep
- AC-4: Skippable steps (2, 3, 6) accept skip with mandatory reason
- AC-6: Step 6 emits correct erasure_completed event payload
- AC-7: Context serialisation round-trip with UUID arrays after failure + resume
- AC-8: Auto-escalation after 3 failures + deadline proximity scheduling verified
- AC-9: Step 5 updates compliance_register to completed + inserts erasure_audit row
- AC-10: checkComplianceHold returns holdExists: false after step 5

---

## Deliverables

- [ ] `src/db/schema/operations.ts` — **EDIT.** Add `"erasure_audit"` to complianceEntryTypeEnum
- [ ] `src/lib/flows/erasure.ts` — **NEW.** ErasureContext type, buildErasureSteps(deps), step executors 1-3/5-6, step 4 placeholder, initiateErasureFlow()
- [ ] `src/lib/flows/index.ts` — **EDIT.** Re-export erasure types and initiateErasureFlow
- [ ] `src/domains/operations/compliance/queries.ts` — **EDIT.** Add closeDSARCase function
- [ ] `src/lib/scheduler/handlers/auto-escalation-check.ts` — **NEW.** Deadline proximity + escalation handler
- [ ] `src/server/routers/admin/flows.ts` — **EDIT.** Fix SKIP_CONSTRAINTS erasure key: `close_support_tickets` → `close_active_tickets`
- [ ] `src/lib/flows/__tests__/erasure.test.ts` — **NEW.** Unit tests (AC-1, AC-5)
- [ ] `src/lib/flows/__tests__/erasure.integration.test.ts` — **NEW.** Integration tests (AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10)

---

## Key Patterns (from sibling — settings.ts closure flow)

1. **Step definitions built inline** with `FlowStepDefinition<ClosureContext>[]`. Each step has `name`, `domain`, `execute`, `skippable`. Execute is an async function taking context.
2. **Flow initiation** calls `executeOrchestratedFlow(deps.flowDb, { flowType, triggeredBy, steps, initialContext, deadline })`.
3. **Context mutation** — steps mutate the context object directly (e.g., `ctx.listingsArchived.push(listing.id)`). Engine serialises after each step.
4. **FlowDb injection** — production uses Drizzle-backed FlowDb; tests use `createMockFlowDb()` from `engine.test.ts`.
5. **No dep injection in step executors** — closure flow builds steps inside a function that closes over `deps`. Erasure flow should do the same for `db`, `bus`, etc.

---

## Deps Required by Erasure Steps

The erasure step executors need:
- `db: Db` — for compliance_register queries, support ticket queries, account data extraction
- `bus: InProcessEventBus` — for step 6 event emission
- `waitUntilFn: WaitUntilFn` — for async event consumers triggered by step 6

These must be injected via a builder function pattern (like closure flow's `buildClosureSteps(deps)`).

---

## Deadline Proximity Alerts (AC-8)

The existing `compliance-schedule-check.ts` handler runs daily and scans compliance_register for approaching deadlines. It already handles DSAR deadline proximity. The erasure flow's 30-day deadline is stored in `orchestrated_flows.deadline`. Need to check if `compliance-schedule-check` also scans orchestrated_flows deadlines, or if this needs separate wiring via `auto_escalation_check` deferred action scheduling at flow creation time.

**Decision:** Schedule `auto_escalation_check` deferred action at flow initiation for the 7-day and 3-day marks. The handler already exists and checks consecutive failure counts. Extend to also check deadline proximity.
