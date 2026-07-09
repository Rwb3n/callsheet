## Implementation Plan — CS-WORK-085: Account closure flow wiring

**IO profile:** db-read-write, event-emit, flow-orchestration, external-api
**Blocked by:** None — all clear
**Spec sources:** `03-closure-flow.md` §3, `shared-infrastructure.md` §3/§13.2, `platform-and-product.md` §1.9

### AC Summary

| AC | Description | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| AC-23 | CLOSURE_FLOW_STEPS registers 6 steps in correct order | needs-impl | — |
| AC-24 | executeOrchestratedFlow('closure') creates record with flowType='closure', status='initiated' | needs-impl | Engine exists, just needs correct invocation |
| AC-25 | Step 1 archives all active listings, emits listing_archived per listing, accumulates IDs | needs-impl | Existing stub in settings.ts archives but doesn't emit events |
| AC-26 | Step 2 creates pending_cancellation before calling PaymentService.cancelSubscription | needs-impl | Existing stub calls cancel but no pending_cancellation records |
| AC-27 | Step 2 failure halts flow at step 2 with status='failed', preserves context | needs-impl | Engine handles failure status, step must record partial context |
| AC-28 | Step 2 retry skips already-cancelled subscriptions (idempotent) | needs-impl | — |
| AC-29 | Step 5 sets account deactivated — admin skip attempt rejected (not skippable) | partial | Existing stub deactivates via `suppressedAt`. Skippability enforced by engine (`skippable: false`) |
| AC-30 | Step 6 emits account_closed with full payload per PP §1.9 | needs-impl | AccountClosedEvent type needs amendment first |

**Pre-satisfied:** 0 / 8
**Needs implementation:** 8 / 8 (AC-29 partial — deactivation logic exists in stub but needs adaptation)

### Type Alignment

1. **AccountClosedEvent** — MUST amend: add `buyerDataDeleted: boolean`, `paddleCancellationsPending: boolean`, `timestamp: string`; make `complianceHoldActive` required (currently optional). File: `src/lib/events/types.ts:184-189`.

   **Blast radius — 13 construction sites across 7 files must add the 3 new required fields:**
   - `settings.ts:137` (production emission — will be replaced by closure.ts)
   - `ops-consumers.integration.test.ts:383,408` (one already has `complianceHoldActive`)
   - `dl-consumers.test.ts:127`
   - `dl-consumers.integration.test.ts:91,118`
   - `account-closed-enrichment.integration.test.ts:76,103,130`
   - `consumers.integration.test.ts:172` (D&L)
   - `consumers.integration.test.ts:516,543,556` (Commercial)

   **Strategy:** Add defaults to all 13 sites: `buyerDataDeleted: false, paddleCancellationsPending: false, timestamp: new Date().toISOString()`. Remove `as AccountClosedEvent` casts where present (ops-consumers:386,412) — full fields make casts unnecessary.

2. **SKIP_CONSTRAINTS closure keys** — MUST rename in `admin/flows.ts:38-39`:
   - `cancel_subscriptions` → `cancel_paddle_subscriptions`
   - `anonymise_buyer_data` → `anonymise_enquiry_data`
   Also rename in:
   - `admin-flows.integration.test.ts:45-46` (test fixture `makeClosureSteps`)
   - `settings.ts:78,103` (step names in `buildClosureSteps` — will be deleted when refactored)
   - `settings.integration.test.ts:193-194` (test assertions)

3. **Account deactivation** — spec says `accounts.lifecycleStatus = "closed"` but no `accounts` table exists. Schema uses `accountProfiles.suppressedAt` + `suppressionReason`. Existing S5 stub already uses this pattern. Adapt spec to schema.

4. **Step 1 listing_archived emission** — existing stub archives but doesn't emit events. New impl must emit `listing_archived` per listing (sync consumers: search index). `ListingArchivedEvent` requires: `listingId, accountId, subscriptionTier, entityType, slug`. Must query full listing fields.

5. **PaymentService.cancelSubscription** — signature: `{ paddleSubscriptionId: string, reason: string, effectiveFrom: "immediately" | "end_of_period" }`. Returns `{ status: "cancelled" | "scheduled" }`. Available via `deps.payment`.

6. **pending_cancellations table** — `{ id, paddleSubscriptionId, listingId, reason, createdAt }`. No `cancelledAt` column. No unique constraint on `(paddleSubscriptionId, reason)` — `onConflictDoNothing()` won't work (UUID PK always unique). **Use query-first pattern:** check if pending_cancellation with matching `paddleSubscriptionId` + `reason = "account_closed"` already exists before inserting. For cancel API retry, Paddle is idempotent (cancelling already-cancelled returns success) — safe to re-call all.

7. **ClosureContext** — spec type has 10 fields. Existing stub in settings.ts has 3-field context. Replace entirely.

8. **settings.ts refactor** — settings.ts `initiateAccountClosure` route must call `initiateAccountClosure(deps, accountId)` from `flows/closure.ts`. Construct `ClosureFlowDeps` from `SettingsRouterDeps`. Remove inline `buildClosureSteps`, `ClosureContext`, and closure step code (~90 lines). Keep `SettingsRouterDeps` with `payment: PaymentService` (needed for dep construction).

### Implementation Order

1. **Amend AccountClosedEvent type** in `src/lib/events/types.ts` — add 3 fields, make complianceHoldActive required
2. **Cascade AccountClosedEvent to 13 construction sites** — add defaults to all consumer test files + settings.ts emission
3. **Rename SKIP_CONSTRAINTS** closure keys in `admin/flows.ts` + cascade to test fixtures, settings.ts, settings test
4. **Create `src/lib/flows/closure.ts`** — ClosureContext type, ClosureFlowDeps, buildClosureSteps(), initiateAccountClosure()
5. **Update `src/lib/flows/index.ts`** — export closure types + functions
6. **Refactor `src/server/routers/settings.ts`** — remove inline closure code, import from flows/closure.ts, update initiateAccountClosure route
7. **Update `settings.integration.test.ts`** — update step name assertions + any context shape changes
8. **Write unit tests** — `src/lib/flows/__tests__/closure.test.ts` (AC-23)
9. **Write integration tests** — `src/lib/flows/__tests__/closure.integration.test.ts` (AC-24 through AC-30)
10. **Run full test suite** — verify 0 regressions

### Deliverables

- [ ] `src/lib/events/types.ts` — Amend AccountClosedEvent (3 new fields, 1 required)
- [ ] 6 consumer test files — Add 3 required fields to 13 construction sites
- [ ] `src/server/routers/admin/flows.ts` — Rename 2 SKIP_CONSTRAINTS closure keys
- [ ] `src/server/routers/__tests__/admin-flows.integration.test.ts` — Update makeClosureSteps fixture step names
- [ ] `src/lib/flows/closure.ts` — ClosureContext, ClosureFlowDeps, buildClosureSteps, initiateAccountClosure
- [ ] `src/lib/flows/index.ts` — Add closure exports
- [ ] `src/server/routers/settings.ts` — Remove inline closure code, import from flows/closure.ts
- [ ] `src/server/routers/__tests__/settings.integration.test.ts` — Update step name assertions
- [ ] `src/lib/flows/__tests__/closure.test.ts` — Unit tests (AC-23)
- [ ] `src/lib/flows/__tests__/closure.integration.test.ts` — Integration tests (AC-24–AC-30)

### Key Patterns (from erasure sibling)

- **Deps injection:** `ErasureFlowDeps = { db, flowDb, bus, waitUntilFn, schedulerDb }`. Closure adds `payment: PaymentService`.
- **Builder function:** `buildErasureSteps(deps)` returns `FlowStepDefinition<ErasureContext>[]`. Steps capture deps via closure.
- **Flow initiation:** `initiateErasureFlow(deps, dsarCaseId, accountId)` constructs initial context then calls `executeOrchestratedFlow(deps.flowDb, { ... })`.
- **Unit test shape:** Step names array + skippable flags array + domain assertions. Minimal deps stub (`{} as ErasureFlowDeps`).
- **Integration test shape:** `getTestDb()`, `createFlowDb(db)`, `createSchedulerDb(db)`, `createTestBus()`. Direct step execution via `steps[N].execute(ctx)` for isolated step testing.
- **Event emission testing:** `bus.on({ domain, eventType, mode, handler })` to capture; assert payload shape.

### Spec Adaptation Notes

1. **Step 2 idempotency:** Spec checks `pendingCancellations.cancelledAt IS NOT NULL` — column doesn't exist. Use query-first: `SELECT ... WHERE paddleSubscriptionId = X AND reason = 'account_closed'`. If exists, skip insert. Paddle API is idempotent — safe to re-call for all subscriptions on retry.

2. **Step 5 deactivation:** Use `accountProfiles.suppressedAt = new Date()` + `suppressionReason = "account_closed"` (matches existing stub). Not `accounts.lifecycleStatus = "closed"` (no such table/column).

3. **Step 1 per-listing emission:** Must query full listing fields (subscriptionTier, entityType, slug) to construct `ListingArchivedEvent` payload. Existing stub only queries id/lifecycleStatus. Also emit `pending_cancellation_created` for paid listings (matches listing.archive route pattern in listing.ts:292-305).

4. **Steps 3-4 placeholders:** Throw with message pointing to CS-WORK-086 (matches erasure's `process_erasure` placeholder pattern).

5. **settings.ts refactor:** `initiateAccountClosure` route calls `initiateAccountClosure(closureFlowDeps, accountId)` from closure.ts. Construct `ClosureFlowDeps` from `SettingsRouterDeps` fields.
