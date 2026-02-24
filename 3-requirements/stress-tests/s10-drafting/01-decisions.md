# S10 Decisions — Hardening

**Status:** Phase 1 output (decisions)
**Generated:** 2026-02-15
**Target:** Content agents for Phase 2

---

## Purpose

Resolves design choices that Phase 2 content agents require before drafting. S10 is a hardening slice — most infrastructure exists (S0/S7 orchestrator, S9 intelligence, S4 subscriptions, S1 schema). Decisions are about wiring, failure handling, graduation criteria, and algorithm rollout.

---

## Decision Summary

7 binding decisions:

| # | Decision | Recommendation | Rationale |
|---|----------|---------------|-----------|
| D1 | SQ-3 Resolution: Paddle cancellation retry policy during closure | Orchestrator step handles retry, not separate deferred action. Step calls `PaymentService.cancelSubscription` per subscription. If API fails, orchestrator step fails. Admin retries via S7 flow admin UI. Step is skippable (SI §3.5). Policy: `retry_3` with exponential backoff (1s, 2s, 4s). | Checklist default confirmed. Paddle webhook may arrive independently — pending_cancellation registry handles attribution regardless. No separate deferred action needed — the orchestrator step IS the retry mechanism. Aligns with SQ-2 orchestrated flow recovery model. |
| D2 | processErasure R2 cleanup failure handling | **Split into two sub-steps WITHIN the same orchestrator step.** Step wrapper: run DB transaction, then run R2 cleanup. If DB succeeds but R2 fails, mark step as failed with error context `"db_complete_r2_failed"`. On retry, step checks context and skips DB transaction if already committed. Both operations idempotent. | Alternative (two orchestrator steps) adds admin complexity for no gain — the DB transaction and R2 cleanup are logically a single step (processErasure). Sub-step split makes the failure mode explicit while preserving step atomicity for admin recovery. R2 cleanup is idempotent (prefix-based deletion). |
| D3 | graduation_evaluation decision type: single type vs multiple types | **Single type.** `graduation_evaluation` covers enrichment cadence (S9-1), ceremony auto-apply (S9-2), and algorithm rollout (S9-3). Log payload: `{ subEntity, capability, currentMetrics, thresholds, graduated: boolean, reason }`. | Checklist default confirmed. The three capabilities are variants of the same pattern (graduated autonomy expansion). Single decision type with structured payload is simpler than three separate types. SI §9.2 amendment: +1 decision type (26 → 27). |
| D4 | Closure step ordering | **Authoritative: SI §13.2 and PP §5.** Archive listings (step 1) → cancel Paddle (step 2) → anonymise enquiries (step 3) → delete/defer buyer data (step 4) → deactivate account (step 5) → emit account_closed (step 6). Steps 1 and 5 NOT skippable. Steps 2, 3, 4, 6 skippable. | Confirmed from SI §13.2 and PP §5. Consistent with SI §3.5 skip constraint matrix. Note: SI §3.5 states step 5 (deactivate account) is NOT skippable. Checklist §6 is correct — no inconsistency. |
| D5 | Erasure step ordering | **Authoritative: SI §13.1.** Ops verify identity (step 1) → Ops extract data (step 2) → Ops close tickets (step 3) → D&L processErasure (step 4) → Ops close DSAR case (step 5) → D&L emit erasure_completed (step 6). Steps 1, 4, 5 NOT skippable. Steps 2, 3, 6 skippable. | Confirmed from SI §13.1. Step 5 closes DSAR case + creates audit record (called directly by orchestrator, not via event bus per XI-11). Step 6 emits event triggering reactive consumers (PP, CR). |
| D6 | Algorithm versioning: deterministic vs random traffic split | **Deterministic hash on listingId.** `hash(listingId) % 100 < rolloutPercentage`. The same listing always gets the same algorithm version for a given rollout percentage. | Enables consistent comparison across rollout stages. A listing scored by V2 at 10% rollout is scored by V2 again at 25%. Prevents confounding from listing churn across cohorts. Alternative (random per run) would produce noise in band transition metrics. |
| D7 | Autonomy graduation measurement frequency | **S9-1 (enrichment cadence):** Monthly check against `graduation_evaluation` decision logs (requires 6 months of data). **S9-2 (ceremony auto-apply):** Per-ceremony run (precedent matching already logged in `ceremony_runs`). **S9-3 (algorithm versioning):** Weekly comparison of V1 vs V2 band distributions. | S9-1 requires long-window measurement (6 months). S9-2 is event-driven (ceremony completes → check auto-apply criteria). S9-3 requires frequent monitoring during rollout (weekly cadence catches regression fast). Measurement frequency matches decision authority timescale. |

---

## Decision Details

### D1: SQ-3 Resolution (Paddle Cancellation Retry)

**Question:** Deferred action retry policy for Paddle cancellations during account closure. [Source: REQUIREMENTS-TRACKER.md SQ-3, Checklist §7]

**Options:**

1. **Orchestrator step handles retry** (checklist default). Step calls `PaymentService.cancelSubscription` per subscription. If API fails, orchestrator step fails. Admin retries via S7 flow admin. Step is skippable (SI §3.5).
2. Separate deferred action. Orchestrator step schedules `paddle_cancellation` deferred action per subscription. Deferred action retries. If exhausted, auto-escalates.
3. Optimistic webhook-only. Orchestrator step creates `pending_cancellation` records but doesn't call Paddle API. Webhook arrival completes cancellation.

**Recommendation:** Option 1 (orchestrator step handles retry).

**Rationale:**

SQ-2 establishes orchestrated flows as the recovery pattern for multi-step sequences. The closure flow already uses the orchestrator (SI §13.2, PP §5). Paddle cancellation is step 2 of 6 — it must complete before step 3 (anonymise enquiries) can run.

Option 2 (separate deferred action) breaks the flow sequence — the orchestrator doesn't know when the deferred action completes, so it can't proceed to step 3. This would require polling or callback, which is more complex than step retry.

Option 3 (webhook-only) is unsafe — if Paddle webhook fails to arrive (network, outage, edge case), the subscription is never cancelled. The orchestrator has no signal that cancellation completed.

**Paddle webhook independence:** Paddle may send `subscription.canceled` webhook before, during, or after the API call completes. The pending_cancellation registry (S4 §5) handles attribution regardless — webhook and API paths converge on the same result. The orchestrator step creates the pending_cancellation record with `reason: "account_closed"` BEFORE calling the API. When the webhook arrives, Operations processes it, emits `subscription_ended` with closure attribution (XI-7), and the flow continues.

**Retry policy:** `retry_3` with exponential backoff (1s, 2s, 4s). After 3 failures, orchestrator step fails. Admin sees error in S7 flow admin UI. Admin retries the step. If Paddle is permanently down, admin can skip step 2 (step is skippable per SI §3.5) and confirm manual cancellation via Paddle dashboard.

**Skip safety:** Skipping step 2 means the subscriptions remain active in Paddle. The skip warning (SI §3.5) says: "Skipping = admin confirms Paddle cancellations will be handled manually." This is acceptable — closure ≠ billing requirement. The account is deactivated (step 5), listings are archived (step 1). The admin can cancel subscriptions manually post-closure.

**Implementation:** PP closure flow (§3) iterates `subscriptions` table rows WHERE `accountId = triggeredBy` AND `status = "active"`. For each subscription, creates `pending_cancellation` record, then calls `PaymentService.cancelSubscription({ paddleSubscriptionId, reason: "account_closed", effectiveFrom: "immediately" })`. If API call throws, the orchestrator step fails. S7 admin UI shows retry action. Admin retries step 2. Prior subscriptions already cancelled (idempotent — Paddle API returns success for already-cancelled subscriptions). Remaining subscriptions are cancelled on retry.

---

### D2: processErasure R2 Cleanup Failure Handling

**Question:** What happens if R2 cleanup fails after DB transaction commits? [Source: Checklist §10 processErasure inventory]

**Context:** processErasure is a single DB transaction covering dispute resolution, listing deletion/anonymisation, account anonymisation (Checklist §10). R2 cleanup (delete freelancer images, delete claim evidence) is external, outside the DB transaction. If DB commits but R2 fails: listings are anonymised/deleted but orphan images persist in R2.

**Options:**

1. **Single orchestrator step with two sub-steps** (DB transaction, then R2 cleanup). If DB succeeds but R2 fails, mark step as failed with context `"db_complete_r2_failed"`. On retry, step checks context and skips DB transaction if already committed.
2. Two orchestrator steps. Step 4a: DB transaction. Step 4b: R2 cleanup. Both independently retryable.
3. Best-effort R2 cleanup. If R2 fails, log warning but mark step as completed. Orphan cleanup via separate deferred action.

**Recommendation:** Option 1 (single step with sub-step split).

**Rationale:**

Option 2 (two orchestrator steps) is administratively complex for no gain. processErasure is conceptually a single operation — "erase this account's data". Splitting it into two steps means the admin sees "Step 4a: processErasure DB" and "Step 4b: processErasure R2" in the flow UI. This is an implementation detail exposed as user-facing structure.

Option 3 (best-effort) leaves orphan images permanently. GDPR erasure requires deletion of all personal data, not just DB rows. R2 images for freelancer listings contain personal data (portfolio images may show faces, names). Marking the step as completed when R2 fails is a compliance risk.

**Option 1 solution:** The orchestrator step wrapper executes two sub-steps sequentially:

```typescript
async function processErasureStep(context: ErasureContext): Promise<void> {
  // Sub-step 1: DB transaction
  if (!context.dbTransactionCompleted) {
    await db.transaction(async (tx) => {
      // Resolve disputes, delete freelancer listings, anonymise company listings,
      // delete account data (per Checklist §10)
    })
    context.dbTransactionCompleted = true
    context.listingIdsDeleted = [...]
    context.listingIdsAnonymised = [...]
  }

  // Sub-step 2: R2 cleanup (idempotent)
  const deletedImages = await r2.deleteByPrefix(`listings/${listingId}/images/`)
  const deletedEvidence = await r2.deleteByPrefix(`claims/${claimId}/evidence/`)

  // If R2 throws, the orchestrator step fails. Context is persisted.
  // On retry, sub-step 1 is skipped (context.dbTransactionCompleted = true).
  // Sub-step 2 retries (idempotent — R2 deleteByPrefix returns success if prefix empty).
}
```

The orchestrator persists `context` with the progress record (SI §3.3). On step failure, admin retries. The step reads `context.dbTransactionCompleted`, skips the DB transaction, and retries R2 cleanup.

**Idempotency:** R2 `deleteByPrefix` is idempotent. Deleting an already-deleted prefix returns success. The DB transaction is also idempotent — if re-run, listings are already anonymised (no-op) or already deleted (FK cascade prevents orphan rows).

**Error context:** When R2 fails, the orchestrator step sets `error: "R2 cleanup failed after DB transaction committed. DB state: ${listingIdsDeleted.length} deleted, ${listingIdsAnonymised.length} anonymised. R2 state: pending cleanup."` This is surfaced in S7 admin UI, so the admin knows the DB transaction completed successfully.

---

### D3: graduation_evaluation Decision Type

**Question:** Single `graduation_evaluation` decision type vs three separate types (enrichment_cadence_graduation, ceremony_auto_apply_graduation, algorithm_rollout_graduation)? [Source: Checklist §9]

**Options:**

1. **Single type.** `graduation_evaluation` with structured payload distinguishing the three capabilities.
2. Three separate types. One per S9-1/S9-2/S9-3 capability.

**Recommendation:** Option 1 (single type).

**Rationale:**

The three capabilities (enrichment cadence auto-adjustment, ceremony auto-apply, algorithm versioning) are variants of the same pattern: **graduated autonomy expansion**. The decision structure is identical:

- Evaluate current performance metrics against thresholds
- If thresholds met, expand decision authority (graduate)
- If thresholds not met, continue escalating

The log payload captures the distinction:

```typescript
type GraduationEvaluationDecision = {
  subEntity: "data-and-listings" | "operations" | "platform" | "commercial"
  capability: "enrichment_cadence_adjustment" | "ceremony_auto_apply" | "algorithm_rollout"
  currentMetrics: Record<string, number>   // e.g., { falsePositiveRate: 0.015, enrichmentROI: 1.2 }
  thresholds: Record<string, number>       // e.g., { falsePositiveRate: 0.02, enrichmentROI: 1.0 }
  graduated: boolean                       // true if all thresholds met
  reason: string                           // "All criteria met" | "FP rate above threshold" | ...
}
```

Three separate types would duplicate this structure. The only difference is the `capability` field and the specific metric names in `currentMetrics`. This is a poor fit for separate types — it's a single decision pattern with parametric variation.

**SI §9.2 amendment:** +1 decision type: `graduation_evaluation`. Total decision types: 27 (was 26 in S9).

**Query pattern:** When querying graduation status, filter by `subEntity` + `capability` + `timestamp >= 6_months_ago` (for S9-1) or `timestamp >= last_ceremony_run` (for S9-2).

---

### D4: Closure Step Ordering Clarification

**Question:** Confirm authoritative closure step sequence and skip constraints. [Source: Checklist §6 question]

**Authoritative sources:** SI §13.2, PP §5, SI §3.5.

**Confirmed sequence:**

1. **Archive all listings** (PP/D&L) — NOT skippable. Listings must be removed from search.
2. **Cancel Paddle subscriptions** (PP → Paddle API + pending_cancellation records) — Skippable. Paddle webhook may handle independently.
3. **Anonymise buyer enquiry data in provider inboxes** (PP) — Skippable. Privacy risk accepted if skipped, admin handles manually.
4. **Delete/defer buyer data** (PP) — Skippable. Compliance hold check: if hold active, defer via `compliance_hold_recheck` deferred action. If no hold, delete shortlists/saved_searches/enquiries. If skipped, data retained longer than expected (no legal violation — closure ≠ erasure).
5. **Deactivate account** (PP) — NOT skippable. Account must be disabled. `lifecycleStatus = "closed"`.
6. **Emit account_closed event** (PP → D&L/Ops/CR consumers) — Skippable. Legally compliant (account closed). Operationally inconsistent (search index, enrichment schedules). Admin triggers manual cleanup if skipped.

**Skip constraint verification:** SI §3.5 closure table matches. No inconsistency between SI §3.5 and SI §13.2. Checklist §6 is correct.

**Step 1 domain ownership:** SI §13.2 says "PP: archive listings (per listing)". D&L owns the `listings` table and emits `listing_archived` event (D&L §1.4). PP orchestrates the closure flow and calls D&L's archive function per listing. Step 1 is a PP orchestrator step that invokes D&L operations.

---

### D5: Erasure Step Ordering Clarification

**Question:** Confirm authoritative erasure step sequence and skip constraints. [Source: Checklist §6 question]

**Authoritative sources:** SI §13.1, SI §3.5.

**Confirmed sequence:**

1. **Verify identity (72h acknowledgment)** (Ops) — NOT skippable. Legal requirement. Without verified identity, erasure cannot proceed.
2. **Extract account data for compliance audit record** (Ops) — Skippable. Data loss for audit trail. Admin accepts accountability. Warning: "Skipping extraction means no audit record of erased data."
3. **Close active support tickets** (Ops) — Skippable. Tickets remain open. Ops cleans up manually.
4. **Execute processErasure** (D&L) — NOT skippable. The entire point of the flow. Single DB transaction + R2 cleanup (per D2).
5. **Close DSAR case + create compliance audit record** (Ops) — NOT skippable. Compliance audit record is legally required. DSAR case must close to clear compliance hold (XI-11). **Called directly by orchestrator, not via event bus** (SI §13.1 note).
6. **Emit erasure_completed + downstream consumers** (D&L → PP/CR) — Skippable. Legally compliant (data erased). Operationally inconsistent (search index still has deleted data, shortlists reference erased listings, win-back schedules not cancelled). Admin triggers manual cleanup if skipped.

**Step 5 execution pattern:** SI §13.1 says step 5 is "Ops: close DSAR case + audit record (within orchestrator's sequential execution)". This means the orchestrator calls the Operations function directly, NOT via the event bus. The erasure_completed event is emitted in step 6 AFTER the DSAR case is closed. This prevents a race where downstream consumers (PP, CR) react before the compliance audit record exists.

**Step 6 consumer table (existing):** All consumers for `erasure_completed` are already registered (S6, S8). No new consumers in S10. Checklist §4 confirms this.

---

### D6: Algorithm Versioning Traffic Split

**Question:** Deterministic hash on listingId vs random traffic split for algorithm A/B testing? [Source: Checklist §11 section 8 guidance, S9-3 flag]

**Options:**

1. **Deterministic hash.** `hash(listingId) % 100 < rolloutPercentage`. Same listing always gets same algorithm version for a given rollout percentage.
2. Random per scoring run. Each quality score recalculation randomly assigns V1 or V2 based on rollout percentage.

**Recommendation:** Option 1 (deterministic hash).

**Rationale:**

Rollout sequence: 10% → 25% → 50% → 100% over 4 weeks (Skeleton §8). At 10%, listing L1 hashed to bucket 7 → V2 algorithm. At 25%, same listing L1 still hashes to bucket 7 → V2 algorithm. Consistent assignment enables comparison across rollout stages.

Option 2 (random per run) would produce noise. Listing L1 scored by V2 at 10% rollout, then scored by V1 at 25% rollout (random assignment flipped). Quality band changes due to algorithm change are confounded with random reassignment. Metrics become uninterpretable.

**Hash function:** CRC32 on listingId UUID string. Modulo 100 gives bucket 0–99. Rollout 10% = buckets 0–9 use V2, buckets 10–99 use V1. Rollout 25% = buckets 0–24 use V2, buckets 25–99 use V1. Deterministic and stable.

**Implementation:** `quality_scores.algorithmVersion` column (S9 §1) tracks which algorithm scored each listing. Weekly comparison (D7) queries `SELECT algorithmVersion, qualityBand, COUNT(*) FROM quality_scores GROUP BY algorithmVersion, qualityBand`. If V2 band distribution diverges (>10% more listings declassified), rollback trigger fires.

**Rollback:** Set rollout percentage to 0%. All listings revert to V1. Re-score affected listings (those with `algorithmVersion = "V2"`). If V2 caused systematic quality regression, the re-score corrects it.

---

### D7: Autonomy Graduation Measurement Frequency

**Question:** How frequently to measure graduation criteria for S9-1/S9-2/S9-3? [Source: Checklist §11 section 7]

**S9-1 (Enrichment Cadence Auto-Adjustment):**

**Criteria:** False positive rate <2% over 6 months AND enrichment ROI positive. [Source: entity-architecture-frame §Design Principle 5, S9-1 flag]

**Measurement:** Monthly check against `graduation_evaluation` decision logs. Requires 6 months of data before first evaluation. Query: `SELECT * FROM decision_logs WHERE decisionType = 'graduation_evaluation' AND domain = 'data-and-listings' AND input->>'capability' = 'enrichment_cadence_adjustment' AND timestamp >= now() - interval '6 months'`.

**Frequency rationale:** Enrichment cadence is adjusted monthly (S9 §2). False positive rate (enrichment detected but listing quality unchanged after 90 days) is measured quarterly (S9 §4 data health review ceremony). 6-month window requires 2 ceremony cycles. Monthly graduation check is sufficient — changes are slow.

**S9-2 (Ceremony Auto-Apply):**

**Criteria:** Precedented (frequency ≥50), non-financial, non-user-visible. Taxonomy promotions with clean mapping are the safest V1 candidate. [Source: S9-2 flag, S9 §4]

**Measurement:** Per-ceremony run. When a ceremony completes, check `ceremony_runs` table for `ceremonyType` + `outcomeDisposition`. If `disposition: "auto_apply"`, count historical precedent. If precedent ≥50 AND constraints met (non-financial, non-user-visible), auto-apply. Otherwise, escalate to principal.

**Frequency rationale:** Ceremony runs are event-driven. Data health review is monthly. Taxonomy review is quarterly. Conversion funnel analysis is monthly. Each ceremony run evaluates its own auto-apply eligibility. No separate graduation schedule — it's per-ceremony.

**S9-3 (Algorithm Versioning):**

**Criteria:** Quality regression monitoring. Rollback if V2 produces >10% more band declassifications than V1. [Source: Skeleton §8, S9-3 flag]

**Measurement:** Weekly comparison of V1 vs V2 band distributions during rollout. Query: `SELECT algorithmVersion, qualityBand, COUNT(*) FROM quality_scores WHERE updatedAt >= now() - interval '7 days' GROUP BY algorithmVersion, qualityBand`. Compare band transition rates (e.g., "excellent" → "good", "good" → "fair"). If V2 declassifies >10% more listings, rollback.

**Frequency rationale:** Algorithm rollout is 10% → 25% → 50% → 100% over 4 weeks (1 week per stage). Weekly measurement catches regression before the next stage. Monthly measurement would be too slow — by the time regression is detected, 50% of listings could be affected.

---

## SI §9.2 Amendment

**Addition:** +1 decision type.

| Decision Type | Domain | Trigger | New? |
|---------------|--------|---------|------|
| `graduation_evaluation` | Cross-domain | Periodic evaluation of sub-entity graduation criteria (enrichment cadence, ceremony auto-apply, algorithm rollout) | Yes |

**New total:** 27 decision types (was 26 in S9).

---

## Summary

All 7 decisions resolved. Checklist defaults confirmed for D1 (SQ-3), D3 (single graduation type), D4/D5 (step ordering). D2 (R2 cleanup) and D6 (deterministic hash) choose the option that simplifies admin recovery and enables clean metrics. D7 (measurement frequency) matches decision authority timescale.

Content agents for Phase 2 can proceed with these bindings.
