## Implementation Plan — CS-WORK-091: Erasure and Closure Flow Initiation Routes

**IO profile:** db-write (inserts flow rows, schedules deferred actions, logs decisions)
**Blocked by:** None — all clear
**Spec sources:** `4-work-management/arcs/api-completion.md`

### AC Summary

| AC | Description (short) | Status | Evidence / Notes |
|----|---------------------|--------|-----------------|
| AC-1 | initiateErasure accepts {dsarCaseId, accountId}, returns {flowId, status} | needs-impl | No admin route exists. `initiateErasureFlow` in `erasure.ts:292` is the backend. |
| AC-2 | initiateErasure validates DSAR case exists and is open/in_progress | needs-impl | Validation logic needed in route handler. Query `complianceRegister`. |
| AC-3 | initiateClosureForAccount accepts {accountId}, returns {flowId, status} | needs-impl | No admin route exists. `initiateAccountClosure` in `closure.ts:286` is the backend. |
| AC-4 | Both routes log flow_initiation decision | needs-impl | — |
| AC-5 | Both routes reject non-admin callers | needs-impl | Uses existing `adminProcedure` guard pattern. |
| AC-6 | initiateErasure validates dsarCase.accountId matches input.accountId | needs-impl | Cross-check prevents erasure against wrong account. |
| AC-7 | Both routes reject if a non-terminal flow already exists for same flowType + accountId | needs-impl | Prevents duplicate concurrent flows (double-archive, double-cancel). |

**Pre-satisfied:** 0 / 7
**Needs implementation:** 7 / 7

### Type Alignment

1. **AdminFlowsRouterDeps must widen.** Current: `{ db, flowDb, decisionLogDb, notificationDb }`. Needs: `+ bus, waitUntilFn, schedulerDb, storage, payment`.
2. **root.ts must pass `storage` to admin router.** Currently passes `db, notificationDb, schedulerDb, decisionLogDb, emailService, flowDb, bus, waitUntilFn, payment`. Missing: `storage`.
3. **AdminRouterDeps intersection** in `admin/index.ts` auto-widens via `&` when `AdminFlowsRouterDeps` is widened. No manual change.
4. **Decision type:** `"flow_initiation"` — text column, no enum migration.

### Implementation Order

1. **Widen `AdminFlowsRouterDeps`** in `flows.ts` — add `bus`, `waitUntilFn`, `schedulerDb`, `storage`, `payment` imports and type fields.
2. **Add `storage` to root.ts** admin router deps.
3. **Add `initiateErasure` procedure** — input: `{ dsarCaseId: z.string().uuid(), accountId: z.string() }`. Validates: (a) DSAR case exists with status open/in_progress, (b) dsarCase.accountId matches input.accountId, (c) no non-terminal erasure flow exists for this accountId. Calls `initiateErasureFlow`. Logs decision. Returns `{ flowId, status }`.
4. **Add `initiateClosureForAccount` procedure** — input: `{ accountId: z.string() }`. Validates: no non-terminal closure flow exists for this accountId. Calls `initiateAccountClosure`. Logs decision. Returns `{ flowId, status }`.
5. **Add integration tests** — happy path for both routes, DSAR validation error, accountId mismatch, duplicate flow rejection, non-admin rejection, decision logging.

### Deliverables

- [x] `src/server/routers/admin/flows.ts` — exists, needs 2 new procedures + deps widening
- [x] `src/server/root.ts` — exists, needs `storage` added to admin deps
- [x] `src/server/routers/__tests__/admin-flows.integration.test.ts` — exists, needs new test cases

### Key Patterns (from existing flows.ts)

- Router factory: `createAdminFlowsRouter(deps)` with typed deps bag.
- All procedures use `adminProcedure` (not `protectedProcedure`).
- Decision logging via `logDecision(deps.decisionLogDb, { domain, decisionType, inputs, output, accountId })`.
- Input validation with Zod schemas, throwing `TRPCError` for validation failures.
- Test pattern: `createFlowDb(db)`, `createDecisionLogDb(db)`, `InMemoryNotificationDb`, `makeAdminSession(adminId)`.
- For initiation tests: need `createTestBus()`, `createSchedulerDb(db)`, `InMemoryObjectStorageService`, `InMemoryPaymentService`.
- DSAR case insertion: insert into `complianceRegister` with `type: "dsar"`, `status: "open"`.
