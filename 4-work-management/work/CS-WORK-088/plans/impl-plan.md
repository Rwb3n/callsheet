## Implementation Plan — CS-WORK-088: End-to-end validation and failure injection

**IO profile:** db-read-write, integration-test-heavy, deferred-action-schedule
**Blocked by:** CS-WORK-083 done, 084 done, 085 done, 086 done, 087 done — all clear
**Spec sources:** `05-concurrent-flows.md` (§5–§6), `shared-infrastructure.md` (§3)

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-46 | Per-step failure injection for all 6 erasure steps | needs-impl | 083 tests individual steps but not systematic per-step failure/retry cycle |
| AC-47 | Per-step failure injection for all 6 closure steps | needs-impl | 085 tests individual steps but not systematic per-step failure/retry cycle |
| AC-48 | Attempt counter increments on each retry and persists | partial | `engine.test.ts` AC-20 unit test covers 1→2→3, need integration-level |
| AC-49 | Context JSON round-trip (UUIDs, timestamps, booleans, nested) | pre-satisfied | `erasure.integration.test.ts` AC-7 covers this exactly |
| AC-50 | Prior completed steps NOT re-executed on admin retry | partial | `engine.test.ts` AC-15 unit-level, need integration with call counters |
| AC-51 | processErasure retry with dbTransactionCompleted skips DB | partial | Process-erasure has the `if (!ctx.dbTransactionCompleted)` guard, needs holistic test |
| AC-52 | After 3 failures, auto_escalation_check deferred action scheduled | pre-satisfied | Engine escalation built-in (AC-20), `erasure.integration.test.ts` AC-8 |
| AC-53 | Erasure deadline proximity: 7d alert, 3d escalate, deadline-passed critical | partial | AC-8 tests 2-day handler, need full 3-tier lifecycle test |
| AC-54 | Non-skippable step skip rejected (erasure 1/4/5, closure 1/5) | pre-satisfied | AC-3 + AC-29 in existing tests |
| AC-55 | Skippable step skip succeeds with non-empty reason + adminId | pre-satisfied | AC-4 in erasure, AC-29 in closure |
| AC-56 | Concurrent erasure+closure coexist, compliance hold lifecycle | pre-satisfied | AC-40–AC-45 in concurrent-flows tests |
| AC-57 | compliance_hold_recheck reschedules/deletes buyer data | pre-satisfied | AC-42, AC-43, AC-44 in concurrent-flows tests |

**Pre-satisfied:** 7/12 (AC-49, AC-52, AC-54, AC-55, AC-56, AC-57, and partial AC-53)
**Needs implementation:** 3/12 (AC-46, AC-47, AC-48)
**Partial (need holistic integration wrapping):** 2/12 (AC-50, AC-51)

### Key Finding

This work item is "end-to-end validation" — holistic tests that exercise the full flow lifecycle through `executeOrchestratedFlow`. Most individual behaviors are already verified by CS-WORK-083–087 tests. The 088 value is:

1. **Per-step failure injection (AC-46, AC-47):** 12 systematic tests confirming every step halts correctly, preserves context, and succeeds on retry. This is the primary new content.
2. **Retry mechanics at integration level (AC-48, AC-50, AC-51):** Engine-level behaviors verified against real DB and real flow step implementations.
3. **Deadline proximity full lifecycle (AC-53):** 3-tier escalation test (7d → 3d → deadline-passed).
4. **Verification wrappers for pre-satisfied ACs:** AC-49, AC-52, AC-54, AC-55, AC-56, AC-57 — thin tests that reference or extend existing coverage.

### Implementation Strategy

Given 7/12 ACs are pre-satisfied by existing tests, the implementation is:

1. **`erasure-e2e.integration.test.ts`** — New file. AC-46 (6 per-step failure injection), AC-48 (attempt counter), AC-49 (verification reference to AC-7), AC-50 (prior steps not re-executed), AC-51 (D2 sub-step skip), AC-52 (3-failure escalation verification), AC-53 (deadline proximity).
2. **`closure-e2e.integration.test.ts`** — New file. AC-47 (6 per-step failure injection), AC-54 (non-skippable rejection), AC-55 (skippable with reason + adminId).
3. **`concurrent-e2e.integration.test.ts`** — New file. AC-56 (verification reference to existing AC-40+AC-43), AC-57 (verification reference to existing AC-42+AC-44).

### Test Architecture

**Failure injection pattern:** Each step test needs to create a flow, make it fail at a specific step, verify halt, then retry and verify success. The challenge: erasure and closure steps call real DB and the event bus, but some steps call external services (Ops identity verification, Paddle API, R2). These are already injected via the deps bag, so we control failure by overriding dep methods.

**For erasure steps:**
- Step 1 (verify_identity): Make DSAR case status "open" → step throws "Identity verification not yet complete". Fix: update status to "in_progress".
- Step 2 (extract_account_data): Delete the DSAR case row → step throws "constraint violation". Fix: re-insert.
- Step 3 (close_active_tickets): Inject by pre-deleting listing FK target. Fix: re-create.
- Step 4 (process_erasure): Use failing storage → R2 fails. Fix: use working storage.
- Step 5 (close_dsar_case): Delete DSAR case → closeDSARCase fails. Fix: re-create.
- Step 6 (emit_erasure_completed): Inject bus error → step fails. Fix: use working bus.

**For closure steps:**
- Step 1 (archive_listings): Create listing with FK violation target. Or: simpler — use a bus that throws on listing_archived emission.
- Step 2 (cancel_paddle_subscriptions): Payment service throws. Fix: reset to working.
- Step 3 (anonymise_enquiry_data): Pre-condition issue (enquiry record FK). Or: throw in DB update.
- Step 4 (delete_defer_buyer_data): checkComplianceHold query failure. Or: DB connection issue.
- Step 5 (deactivate_account): accountProfiles update failure.
- Step 6 (emit_account_closed): Bus error.

**Better approach:** Use the existing flow engine directly. Instead of injecting failures into deps (complex wiring), create step definitions where specific steps throw errors via a controllable flag. This matches the spec's `MockAdapter` pattern (§6.7) while using the real `executeOrchestratedFlow` + `resumeFlow` + `FlowDb` against real DB.

```typescript
// Controllable step factory
function makeControllableStep<T>(
  def: FlowStepDefinition<T>,
  shouldFail: { value: boolean },
): FlowStepDefinition<T> {
  return {
    ...def,
    execute: async (ctx) => {
      if (shouldFail.value) throw new Error(`Injected failure: ${def.name}`)
      return def.execute(ctx)
    },
  }
}
```

This wraps the real step executors (from `buildErasureSteps`/`buildClosureSteps`) with a failure toggle. The test:
1. Sets `shouldFail.value = true` for step N
2. Runs `executeOrchestratedFlow` → fails at step N
3. Verifies halt, step status, context, prior steps untouched
4. Sets `shouldFail.value = false`
5. Runs `resumeFlow` → step N succeeds
6. Verifies attempt counter = 2, step status = completed

This exercises the REAL orchestrator, REAL DB persistence, and REAL step implementations (when not overridden by the failure flag).

### Implementation Order

1. Create helper: `makeControllableStep()` and `makeControllableSteps()` wrapper — local to test files
2. Write `erasure-e2e.integration.test.ts`:
   - AC-46: 6 per-step failure/retry tests using controllable erasure steps
   - AC-48: Attempt counter via 3-attempt cycle
   - AC-49: Verification (thin reference to AC-7's existing coverage + additional nested object test)
   - AC-50: Call counter verification — prior steps not re-executed on retry
   - AC-51: processErasure D2 sub-step skip via context injection
   - AC-52: 3-failure auto-escalation (thin test — engine behavior, but against real DB)
   - AC-53: Deadline proximity lifecycle (3 tiers)
3. Write `closure-e2e.integration.test.ts`:
   - AC-47: 6 per-step failure/retry tests using controllable closure steps
   - AC-54: Non-skippable step skip rejection (erasure 1/4/5, closure 1/5)
   - AC-55: Skippable step skip (reason required, adminId recorded)
4. Write `concurrent-e2e.integration.test.ts`:
   - AC-56: Full concurrent lifecycle test (erasure during closure, compliance hold, processErasure deletes, recheck no-op)
   - AC-57: Recheck reschedule when hold active, delete when cleared

### Deliverables

- [ ] `src/lib/flows/__tests__/erasure-e2e.integration.test.ts` — AC-46, AC-48, AC-49, AC-50, AC-51, AC-52, AC-53
- [ ] `src/lib/flows/__tests__/closure-e2e.integration.test.ts` — AC-47, AC-54, AC-55
- [ ] `src/lib/flows/__tests__/concurrent-e2e.integration.test.ts` — AC-56, AC-57

### Key Patterns (from sibling tests)

- **Test DB setup:** `getTestDb()`, `resetDb()`, `closeTestDb()` from `@/db/test-utils`. `seedTestUser(db, id)` for account creation.
- **Flow DB:** `createFlowDb(db)` from `test-fixtures` — wraps Drizzle with FlowDb interface.
- **Scheduler DB:** `createSchedulerDb(db)` from `test-fixtures`.
- **Event bus:** `createTestBus()` — in-memory bus with empty consumer matrix.
- **Deps pattern:** `makeDeps(overrides)` function per test file — returns full dep bag with defaults.
- **Controllable failure:** Override dep methods directly (e.g., `payment.cancelSubscription = async () => { throw ... }`). For engine-level tests, wrap steps with failure toggle.
- **DSAR case creation:** Helper `createDSARCase(accountId, status)` — inserts into `complianceRegister`.
- **Buyer data creation:** Helper `createBuyerData(accountId, listingId)` — inserts shortlists, savedSearches, searchHistory.

### Spec Constants Block

```typescript
const SPEC_CONSTANTS = {
  CONSECUTIVE_FAILURE_THRESHOLD: 3,
  DEADLINE_DAYS: 30,
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000,
  THREE_DAYS_MS: 3 * 24 * 60 * 60 * 1000,
  ERASURE_NON_SKIPPABLE_STEPS: [0, 3, 4], // verify_identity, process_erasure, close_dsar_case
  CLOSURE_NON_SKIPPABLE_STEPS: [0, 4],     // archive_listings, deactivate_account
  ERASURE_SKIPPABLE_STEPS: [1, 2, 5],      // extract_data, close_tickets, emit_event
  CLOSURE_SKIPPABLE_STEPS: [1, 2, 3, 5],   // cancel_paddle, anonymise, delete_defer, emit_event
} as const
```

### Sub-Agent Delegation Assessment

**Parallelisable workstreams:** 3 independent test files with no shared code.
**Recommendation:** Given the controllable-step pattern is shared across erasure-e2e and closure-e2e, writing sequentially is safer. Start with erasure-e2e (most ACs), then closure-e2e (reuses pattern), then concurrent-e2e (lightest — mostly verification wrappers).
**No delegation** — the test files share no production code, only test patterns. Sequential is correct for ensuring consistent controllable-step design across files.
