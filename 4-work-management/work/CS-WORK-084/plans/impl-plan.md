## Implementation Plan — CS-WORK-084: processErasure implementation

**IO profile:** db-read-write, r2-delete, deferred-action-schedule, transaction
**Blocked by:** CS-WORK-083 ✅ (done)
**Spec sources:** `01-erasure-flow.md` §2

### AC Summary

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC-11 | Resolve disputes where erasing account owns disputed listing | needs-impl | Phase A1 |
| AC-12 | Withdraw competing claims filed by erasing account | needs-impl | Phase A2 |
| AC-13 | Dispute chain termination — no cascading resolution | needs-impl | Unit test only |
| AC-14 | Freelancer listings fully deleted (16 child tables cascade) | needs-impl | Phase B1 — single DELETE cascades |
| AC-15 | Company listings anonymised (null PII, revert unclaimed) | needs-impl | Phase B2 |
| AC-16 | Company anonymisation deletes intelligence data | needs-impl | Phase B2 explicit deletes |
| AC-17 | Account personal data deletion | needs-impl | Phase C |
| AC-18 | Single PostgreSQL transaction | needs-impl | Wraps Phases A-C |
| AC-19 | R2 cleanup (images + claim evidence) | needs-impl | Post-transaction |
| AC-20 | Idempotent retry (DB done → skip DB, retry R2) | needs-impl | Step wrapper D2 pattern |
| AC-21 | Schedule quality_score_recalculation per anonymised listing | needs-impl | Post-transaction |
| AC-22 | claimIdsForR2Cleanup captured pre-transaction | needs-impl | Unit test for ordering |

**Pre-satisfied:** 0 / 12
**Needs implementation:** 12 / 12

### Type Alignment (verified 2026-03-29)

1. **ErasureContext** — already has `claimIdsForR2Cleanup?: string[]` and all required fields. No changes.
2. **ErasureFlowDeps** — needs `storage: ObjectStorageService` added. Cascade: update `erasure.integration.test.ts`, `erasure.test.ts`, any production code constructing deps (check `admin/flows.ts`, `flows/index.ts`, `singleton.ts`).
3. **`quality_score_recalculation`** — registered in `DeferredActionParamsMap` with `{ listingId: UUID }`. No new registration.
4. **`ObjectStorageService.deleteByPrefix(prefix)`** → `{ deleted: number }`. `InMemoryObjectStorageService` for tests.
5. **`listings.accountId`** — `text` (Better Auth user.id), nullable, FK → `user.id` with `onDelete: "set null"`.
6. **`preClaimSnapshots.snapshot`** JSONB shape: `{ claimantAccountId: string, originalListing: {...}, pendingEdits: ... }`. No nested `disputeContext`. Spec §2.4 pseudocode adapted accordingly.
7. **Auth `session`** table: `userId` text FK → `user.id` with `onDelete: "cascade"`. Delete directly within tx.
8. **Auth `account`** table (OAuth): `userId` text FK → `user.id` with `onDelete: "cascade"`. Delete directly within tx.
9. **All 16+ child tables** of `listings` have `onDelete: "cascade"`. For freelancer DELETE, cascade handles everything. For company UPDATE (not delete), explicit deletes needed for: `pre_claim_snapshots`, `enrichment_schedules`, `decay_signals`, `perception_aggregates`.
10. **`enquiryRecords.senderAccountId`** — `onDelete: "set null"`, not cascade. Explicit delete needed.
11. **`shortlists.accountId`** — FK → `user.id` with `onDelete: "cascade"`. But we're NOT deleting user row. Explicit delete needed.

### Implementation Order

1. **Create `src/domains/data-and-listings/erasure/process-erasure.ts`** — main file:
   - `getClaimIdsForAccount(db, accountId)` — pre-transaction query for AC-22
   - `processErasureTransaction(db, accountId)` — single tx wrapping A+B+C
   - `resolveDisputes(tx, accountId)` — Phase A (A1: resolve owned disputes, A2: withdraw competing claims)
   - `processListings(tx, accountId)` — Phase B (freelancer delete, company anonymise)
   - `anonymiseCompanyListing(tx, listingId)` — B2 sub-function
   - `deleteAccountData(tx, accountId)` — Phase C (profile anonymise, enquiries, shortlists, searches, sessions)
   - `processErasureR2Cleanup(storage, listingIdsDeleted, claimIds)` — post-tx
   - `scheduleQualityRecalculations(schedulerDb, listingIdsAnonymised)` — post-tx

2. **Modify `src/lib/flows/erasure.ts`** — add `storage` to `ErasureFlowDeps`, replace step 4 placeholder with real implementation calling processErasure functions with D2 sub-step pattern.

3. **Update deps cascade** — grep all files constructing `ErasureFlowDeps` and add `storage`.

4. **Unit tests** (`process-erasure.test.ts`) — AC-13, AC-22.

5. **Integration tests** (`process-erasure.integration.test.ts`) — AC-11, AC-12, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21.

6. **Update existing erasure tests** — add `storage` to deps in `erasure.test.ts` and `erasure.integration.test.ts`.

### Deliverables

- [ ] `src/domains/data-and-listings/erasure/process-erasure.ts` — NEW
- [ ] `src/lib/flows/erasure.ts` — MODIFY (add storage to deps, wire step 4)
- [ ] `src/lib/flows/__tests__/erasure.test.ts` — MODIFY (add storage to deps)
- [ ] `src/lib/flows/__tests__/erasure.integration.test.ts` — MODIFY (add storage to deps)
- [ ] `src/domains/data-and-listings/erasure/__tests__/process-erasure.test.ts` — NEW
- [ ] `src/domains/data-and-listings/erasure/__tests__/process-erasure.integration.test.ts` — NEW

### Key Patterns

- **Deps bag injection:** `ErasureFlowDeps` extends to include `storage: ObjectStorageService`.
- **Context mutation:** Steps write directly to `ctx` object, serialised to flow progress JSONB.
- **Transaction:** `db.transaction(async (tx) => { ... })` — Drizzle ORM.
- **Session delete:** `tx.delete(session).where(eq(session.userId, accountId))` — same PG db.
- **Shortlist delete order:** `shortlist_items` first (FK → shortlists), then `shortlists`.
- **`scheduleDeferredAction(schedulerDb, { action, params, executeAt, retryPolicy, onFailure, createdBy })`**.

### No Sub-Agent Delegation

Single transaction function + tightly coupled tests. All phases share DB state within one tx. No independent workstreams.
