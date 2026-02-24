# S10 Stress Test — Part B (D&L + PP Boundaries)

**Agent:** B
**Boundaries tested:** Data & Listings, Platform & Product
**Scenarios:** 8
**Date:** 2026-02-15

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S10-ST-13 | `processErasureR2Cleanup` called with contradictory second argument in two call sites within same file | High | §2.2, §2.7 | D&L §1.9, SI §6.1 | §2.2 initial wrapper passes `context.accountId` (UUID); §2.7 revised wrapper passes `context.claimIdsForR2Cleanup` (UUID[]). Function signature expects `claimIdsForR2Cleanup: UUID[]`. Initial wrapper would fail at runtime (UUID is not UUID[]). |
| S10-ST-14 | `compliance_hold_recheck` params type mismatch: S10 omits `flowId` required by SI §2.1 | High | §10, §4 | SI §2.1 | SI `DeferredActionParamsMap.compliance_hold_recheck` requires `{ accountId: UUID; flowId: UUID }`. S10 schedules with `{ accountId: UUID }` only. TypeScript compiler would reject. |
| S10-ST-15 | AC-42 lists `email_preferences` in `compliance_hold_recheck` deletion set — not deleted anywhere in code | Medium | §5.4, index §17 | PP §5, SI §5.3 | AC-42 says handler deletes "buyer-side enquiry_records, email_preferences" but neither `executeBuyerDataDeletion` (§4.2) nor `processErasure` (§2.6) deletes an `email_preferences` table. Email preferences are a JSONB column on `account_profiles`, already set to all-false by processErasure. |
| S10-ST-16 | `erasure_completed` payload missing `companyListingsAnonymised` count field | Low | §1.4 | D&L §1.9 | D&L §1.9 `ErasureCompletedEvent` does not include a `companyListingsAnonymised` count (only `freelancerListingsDeleted` is retained for backward compat). Correct — no gap. |
| S10-ST-17 | `account_closed` event payload correct against PP §1.9 `AccountClosedEvent` | Pass | §3.4 | PP §1.9 | Correct |
| S10-ST-18 | Autonomy graduation admin routes not documented in PP interface spec admin surface | Medium | §7, 00-router-plan §2 | PP §5, PP §3 | PP interface spec covers account closure orchestration (§5) and `getListingAnalytics` (§3) but contains no mention of `admin.graduation.*` routes. These 5 routes constitute a new admin surface area within Platform's boundary that the PP spec does not document. |
| S10-ST-19 | Quality score recalculation after anonymisation: `accountId = null` does not block scoring | Pass | §2.8 | D&L §4, S9 §1 | Correct |
| S10-ST-20 | Closure flow step ordering matches SI §13.2 and PP §5 specification | Pass | §3.2 | SI §13.2, PP §5 | Correct |

## Detailed Findings

### S10-ST-13: `processErasureR2Cleanup` internal contradiction — two call sites disagree on second argument

**Severity:** High
**Slice section:** §2.2 (file: `01-erasure-flow.md`) and §2.7 (same file)
**Upstream reference:** D&L §1.9, SI §6.1

**Problem:** The `processErasureR2Cleanup` function is defined at §2.7 with signature `(listingIdsDeleted: UUID[], claimIdsForR2Cleanup: UUID[])`. The initial step wrapper at §2.2 calls it with `(context.listingIdsDeleted, context.accountId)` — passing a single UUID where a UUID[] is expected. The revised step wrapper later in §2.7 correctly calls `(context.listingIdsDeleted, context.claimIdsForR2Cleanup ?? [])`. This is a Pattern #14 recurrence: two versions of the same call site in the same file, one correct and one wrong. The initial wrapper would cause a compile-time type error (`UUID` is not assignable to `UUID[]`). The revised wrapper supersedes the initial one (§2.7 Note says "Revised step wrapper:"), but both appear in the file without the initial version being struck through or removed.

**Fix — slice:**
- Section: §2.2
- Old:
```typescript
  // Sub-step 2: R2 cleanup (idempotent — safe to retry)
  const r2Result = await processErasureR2Cleanup(
    context.listingIdsDeleted,
    context.accountId
  )
  context.r2CleanupCompleted = true
  context.r2ObjectsDeleted = r2Result.objectsDeleted

  // Sub-step 3: Schedule quality recalculation for anonymised company listings
  const recalcCount = await scheduleQualityRecalculations(context.listingIdsAnonymised)
  context.qualityRecalcScheduled = recalcCount
}
```
- New: Replace the entire initial step wrapper code block (§2.2) with a reference to the revised version: "**See §2.7 for the authoritative `processErasureStep` implementation** (revised to capture `claimIdsForR2Cleanup` pre-transaction)." Remove the stale code block entirely.

**Fix — sibling specs:** None.

**Acceptance criteria impact:** None (AC-19 and AC-22 already test the correct behaviour from the revised wrapper).

---

### S10-ST-14: `compliance_hold_recheck` params type mismatch — missing `flowId`

**Severity:** High
**Slice section:** §10 (index.md) and §4.2 (file: `03-closure-flow.md`)
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`

**Problem:** SI §2.1 defines `compliance_hold_recheck: { accountId: UUID; flowId: UUID }`. S10 index.md §10 declares the params as `{ accountId: UUID }` without `flowId`. S10 §4.2 `deleteBuyerData` schedules the action with `params: { accountId: context.accountId }` only. S10 §5.4 `handleComplianceHoldRecheck` accepts `params: { accountId: UUID }` only. The TypeScript compiler would reject the `scheduleDeferredAction` call because the params object is missing the required `flowId` field. The `flowId` is needed so the handler can locate and update the correct closure flow's context after deferred deletion completes (§4.3 already queries `orchestrated_flows` by `flowType` and `triggeredBy`, but `flowId` provides a direct reference without the risk of matching the wrong flow if multiple closure flows exist for the same account).

**Fix — slice:**
- Section: index.md §10 deferred actions table
- Old: `| \`compliance_hold_recheck\` | \`{ accountId: UUID }\` | Ops | 7 days after closure step 4 deferred | S0 | No |`
- New: `| \`compliance_hold_recheck\` | \`{ accountId: UUID; flowId: UUID }\` | Ops | 7 days after closure step 4 deferred | S0 | No |`

- Section: §4.2 (`03-closure-flow.md`) `deleteBuyerData` function
- Old:
```typescript
    await scheduleDeferredAction({
      action: "compliance_hold_recheck",
      params: { accountId: context.accountId },
      executeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  // 7 days
      retryPolicy: "retry_3",
      createdBy: "platform",
    })
```
- New:
```typescript
    await scheduleDeferredAction({
      action: "compliance_hold_recheck",
      params: { accountId: context.accountId, flowId: context.flowId },
      executeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  // 7 days
      retryPolicy: "retry_3",
      createdBy: "platform",
    })
```

- Section: §4.3 (`03-closure-flow.md`) `handleComplianceHoldRecheck` signature
- Old: `params: { accountId: UUID }`
- New: `params: { accountId: UUID; flowId: UUID }`

- Section: §4.3 flow lookup query — replace `triggeredBy` query with `flowId` direct lookup
- Old:
```typescript
  const flow = await db.select()
    .from(orchestratedFlows)
    .where(and(
      eq(orchestratedFlows.flowType, "closure"),
      eq(orchestratedFlows.triggeredBy, accountId),
      eq(orchestratedFlows.status, "in_progress"),
    ))
    .limit(1)
```
- New:
```typescript
  const flow = await db.select()
    .from(orchestratedFlows)
    .where(eq(orchestratedFlows.id, params.flowId))
    .limit(1)
```

- Section: §5.4 (`05-concurrent-flows.md`) handler — apply same `flowId` param addition
- Old: `params: { accountId: UUID }`
- New: `params: { accountId: UUID; flowId: UUID }`

- Section: §5.4 handler flow lookup — replace with `params.flowId` direct lookup (same change as §4.3)

- Section: §3.1 (`03-closure-flow.md`) `ClosureContext` type — add `flowId`
- Old: (not present)
- New: Add `flowId: UUID` to `ClosureContext` (set at flow initiation from the `OrchestratedFlowProgress.flowId` return value)

**Fix — sibling specs:** None (SI §2.1 already has the correct type).

**Acceptance criteria impact:** AC-33, AC-36, AC-41, AC-42 should reference `flowId` in the scheduled params. Add note: "Scheduled with `{ accountId, flowId }` matching SI §2.1 `DeferredActionParamsMap`."

---

### S10-ST-15: AC-42 lists `email_preferences` as deleted by `compliance_hold_recheck` — no such table or deletion exists

**Severity:** Medium
**Slice section:** §5 AC-42 (file: `05-concurrent-flows.md`), index.md §17 AC-42
**Upstream reference:** PP §5 (closure flow), SI §5.3 (preference management)

**Problem:** AC-42 states the `compliance_hold_recheck` handler deletes "shortlists, shortlist_items, saved_searches, buyer-side enquiry_records, email_preferences". However:

1. `email_preferences` is not a standalone table. Email preferences are stored as a JSONB column on `account_profiles` (SI §5.3, S5). There is no `email_preferences` table to delete.
2. The `executeBuyerDataDeletion` function (§4.2) deletes shortlists, saved_searches, enquiry_records (buyer-side), and search_history — it does not touch `email_preferences` or `account_profiles`.
3. processErasure §2.6 Phase C sets `emailPreferences` to all-false on `account_profiles` during account data anonymisation, which is the correct treatment.
4. The §5.4 handler's inline comment also says "delete shortlists, shortlist_items, saved_searches, buyer-side enquiry_records, email_preferences" — propagating the same error.

The AC text and handler comment include a non-existent entity in the deletion list. The actual `executeBuyerDataDeletion` code does not delete email preferences (correctly — it is a column, not a table). For closure (non-GDPR), zeroing preferences is not required — the account is merely closed, not erased.

**Fix — slice:**
- Section: index.md §17 AC-42
- Old: `| AC-42 | \`compliance_hold_recheck\` handler, when hold cleared and buyer data exists, deletes buyer data (shortlists, shortlist_items, saved_searches, buyer-side enquiry_records, email_preferences) | Integration |`
- New: `| AC-42 | \`compliance_hold_recheck\` handler, when hold cleared and buyer data exists, deletes buyer data (shortlists, shortlist_items, saved_searches, search_history) | Integration |`

- Section: §5 AC-42 (`05-concurrent-flows.md`) — same change as above

- Section: §5.4 handler inline comment (`05-concurrent-flows.md`)
- Old: `// deleteBuyerData: delete shortlists, shortlist_items, saved_searches,`
        `// buyer-side enquiry_records, email_preferences.`
- New: `// deleteBuyerData: delete shortlists, shortlist_items, saved_searches, search_history.`

**Note on enquiry_records:** AC-42 also lists "buyer-side enquiry_records" but per §4.4 analysis, step 3 already anonymised all records by setting `senderAccountId = null`, so step 4's `DELETE FROM enquiry_records WHERE senderAccountId = accountId` finds zero rows. The deferred handler inherits this same no-op characteristic. Removing `buyer-side enquiry_records` from the AC to match the actual effective deletion set would be more accurate, but this is a documentation clarity issue rather than a correctness issue (the delete is harmless).

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-42 text amended as above. Also amend AC-34 to include `search_history` if not already present — AC-34 currently says "shortlists (cascade deletes shortlist_items), saved_searches, search_history" which is correct. The deferred handler should delete the same set as step 4's no-hold path.

---

### S10-ST-16: `erasure_completed` event payload field coverage

**Severity:** Low
**Slice section:** §1.4, AC-6 (file: `01-erasure-flow.md`)
**Upstream reference:** D&L §1.9 `ErasureCompletedEvent`

**Problem:** AC-6 lists the `erasure_completed` payload fields as: `accountHash`, `senderAccountId`, `listingIdsAnonymised`, `listingIdsDeleted`, `freelancerListingsDeleted`, `timestamp`. The D&L §1.9 `ErasureCompletedEvent` type contains exactly these 6 fields (plus the `type` discriminator). The slice's step 6 emit code (§1.4) emits exactly these fields. The `companyListingsAnonymised` count that exists in `ErasureContext` is NOT included in the event payload, which is correct — D&L §1.9 retained only `freelancerListingsDeleted` as a count for "backward compat" and replaced the company count with the `listingIdsAnonymised` UUID array. No gap.

**Fix — slice:** None.

**Acceptance criteria impact:** None.

---

### S10-ST-17: `account_closed` event payload correctness against PP §1.9

**Severity:** Pass
**Slice section:** §3.4, AC-30 (file: `03-closure-flow.md`)
**Upstream reference:** PP §1.9 `AccountClosedEvent`

PP §1.9 defines `AccountClosedEvent` with fields: `type`, `accountId`, `listingsArchived` (UUID[]), `buyerDataDeleted` (boolean), `complianceHoldActive` (boolean), `paddleCancellationsPending` (boolean), `timestamp`. S10 §3.4 step 6 emits exactly these fields. `complianceHoldActive` maps from `context.buyerDataDeferred`. `paddleCancellationsPending` maps from `context.subscriptionsFailed.length > 0`. All field names and types match. Three async consumers (D&L, Ops, CR) are correctly listed and all registered in prior slices (S7, S8, S9). D&L §2 P1 fields for `account_closed` lists `accountId` and `listingsArchived` — both present. Correct.

---

### S10-ST-18: Autonomy graduation admin routes absent from PP interface spec

**Severity:** Medium
**Slice section:** §7, §8 (file: `07-autonomy-graduation.md`), router plan §2
**Upstream reference:** PP §3, PP §5, PP interface spec (v7 overall)

**Problem:** S10 introduces 5 new `admin.graduation.*` routes (status, history, override, algorithmRollout, algorithmComparison). All use `adminProcedure` and are Platform-owned (they live in `src/server/routers/admin/graduation.ts`). PP §5 documents account closure orchestration as Platform's admin-facing coordination surface. PP §3 exposes `getListingAnalytics` as the sole query interface. Neither section — nor any other section of PP v7 — mentions graduation routes.

The PP interface spec is the authoritative document for Platform's boundary surface (what it exposes to other domains and what admin surfaces it provides). Five new admin routes with mutation capability (`override`, `algorithmRollout`) are a meaningful addition to Platform's surface area. They should be documented in PP so that future slices or stress tests can verify the admin surface completeness.

The routes themselves are cross-domain in nature (they evaluate graduation criteria spanning D&L, Ops, and Commercial sub-entities). However, they are implemented within Platform's router namespace and use Platform's `adminProcedure` authentication. This makes Platform the domain owner for the admin surface, even though the graduation logic reads from cross-domain decision logs.

**Fix — slice:** None (the slice correctly specifies the routes).

**Fix — sibling specs:**
- Document: `interfaces/platform-and-product.md`
- Section: Add new §6 or append to §5
- Change: Add a "§6 Autonomy Graduation Admin Surface" section documenting the 5 routes, their auth requirements, and their cross-domain read patterns. Minimal entry:

```markdown
## 6. Autonomy Graduation Admin Surface

Platform owns 5 admin routes for sub-entity graduation monitoring and control. Routes read `decision_logs` cross-domain (SI §9.2) and `quality_scores` (D&L). All use `adminProcedure` (SI §4.1).

| Route | Method | Description |
|-------|--------|-------------|
| `admin.graduation.status` | query | Current graduation status per sub-entity/capability |
| `admin.graduation.history` | query | Historical graduation evaluations |
| `admin.graduation.override` | mutation | Manual graduation override |
| `admin.graduation.algorithmRollout` | mutation | Set algorithm V2 rollout percentage |
| `admin.graduation.algorithmComparison` | query | V1 vs V2 quality band comparison |

Full route specifications in S10 `00-router-plan.md` §2.
```

**Acceptance criteria impact:** None (existing AC correctly test the routes). PP version bump to v8.

---

### S10-ST-19: Quality score recalculation viability after processErasure anonymisation

**Severity:** Pass
**Slice section:** §2.8 (file: `01-erasure-flow.md`), AC-21
**Upstream reference:** D&L §4, S9 §1

Quality score recalculation is scheduled for anonymised company listings because the verification dimension drops ~10 points when the tier reverts to "unclaimed". The concern was whether `computeQualityScore` works when `accountId = null` (unclaimed listing). S9 §1 `computeQualityScore` operates on `listing: Listing` — it reads listing fields directly (name, description, media, taxonomy tags, verification tier, engagement counters). The `accountId` field is not an input to quality scoring. Unclaimed listings have always had quality scores (S1 seeds ~4,700 unclaimed listings with zero-initialised scores; S9 replaces stubs with calibrated scoring). The verification dimension uses `verifications.tier`, not `accountId`. Enrichment schedules, decay signals, and perception aggregates are deleted for anonymised company listings (§2.5.2), but quality scoring does not depend on these tables. Correct — no gap.

---

### S10-ST-20: Closure flow step ordering matches SI §13.2 and PP §5

**Severity:** Pass
**Slice section:** §3.2 (file: `03-closure-flow.md`), AC-23
**Upstream reference:** SI §13.2, PP §5

SI §13.2 specifies: `PP: archive listings → PP: cancel Paddle → PP: anonymise enquiry data → PP: delete/defer buyer data → PP: deactivate account → PP: emit account_closed`. S10 §3.2 `CLOSURE_FLOW_STEPS` registers: archive_listings, cancel_paddle_subscriptions, anonymise_enquiry_data, delete_defer_buyer_data, deactivate_account, emit_account_closed. All 6 steps in the same order, all assigned to `domain: "platform"`. Skip constraints match SI §3.5: steps 1 and 5 are NOT skippable, steps 2, 3, 4, 6 are skippable. PP §5 specifies the same 6-step sequence with the same ownership. Correct.
