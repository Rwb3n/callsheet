## Implementation Plan — CS-WORK-087: Concurrent flow interaction

**IO profile:** db-read-write, deferred-action-schedule, integration-test-heavy
**Blocked by:** 083 ✅, 084 ✅, 085 ✅, 086 ✅ — all clear
**Spec sources:** `05-concurrent-flows.md` §5

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-40 | Erasure + closure each create independent orchestrated_flows rows | needs-impl | Test only — production code exists (initiateErasureFlow, initiateAccountClosure) |
| AC-41 | Closure step 4 with hold sets buyerDataDeferred + schedules recheck | partial | Step 4 logic exists in closure.ts:200-234. AC-33 test covers isolated case. 087 tests the concurrent scenario (both flows active) |
| AC-42 | compliance_hold_recheck deletes buyer data when hold cleared | partial | Handler exists. AC-36 covers isolated case. 087 tests after processErasure has already run |
| AC-43 | compliance_hold_recheck no-op when data already deleted by processErasure | needs-impl | Key concurrent scenario — processErasure deletes buyer data, recheck finds nothing |
| AC-44 | compliance_hold_recheck reschedules when hold still active | partial | AC-37 covers isolated case. 087 tests in concurrent context |
| AC-45 | processErasure idempotent when listings already archived by closure | needs-impl | Archival by closure → processErasure must handle gracefully |

**Pre-satisfied:** 0 / 6 (all need concurrent scenario tests)
**Needs implementation:** 6 / 6 (all test-only)

### Type Alignment

All types aligned — no production code changes needed. This is a test-only work item.

### Implementation Order

1. Create `concurrent-flows.integration.test.ts` with shared setup (account, listings, buyer data, DSAR case)
2. AC-40: Two independent flow rows test
3. AC-41 + AC-42 + AC-43: Full Scenario A (erasure during closure) — tests the complete concurrent lifecycle
4. AC-44: Reschedule test in concurrent context
5. AC-45: processErasure idempotency with pre-archived listings

### Deliverables

- [ ] `src/lib/flows/__tests__/concurrent-flows.integration.test.ts` — 6 AC, all integration tests

### Key Patterns (from sibling tests)

- `makeDeps()` factory for both ErasureFlowDeps and ClosureFlowDeps
- `createDSARCase()` / `createComplianceHold()` helpers from existing tests
- `createTestListing(db, accountId, overrides?)` for listings
- `seedTestUser(db, id)` for account setup
- `createFlowDb(db)`, `createSchedulerDb(db)` from test-fixtures
- `invokeHandler(registry, "compliance_hold_recheck", params)` for handler testing
- Direct step execution via `steps[N].execute(ctx)` and full flow via `initiateErasureFlow` / `initiateAccountClosure`
