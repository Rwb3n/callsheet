# S10 Stress Test — Hardening

**Slice:** `slices/slice-10-hardening/` (v1)
**Tested against:** SI v9, D&L v6, Ops v4, PP v7, CR v3
**Date:** 2026-02-15
**Scenarios:** 19
**Raw scenarios:** 20 (12 Agent A + 8 Agent B, 1 deduped: `compliance_hold_recheck` params mismatch appeared in both partitions)
**Severity distribution:** 2 High, 7 Medium, 3 Low, 7 Pass

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S10-ST-1 | `graduation_evaluation` decision type missing from SI §9.2 | Medium | §13 (index.md) | SI §9.2 | S10 declares +1 decision type (total 27) but SI §9.2 does not list it. 11th consecutive three-part sync gap. |
| S10-ST-2 | `compliance_hold_recheck` params mismatch: SI requires `flowId`, S10 omits it | High | §4 (03-closure-flow.md) | SI §2.1 | SI `DeferredActionParamsMap` defines `compliance_hold_recheck: { accountId: UUID; flowId: UUID }`. S10 schedules with `{ accountId: UUID }` only — compiler rejects. |
| S10-ST-3 | `processErasureR2Cleanup` called with contradictory second argument in two call sites within same file | High | §2.2, §2.7 | D&L §1.9, SI §6.1 | §2.2 initial wrapper passes `context.accountId` (UUID); §2.7 revised wrapper passes `context.claimIdsForR2Cleanup` (UUID[]). Function signature expects `claimIdsForR2Cleanup: UUID[]`. Initial wrapper would fail at runtime (UUID is not UUID[]). |
| S10-ST-4 | `account_closed` event payload correct against PP §1.9 `AccountClosedEvent` | Pass | §3.4 | PP §1.9 | Correct |
| S10-ST-5 | `closeDSARCase` not exported in Ops interface contract | Medium | §1 (01-erasure-flow.md) | Ops §3 | Erasure step 5 calls `closeDSARCase` directly (AC-5, AC-9), but Ops exposes only 5 query interfaces — none is `closeDSARCase`. Contract surface gap. |
| S10-ST-6 | Function name inconsistency: `hasComplianceHold` vs `checkComplianceHold` | Medium | §5 (05-concurrent-flows.md) | Ops §3.2 | §5 pseudocode calls `hasComplianceHold(accountId)` returning `boolean`. Ops §3.2 exports `checkComplianceHold(accountId): ComplianceHoldResult` where `holdExists: boolean`. |
| S10-ST-7 | `auto_escalation_check` params mismatch: SI requires `flowType`, S10 omits it | Medium | §10 (index.md) | SI §2.1 | SI defines `auto_escalation_check: { flowId: UUID; flowType: "erasure" \| "closure" }`. S10 §10 lists params as `{ flowId: UUID }` only. |
| S10-ST-8 | AC-42 lists `email_preferences` in `compliance_hold_recheck` deletion set — not deleted anywhere in code | Medium | §5.4, index §17 | PP §5, SI §5.3 | AC-42 says handler deletes "buyer-side enquiry_records, email_preferences" but neither `executeBuyerDataDeletion` (§4.2) nor `processErasure` (§2.6) deletes an `email_preferences` table. Email preferences are a JSONB column on `account_profiles`, already set to all-false by processErasure. |
| S10-ST-9 | `compliance_hold_recheck` handler divergence between §4 and §5 (pattern #14) | Medium | §4 (03-closure-flow.md) vs §5 (05-concurrent-flows.md) | Ops §3.2 | Two implementations of the same handler. §4.3 queries `closureFlow.status !== "completed"` exits early. §5.4 queries `closureFlow.status !== "completed"` exits early. Different but logically compatible — however, §5.4 adds `hasBuyerData` check that §4.3 omits. |
| S10-ST-10 | Autonomy graduation admin routes absent from PP interface spec | Medium | §7, 00-router-plan §2 | PP §3, PP §5 | PP interface spec covers account closure orchestration (§5) and `getListingAnalytics` (§3) but contains no mention of `admin.graduation.*` routes. These 5 routes constitute a new admin surface area within Platform's boundary that the PP spec does not document. |
| S10-ST-11 | CR `erasure_completed` consumer: win-back cancellation scope | Low | §9 (index.md) | CR §2, S8 AC-77 | S10 §9 says "Cancel win-back schedules" but does not specify matching on `listingIdsAnonymised ∪ listingIdsDeleted`. S8 AC-77 specifies the union. Ambiguity, not error. |
| S10-ST-12 | `algorithm_comparison` decision type used but not registered in SI §9.2 | Low | §8 (07-autonomy-graduation.md) | SI §9.2 | §8.2 logs `algorithm_comparison` as a `decisionType` in `decision_logs`. Not registered in SI §9.2. S10 §8.2 explicitly notes this is "operational telemetry, not a new autonomous decision type" — acceptable but undocumented. |
| S10-ST-13 | `erasure_completed` payload missing `companyListingsAnonymised` count field | Low | §1.4 | D&L §1.9 | D&L §1.9 `ErasureCompletedEvent` does not include a `companyListingsAnonymised` count (only `freelancerListingsDeleted` is retained for backward compat). Correct — no gap. |
| S10-ST-14 | Erasure step 6 domain attribution: S10 says `data-and-listings`, SI §13.1 says D&L emits | Pass | §1 (01-erasure-flow.md) | SI §13.1, D&L §1.9 | Correct |
| S10-ST-15 | Skip constraint matrix alignment: erasure steps | Pass | §1 (01-erasure-flow.md) | SI §3.5 | Correct |
| S10-ST-16 | Skip constraint matrix alignment: closure steps | Pass | §3 (03-closure-flow.md) | SI §3.5 | Correct |
| S10-ST-17 | CR `account_closed` consumer: churn log scope for free-tier listings | Pass | §9 (index.md) | CR §2, S8 AC-74/75 | Correct |
| S10-ST-18 | Quality score recalculation after anonymisation: `accountId = null` does not block scoring | Pass | §2.8 | D&L §4, S9 §1 | Correct |
| S10-ST-19 | Closure flow step ordering matches SI §13.2 and PP §5 specification | Pass | §3.2 | SI §13.2, PP §5 | Correct |

## Detailed Findings

### S10-ST-1: `graduation_evaluation` decision type missing from SI §9.2

**Severity:** Medium
**Slice section:** §13 (index.md), §7 (07-autonomy-graduation.md AC-62, AC-70), §00 (00-schema.md §2)
**Upstream reference:** SI §9.2

**Problem:** S10 adds `graduation_evaluation` as a new decision type (total 27, up from 26). S10 index.md §13 states "27 decision types (26 from S9 + `graduation_evaluation`)". S10 00-schema.md §2 specifies the full `GraduationEvaluationDecision` payload type. However, SI §9.2 currently lists only 26 decision types across 5 domain categories — `graduation_evaluation` does not appear. This is the 11th consecutive three-part sync gap (S0–S10). At implementation time, the type will be undocumented in the authoritative registry. While `decisionType` is `text` (no DDL change needed), SI §9.2 is the compilation boundary for decision type documentation.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §9.2
- Change: Add `graduation_evaluation` to the Cross-domain row. Current row reads:
  `| Cross-domain | ceremony_outcome_evaluation (domain varies per ceremony type — uses ceremonyDomainMap) |`
  New row should read:
  `| Cross-domain | ceremony_outcome_evaluation (domain varies per ceremony type — uses ceremonyDomainMap), graduation_evaluation |`

**Acceptance criteria impact:** None — AC-62 and AC-70 already test `logDecision("graduation_evaluation", ...)`.

---

### S10-ST-2: `compliance_hold_recheck` params mismatch — SI requires `flowId`, S10 omits it

**Severity:** High
**Slice section:** §4 (03-closure-flow.md §4.2), §5 (05-concurrent-flows.md §5.4)
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`

**Problem:** SI §2.1 defines `compliance_hold_recheck: { accountId: UUID; flowId: UUID }`. S10 schedules this deferred action with `{ accountId: UUID }` only — no `flowId`. The `DeferredActionParamsMap` is a typed discriminated union enforced at compile time (settled decision: TypeScript const exports). Omitting `flowId` produces a compiler error. The `flowId` field makes sense — the handler in §4.3 queries the closure flow by `flowType` and `triggeredBy` (accountId), but could use `flowId` directly for a precise lookup. S10 index.md §10 also lists the params as `{ accountId: UUID }` without `flowId`.

Either S10 must include `flowId` in its scheduling calls, or SI §2.1 must be amended to make `flowId` optional.

**Fix — slice (option A: include flowId):**
- Section: §4.2 (03-closure-flow.md)
- Old:
```typescript
    await scheduleDeferredAction({
      action: "compliance_hold_recheck",
      params: { accountId: context.accountId },
```
- New:
```typescript
    await scheduleDeferredAction({
      action: "compliance_hold_recheck",
      params: { accountId: context.accountId, flowId: flow.flowId },
```

- Section: §5.4 (05-concurrent-flows.md)
- Old:
```typescript
    await scheduleDeferredAction("compliance_hold_recheck", {
      accountId: params.accountId
    }, { delayDays: 7 })
```
- New:
```typescript
    await scheduleDeferredAction("compliance_hold_recheck", {
      accountId: params.accountId,
      flowId: params.flowId
    }, { delayDays: 7 })
```

- Section: index.md §10 deferred actions table
- Old: `| compliance_hold_recheck | { accountId: UUID } | Ops |`
- New: `| compliance_hold_recheck | { accountId: UUID, flowId: UUID } | Ops |`

**Fix — slice (handler update):**
- Section: §4.3 (03-closure-flow.md) and §5.4 (05-concurrent-flows.md)
- The handler's `params` type changes from `{ accountId: UUID }` to `{ accountId: UUID; flowId: UUID }`. The handler should use `flowId` for direct lookup instead of querying by `flowType + triggeredBy`:
- Old: `const flow = await db.select().from(orchestratedFlows).where(and(eq(orchestratedFlows.flowType, "closure"), eq(orchestratedFlows.triggeredBy, accountId), ...)).limit(1)`
- New: `const flow = await db.select().from(orchestratedFlows).where(eq(orchestratedFlows.id, params.flowId)).limit(1)`

**Acceptance criteria impact:** AC-33, AC-41 should reference `flowId` in the deferred action params.

---

### S10-ST-3: `processErasureR2Cleanup` internal contradiction — two call sites disagree on second argument

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

### S10-ST-5: `closeDSARCase` not exported in Ops interface contract

**Severity:** Medium
**Slice section:** §1.4 step 5 (01-erasure-flow.md), AC-5, AC-9
**Upstream reference:** Ops §3 (query interfaces)

**Problem:** Erasure step 5 calls `closeDSARCase(context)` directly on the Operations sub-entity (AC-5 specifies "calls Operations' `closeDSARCase` directly — not dispatched via the event bus"). The Ops interface spec (v4) exports 5 query interfaces: `hasActiveTicket`, `checkComplianceHold`, `getDSARStatus`, `getFeatureGateFrictionSummary`, `getBillingReconciliationStatus`. None is a mutation interface for closing a DSAR case. `closeDSARCase` is a state-mutating operation (updates `compliance_register`, inserts audit row, clears compliance hold) — not a read-only query.

The entity architecture mandates "Event bus, not direct calls" for state-change reactions, with query interfaces only where eventual consistency is insufficient. The erasure flow is an exception (orchestrated, sequential, XI-11 compliant). But the Ops contract surface must still declare the function if other domains call it directly.

**Fix — sibling specs:**
- Document: `interfaces/operations.md`
- Section: After §3.5 (or as §3.6)
- Change: Add a new mutation interface:

```
### 3.6 closeDSARCase

Mutation. Called by the erasure flow orchestrator (step 5) — not via event bus [XI-11].

\`\`\`typescript
function closeDSARCase(params: {
  dsarCaseId: UUID
  accountId: UUID
  auditData: {
    listingIdsDeleted: UUID[]
    listingIdsAnonymised: UUID[]
    freelancerListingsDeleted: number
    companyListingsAnonymised: number
    accountHash: string
  }
}): Promise<{ completed: boolean }>
\`\`\`

**Consumer:** Erasure flow orchestrator (SI §13.1 step 5). Updates `compliance_register` status to `'completed'`. Inserts `erasure_audit` compliance record. Clears DSAR compliance hold.
```

- Also update summary line from "5 query interfaces" to "5 query interfaces + 1 mutation interface".

**Acceptance criteria impact:** None — AC-5 and AC-9 already specify the expected behaviour.

---

### S10-ST-6: Function name inconsistency: `hasComplianceHold` vs `checkComplianceHold`

**Severity:** Medium
**Slice section:** §5 (05-concurrent-flows.md §5.1, §5.2, §5.4), §4 (03-closure-flow.md §4.2)
**Upstream reference:** Ops §3.2 `checkComplianceHold`

**Problem:** Ops §3.2 exports `checkComplianceHold(accountId: UUID): ComplianceHoldResult` where `ComplianceHoldResult = { holdExists: boolean, reason?: string, holdType?: ... }`. S10 uses two different names for this function:

1. §4.2 and AC-33 correctly call `checkComplianceHold(context.accountId)` and check `holdResult.holdExists`.
2. §5.1, §5.2, §5.4 pseudocode, and AC-41 call `hasComplianceHold(accountId)` returning a plain `boolean`.

The function name mismatch is a compile-time error. The return type mismatch (boolean vs `ComplianceHoldResult`) changes how the handler interacts with the result — `holdActive` (boolean) vs `holdResult.holdExists` (property access).

**Fix — slice:**
- Section: §5.1, §5.2 (05-concurrent-flows.md) — prose references
- Old: `Calls hasComplianceHold(accountId)`
- New: `Calls checkComplianceHold(accountId)` (throughout §5.1, §5.2 prose)

- Section: §5.4 (05-concurrent-flows.md) — pseudocode
- Old:
```typescript
  const holdActive = await hasComplianceHold(params.accountId)
  // [Source: Ops §3.2 — hasComplianceHold query]

  if (holdActive) {
```
- New:
```typescript
  const holdResult = await checkComplianceHold(params.accountId)
  // [Source: Ops §3.2 — checkComplianceHold query]

  if (holdResult.holdExists) {
```

- Section: index.md AC-41
- Old: `Closure step 4, when hasComplianceHold returns true`
- New: `Closure step 4, when checkComplianceHold returns holdExists: true`

- Section: index.md §19 cross-references
- Old: `§3.2 hasComplianceHold query`
- New: `§3.2 checkComplianceHold query`

- Section: 00-schema.md table row
- Old: `hasComplianceHold(accountId)` query
- New: `checkComplianceHold(accountId)` query

**Acceptance criteria impact:** AC-41 wording change (see fix above).

---

### S10-ST-7: `auto_escalation_check` params mismatch — S10 omits `flowType`

**Severity:** Medium
**Slice section:** §10 (index.md deferred actions table)
**Upstream reference:** SI §2.1 `DeferredActionParamsMap`

**Problem:** SI §2.1 defines `auto_escalation_check: { flowId: UUID; flowType: "erasure" | "closure" }`. S10 index.md §10 lists the params as `{ flowId: UUID }` without `flowType`. While this is a documentation error in the index.md table (the actual scheduling is done by the generic orchestrator engine from S0, not by S10 flow code), the index.md table is a reference that a fix-applier or implementer would trust. The `flowType` field matters because auto-escalation behaviour differs between erasure (deadline proximity alerts) and closure (no deadline).

**Fix — slice:**
- Section: index.md §10 deferred actions table
- Old: `| auto_escalation_check | { flowId: UUID } | SI | On retry threshold exceeded (3 failures) | S0 | No |`
- New: `| auto_escalation_check | { flowId: UUID, flowType: "erasure" \| "closure" } | SI | On retry threshold exceeded (3 failures) | S0 | No |`

**Acceptance criteria impact:** None — AC-52 tests escalation scheduling behaviour, not params shape.

---

### S10-ST-8: AC-42 lists `email_preferences` as deleted by `compliance_hold_recheck` — no such table or deletion exists

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

### S10-ST-9: `compliance_hold_recheck` handler divergence between §4 and §5

**Severity:** Medium
**Slice section:** §4.3 (03-closure-flow.md) vs §5.4 (05-concurrent-flows.md)
**Upstream reference:** Ops §3.2

**Problem:** Two files describe the `compliance_hold_recheck` handler with different logic:

1. **§4.3** (03-closure-flow.md): Queries closure flow by `flowType + triggeredBy`. If flow not found or not `"in_progress"`, returns. If `buyerDataDeferred` is false, returns. Calls `executeBuyerDataDeletion(context)`. Updates flow context.

2. **§5.4** (05-concurrent-flows.md): Queries closure flow by `flowType + triggeredBy`. If flow not found or `status !== "completed"`, returns. If `buyerDataDeferred` is false, returns. **Additionally** calls `hasBuyerData(params.accountId)` and exits early if no buyer data exists (processErasure already deleted it). Then calls `deleteBuyerData(params.accountId)`.

Differences: (a) §4.3 checks `status !== "in_progress"` while §5.4 checks `status !== "completed"` — semantically opposite conditions for the same guard. (b) §5.4 adds a `hasBuyerData` idempotency check that §4.3 lacks. (c) §4.3 calls `executeBuyerDataDeletion(context)` (takes context object), §5.4 calls `deleteBuyerData(params.accountId)` (takes accountId).

This is pattern #14 (content agent divergence). The §5.4 version is more complete (handles the concurrent flow scenario where processErasure already deleted the data). The §4.3 version should be designated non-authoritative.

**Fix — slice:**
- Section: §4.3 (03-closure-flow.md)
- Old: The entire `handleComplianceHoldRecheck` function implementation in §4.3
- New: Replace with a cross-reference: "Handler implementation: see §5.4 (05-concurrent-flows.md). §5.4 is authoritative — it covers both the standalone recheck case and the concurrent erasure+closure case."

Additionally, §5.4's flow status check should be corrected:
- Section: §5.4 (05-concurrent-flows.md)
- Old: `if (!closureFlow || closureFlow.status !== "completed") return`
- New: `if (!closureFlow) return`
- Rationale: The flow may be `"completed"` (steps 5-6 ran, buyer data was deferred) or `"in_progress"` (step 4 deferred, flow continues). Both are valid states for the handler to execute. Restricting to `"completed"` is too narrow.

**Acceptance criteria impact:** None — AC-36/37/38/42/43/44 already cover both paths.

---

### S10-ST-10: Autonomy graduation admin routes absent from PP interface spec

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

### S10-ST-11: CR `erasure_completed` consumer — win-back cancellation scope description

**Severity:** Low
**Slice section:** §9 (index.md)
**Upstream reference:** CR §2, S8 AC-77

**Problem:** S10 index.md §9 describes the CR `erasure_completed` consumer as "Cancel win-back schedules, anonymise churn log entries, clear conversion trigger state". S8 AC-77 specifies matching on `listingIdsAnonymised ∪ listingIdsDeleted` for the win-back cancellation. S10's description omits the union scope. Not an error — S10 §9 is a summary table, and S8 AC-77 is authoritative. However, the description could lead an implementer to cancel all win-back schedules for the account rather than per-listing.

**Fix — slice:**
- Section: index.md §9, `erasure_completed` CR consumer handler column
- Old: `Cancel win-back schedules, anonymise churn log entries, clear conversion trigger state`
- New: `Cancel win-back schedules for listings in listingIdsAnonymised ∪ listingIdsDeleted, anonymise churn log entries by listingId (CR-ST-15), clear conversion trigger state`

**Acceptance criteria impact:** None.

---

### S10-ST-12: `algorithm_comparison` decision type used but not registered in SI §9.2

**Severity:** Low
**Slice section:** §8.2 (07-autonomy-graduation.md)
**Upstream reference:** SI §9.2

**Problem:** §8.2 calls `logDecision("algorithm_comparison", ...)` to record comparative scoring results during rollout. This is a new `decisionType` value written to the `decision_logs` table. While S10 §8.2 explicitly acknowledges that `algorithm_comparison` is "operational telemetry, not a new autonomous decision type" and that the column is `text` (no DDL change), this means SI §9.2 is no longer a complete registry of decision types that appear in `decision_logs`. The `admin.graduation.algorithmComparison` route (router plan §2) queries these entries.

Documenting it in SI §9.2 as a telemetry type (distinct from autonomous decision types) would maintain the registry as a complete index.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §9.2
- Change: Add a note after the decision types table:

```
**Telemetry types (non-autonomous):** `algorithm_comparison` — logged during quality score algorithm rollout (S10 §8). Operational telemetry for A/B comparison, not an autonomous decision. Queried by `admin.graduation.algorithmComparison`.
```

**Acceptance criteria impact:** None.

---

### S10-ST-13: `erasure_completed` payload field coverage

**Severity:** Low
**Slice section:** §1.4, AC-6 (file: `01-erasure-flow.md`)
**Upstream reference:** D&L §1.9 `ErasureCompletedEvent`

**Problem:** AC-6 lists the `erasure_completed` payload fields as: `accountHash`, `senderAccountId`, `listingIdsAnonymised`, `listingIdsDeleted`, `freelancerListingsDeleted`, `timestamp`. The D&L §1.9 `ErasureCompletedEvent` type contains exactly these 6 fields (plus the `type` discriminator). The slice's step 6 emit code (§1.4) emits exactly these fields. The `companyListingsAnonymised` count that exists in `ErasureContext` is NOT included in the event payload, which is correct — D&L §1.9 retained only `freelancerListingsDeleted` as a count for "backward compat" and replaced the company count with the `listingIdsAnonymised` UUID array. No gap.

**Fix — slice:** None.

**Acceptance criteria impact:** None.

---

### S10-ST-14: Erasure step 6 domain attribution

**Severity:** Pass
**Slice section:** §1.3 (01-erasure-flow.md)
**Upstream reference:** SI §13.1, D&L §1.9

S10 assigns erasure step 6 (`emit_erasure_completed`) to domain `"data-and-listings"` in `ERASURE_FLOW_STEPS`. SI §13.1 specifies "D&L: emit erasure_completed" as the final step. D&L §1.9 confirms D&L is the emitter. Consistent.

---

### S10-ST-15: Skip constraint matrix alignment — erasure

**Severity:** Pass
**Slice section:** §1.3 (01-erasure-flow.md)
**Upstream reference:** SI §3.5

S10 erasure steps: 1 NOT skippable (verify_identity), 2 skippable (extract_account_data), 3 skippable (close_active_tickets), 4 NOT skippable (process_erasure), 5 NOT skippable (close_dsar_case), 6 skippable (emit_erasure_completed). SI §3.5 erasure matrix: step 1 No, step 2 Yes, step 3 Yes, step 4 No, step 5 No, step 6 Yes. Exact match.

---

### S10-ST-16: Skip constraint matrix alignment — closure

**Severity:** Pass
**Slice section:** §3.2 (03-closure-flow.md)
**Upstream reference:** SI §3.5

S10 closure steps: 1 NOT skippable (archive_listings), 2 skippable (cancel_paddle_subscriptions), 3 skippable (anonymise_enquiry_data), 4 skippable (delete_defer_buyer_data), 5 NOT skippable (deactivate_account), 6 skippable (emit_account_closed). SI §3.5 closure matrix: step 1 No, step 2 Yes, step 3 Yes, step 4 Yes, step 5 No, step 6 Yes. Exact match.

---

### S10-ST-17: CR `account_closed` consumer — free-tier churn log exclusion

**Severity:** Pass
**Slice section:** §9 (index.md)
**Upstream reference:** CR §2, S8 AC-74/AC-75

S10 index.md §9 describes the CR `account_closed` consumer as "Record closure in churn analysis, clear conversion state". S8 AC-74 specifies churn logging for paid listings only. S8 AC-75 explicitly skips free-tier listings. S10's summary is consistent — "record closure" implicitly defers to S8's authoritative handler. CR §2 consumer table says "Log churn (account closure). Cancel win-back schedules." Both consistent.

---

### S10-ST-18: Quality score recalculation viability after processErasure anonymisation

**Severity:** Pass
**Slice section:** §2.8 (file: `01-erasure-flow.md`), AC-21
**Upstream reference:** D&L §4, S9 §1

Quality score recalculation is scheduled for anonymised company listings because the verification dimension drops ~10 points when the tier reverts to "unclaimed". The concern was whether `computeQualityScore` works when `accountId = null` (unclaimed listing). S9 §1 `computeQualityScore` operates on `listing: Listing` — it reads listing fields directly (name, description, media, taxonomy tags, verification tier, engagement counters). The `accountId` field is not an input to quality scoring. Unclaimed listings have always had quality scores (S1 seeds ~4,700 unclaimed listings with zero-initialised scores; S9 replaces stubs with calibrated scoring). The verification dimension uses `verifications.tier`, not `accountId`. Enrichment schedules, decay signals, and perception aggregates are deleted for anonymised company listings (§2.5.2), but quality scoring does not depend on these tables. Correct — no gap.

---

### S10-ST-19: Closure flow step ordering matches SI §13.2 and PP §5

**Severity:** Pass
**Slice section:** §3.2 (file: `03-closure-flow.md`), AC-23
**Upstream reference:** SI §13.2, PP §5

SI §13.2 specifies: `PP: archive listings → PP: cancel Paddle → PP: anonymise enquiry data → PP: delete/defer buyer data → PP: deactivate account → PP: emit account_closed`. S10 §3.2 `CLOSURE_FLOW_STEPS` registers: archive_listings, cancel_paddle_subscriptions, anonymise_enquiry_data, delete_defer_buyer_data, deactivate_account, emit_account_closed. All 6 steps in the same order, all assigned to `domain: "platform"`. Skip constraints match SI §3.5: steps 1 and 5 are NOT skippable, steps 2, 3, 4, 6 are skippable. PP §5 specifies the same 6-step sequence with the same ownership. Correct.

## Summary

S10 stress test surfaces 2 High, 7 Medium, 3 Low, 7 Pass (37% pass rate). The 11th consecutive three-part sync gap (SI §9.2 missing `graduation_evaluation`) shows the drafter skill's SI sync verification gate does not prevent all registry omissions. Pattern #14 (content agent divergence) recurred twice: `processErasureR2Cleanup` call signature contradiction (§2.2 vs §2.7) and `compliance_hold_recheck` handler divergence (§4.3 vs §5.4). The §5.4 version is more complete and should be authoritative. Two params mismatches (`compliance_hold_recheck` missing `flowId`, `auto_escalation_check` missing `flowType`) reflect the gap between SI §2.1 and S10's index.md deferred actions table — the table is a reference, not a copy. Ops interface spec missing `closeDSARCase` mutation and PP missing `admin.graduation.*` routes are surface area completeness gaps. Overall slice quality is consistent with prior multi-file slices (S6–S9), with the majority of findings being interface boundary mismatches and content agent divergence.

### Downstream Flag Audit

S10 has 0 downstream flags. All 3 flags from S10 v1 (S10-1, S10-2, S10-3) are upstream flags, not downstream. S10 is the final slice in the requirements sequence — no future slices depend on its outputs.

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `interfaces/shared-infrastructure.md` | §9.2 | Add `graduation_evaluation` to Cross-domain decision types row | S10-ST-1 |
| `interfaces/shared-infrastructure.md` | §9.2 | Add telemetry types note documenting `algorithm_comparison` | S10-ST-12 |
| `interfaces/operations.md` | §3.6 (new) | Add `closeDSARCase` mutation interface | S10-ST-5 |
| `interfaces/platform-and-product.md` | §6 (new) | Add autonomy graduation admin surface (5 routes) | S10-ST-10 |
