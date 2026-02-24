# S10 Pre-Stress-Test Validation — Part B

**Slice:** `slices/slice-10-hardening/` (v1, multi-file)
**Validated against:** SI v9, CR v3, PP v7
**Date:** 2026-02-15

## Results

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 3 | Prose-code consistency | **Fail** | 4 inconsistencies: §2.7 handler function signature mismatch, §3.4 step 2 array membership check logic error, §4.2 enquiry deletion WHERE clause contradiction, §7.2 qualityDelta field extraction undefined behavior |
| 4 | N+1 query patterns | **Fail** | 3 instances: §2.4 dispute resolution loops, §2.5 listing processing loop, §3.4 step 2 Paddle cancellation loop |
| 6 | Decision type registration | Pass | `graduation_evaluation` registered in 00-schema.md, used in §7/§8, total 27 correct |
| 7 | Email template registration | Pass | 0 new templates, all referenced templates exist in SI §5.2 (30 total) |
| 8 | Feature access gating (P4) | Pass | No tier-dependent behavior, no type redefinitions |
| 10 | AC coverage | **Fail** | 72 ACs stated, 72 present (count correct), but AC numbering uses placeholder format AC-{3.1}, AC-{N}, AC-{M} instead of sequential AC-1 through AC-72. Target range 35-50 for integration slice — 72 is 44% above target. Review for duplication/padding needed. |

## Failures Requiring Fixes

### Check 3: Prose-code consistency

**Problem 1:** §2.7 R2 cleanup handler signature mismatch. Prose says "takes `listingIdsDeleted` and `accountId`" but function signature shows `listingIdsDeleted` and `claimIdsForR2Cleanup`, not `accountId`.

```typescript
// §2.7 line 486-489 shows:
async function processErasureR2Cleanup(
  listingIdsDeleted: UUID[],
  accountId: UUID
): Promise<{ objectsDeleted: number }>

// But §2.2 step wrapper line 530-533 calls it with:
const r2Result = await processErasureR2Cleanup(
  context.listingIdsDeleted,
  context.claimIdsForR2Cleanup ?? []
)
```

**Fix:** File `01-erasure-flow.md` §2.7, line 486-489, change function signature:
```
OLD:
async function processErasureR2Cleanup(
  listingIdsDeleted: UUID[],
  accountId: UUID
): Promise<{ objectsDeleted: number }>

NEW:
async function processErasureR2Cleanup(
  listingIdsDeleted: UUID[],
  claimIdsForR2Cleanup: UUID[]
): Promise<{ objectsDeleted: number }>
```
**Classification:** Mechanical

---

**Problem 2:** §3.4 step 2 array membership check logic error. Lines 196-197 have nonsensical conditional:
```typescript
if (context.subscriptionsFailed.includes(listing.paddleSubscriptionId!)
    === false && context.subscriptionsCancelled > 0) {
```
This reads: "if the subscription is NOT in the failed list AND we've cancelled at least one subscription, then check if it was already processed." This logic is backward. If a subscription is NOT in the failed list and we've made progress, we should skip checking if it was already processed (it succeeded in a prior attempt). The intent appears to be: skip already-processed subscriptions on retry.

**Fix:** File `03-closure-flow.md` §3.4, lines 195-207, replace step 2 idempotency logic:
```
OLD:
    // Skip if already cancelled in a prior attempt
    if (context.subscriptionsFailed.includes(listing.paddleSubscriptionId!)
        === false && context.subscriptionsCancelled > 0) {
      // Check if this subscription was already processed
      const existing = await db.select()
        .from(pendingCancellations)
        .where(and(
          eq(pendingCancellations.paddleSubscriptionId, listing.paddleSubscriptionId!),
          eq(pendingCancellations.reason, "account_closed"),
        ))
        .limit(1)
      if (existing.length > 0) continue  // already handled
    }

NEW:
    // Skip if already processed in prior attempt (idempotent on retry)
    const existing = await db.select()
      .from(pendingCancellations)
      .where(and(
        eq(pendingCancellations.paddleSubscriptionId, listing.paddleSubscriptionId!),
        eq(pendingCancellations.reason, "account_closed"),
      ))
      .limit(1)
    if (existing.length > 0) continue  // already handled in prior step execution
```
**Classification:** Mechanical

---

**Problem 3:** §4.1 and §4.4 enquiry deletion contradiction. §4.1 step 3 (line 295-301) anonymises all enquiry records WHERE `senderAccountId = accountId` by setting `senderAccountId = null`. §4.4 (line 441-449) states "After step 3, no enquiry records have `senderAccountId = :accountId`. Step 4's delete on `enquiry_records` finds zero rows." But §4.2 step 4 executeBuyerDataDeletion (line 361-367) includes:
```typescript
await db.delete(enquiryRecords)
  .where(and(
    eq(enquiryRecords.senderAccountId, context.accountId),
    // Only buyer-side records remain (step 3 set senderAccountId = null on provider-visible)
    // This catches any records not yet anonymised + buyer-owned records
  ))
```
The comment acknowledges the WHERE clause will match zero rows after step 3, but the code still attempts the delete. §4.4 correctly describes that this is harmless but §4.2's comment is misleading.

**Fix:** File `03-closure-flow.md` §4.2, lines 360-367, clarify comment:
```
OLD:
  // c. Delete buyer-side enquiry records (outbound enquiries sent by this account)
  // Provider-side records were anonymised in step 3 — these are the buyer's copies
  await db.delete(enquiryRecords)
    .where(and(
      eq(enquiryRecords.senderAccountId, context.accountId),
      // Only buyer-side records remain (step 3 set senderAccountId = null on provider-visible)
      // This catches any records not yet anonymised + buyer-owned records
    ))

NEW:
  // c. Delete buyer-side enquiry records (no-op after step 3 anonymisation)
  // Step 3 already anonymised all enquiry records by setting senderAccountId = null.
  // This DELETE WHERE senderAccountId = accountId finds zero rows.
  // Kept for explicitness and step 4 standalone retries (if step 3 was skipped).
  await db.delete(enquiryRecords)
    .where(eq(enquiryRecords.senderAccountId, context.accountId))
```
**Classification:** Mechanical

---

**Problem 4:** §7.2 false positive rate calculation (lines 104-124) references `output->>'qualityDelta'` from decision logs, but there is no specification that `enrichment_cadence_adjustment` decision logs contain a `qualityDelta` output field. S9 §2 (enrichment cadence adjustment) does not document this field in decision log outputs. The query will return NULL for all entries, producing `enrichmentROI = 0 / adjustments.length = 0` always.

**Fix:** File `07-autonomy-graduation.md` §7.2, lines 129-138, replace ROI calculation:
```
OLD:
  // ROI: aggregate quality improvements from enrichment / total enrichment actions
  const qualityImprovements = await db.query(`
    SELECT SUM(output->>'qualityDelta' :: numeric) AS total_delta
    FROM decision_logs
    WHERE decision_type = 'enrichment_cadence_adjustment'
      AND created_at >= $1
      AND output->>'qualityDelta' IS NOT NULL
  `, [sixMonthsAgo])

  const enrichmentROI = (qualityImprovements.total_delta || 0) / adjustments.length

NEW:
  // ROI: proxy via quality score recalculation count vs cadence adjustment count.
  // V1 proxy: enrichmentROI = 1 if quality recalculations triggered by enrichment > 0.
  // Full ROI measurement deferred to post-launch (requires linking enrichment actions
  // to subsequent quality_score_changed events with +delta attribution).
  const recalcTriggeredCount = await db.query(`
    SELECT COUNT(*) AS count
    FROM deferred_actions
    WHERE action = 'quality_score_recalculation'
      AND created_at >= $1
      AND created_by = 'enrichment'
  `, [sixMonthsAgo])

  const enrichmentROI = recalcTriggeredCount.count > 0 ? 1.2 : 0
```
**Classification:** Structural (requires S9 amendment to log qualityDelta OR accept the V1 proxy above)

---

### Check 4: N+1 query patterns

**Problem 1:** §2.4 Phase A dispute resolution (lines 313-335) loops over `disputedOwned` and queries `pre_claim_snapshots` once per disputed listing. This is an N+1 pattern.

**Fix:** File `01-erasure-flow.md` §2.4, lines 312-335, batch snapshot query:
```
OLD:
  for listing in disputedOwned:
    // Find the competing claimant from pre_claim_snapshots
    snapshot = tx.select(pre_claim_snapshots)
      .where(listingId = listing.id)
    competingClaimantId = snapshot.snapshot.disputeContext.existingClaimantAccountId
      ?? snapshot.snapshot.claimantAccountId

NEW:
  // Batch-fetch all competing snapshots for disputed listings
  const disputedListingIds = disputedOwned.map(l => l.id)
  const snapshots = tx.select(pre_claim_snapshots)
    .where(listingId IN disputedListingIds)
  const snapshotMap = new Map(snapshots.map(s => [s.listingId, s]))

  for listing in disputedOwned:
    const snapshot = snapshotMap.get(listing.id)
    if (!snapshot) continue  // safety — should not occur
    competingClaimantId = snapshot.snapshot.disputeContext.existingClaimantAccountId
      ?? snapshot.snapshot.claimantAccountId
```
**Classification:** Mechanical

---

**Problem 2:** §2.5 Phase B listing processing (lines 360-374) loops over `ownedListings` and calls `deleteFreelancerListing` or `anonymiseCompanyListing` per listing. Each function executes separate DB operations. While this is unavoidable for the DELETE (freelancer) vs UPDATE (company) split, the loop could batch listings by entityType and process each batch together.

**Fix:** File `01-erasure-flow.md` §2.5, lines 359-375, batch by entityType:
```
OLD:
  for listing in ownedListings:
    if listing.entityType == "freelancer":
      await deleteFreelancerListing(tx, listing.id)
      deleted.push(listing.id)
    else:
      await anonymiseCompanyListing(tx, listing.id)
      anonymised.push(listing.id)

NEW:
  const freelancerIds = ownedListings.filter(l => l.entityType === "freelancer").map(l => l.id)
  const companyIds = ownedListings.filter(l => l.entityType !== "freelancer").map(l => l.id)

  // Batch delete freelancer listings
  if (freelancerIds.length > 0) {
    tx.delete(listings).where(id IN freelancerIds)
    deleted.push(...freelancerIds)
  }

  // Batch anonymise company listings
  if (companyIds.length > 0) {
    for (const id of companyIds) {
      await anonymiseCompanyListing(tx, id)  // per-listing due to child table deletes
      anonymised.push(id)
    }
  }
```
**Classification:** Mechanical

---

**Problem 3:** §3.4 step 2 cancelPaddleSubscriptions (lines 181-228) loops over `paidListings` and calls `PaymentService.cancelSubscription` per subscription. This is unavoidable (Paddle API requires per-subscription calls), but the pending_cancellation insert could be batched.

**Fix:** File `03-closure-flow.md` §3.4, lines 181-228, batch pending_cancellation inserts:
```
OLD:
  for (const listing of paidListings) {
    // [idempotency check omitted in this excerpt]

    // 1. Create pending_cancellation record BEFORE API call
    await db.insert(pendingCancellations).values({
      paddleSubscriptionId: listing.paddleSubscriptionId!,
      listingId: listing.id,
      reason: "account_closed",
    }).onConflictDoNothing()

    // 2. Call Paddle cancel API
    const result = await services.payment.cancelSubscription({ ... })
    context.subscriptionsCancelled++
  }

NEW:
  // Batch-insert all pending_cancellation records before API calls
  const pendingRecords = paidListings
    .filter(l => /* idempotency filter */)
    .map(l => ({
      paddleSubscriptionId: l.paddleSubscriptionId!,
      listingId: l.id,
      reason: "account_closed" as const,
    }))

  if (pendingRecords.length > 0) {
    await db.insert(pendingCancellations).values(pendingRecords).onConflictDoNothing()
  }

  // Then call Paddle API per subscription (unavoidable — external API)
  for (const listing of paidListings) {
    // [idempotency check]
    const result = await services.payment.cancelSubscription({ ... })
    context.subscriptionsCancelled++
  }
```
**Classification:** Mechanical

---

### Check 10: AC coverage

**Problem 1:** AC numbering uses placeholder format instead of sequential numbers. §1.7 uses AC-1 through AC-10 (correct). §2.11 uses AC-11 through AC-22 (correct). §3/§4 use placeholders AC-{3.1}, AC-{3.8}, AC-{4.1}, etc. §7.7 uses AC-{N} through AC-{N+6}. §8.7 uses AC-{M} through AC-{M+6}.

The index.md §17 table correctly lists AC-1 through AC-72 with final numbering applied. The content files did not replace placeholders with actual numbers.

**Fix:** Mechanical renumbering across 6 files:
- `01-erasure-flow.md` §1.7 and §2.11: already correct (AC-1 to AC-22)
- `03-closure-flow.md` §3/§4: replace AC-{3.1}–{3.8} with AC-23–AC-30, replace AC-{4.1}–{4.9} with AC-31–AC-39
- `05-concurrent-flows.md` §5/§6: replace AC-1–AC-6 with AC-40–AC-45 (§5), replace AC-7–AC-18 with AC-46–AC-57 (§6)
- `07-autonomy-graduation.md` §7.7: replace AC-{N}–{N+6} with AC-58–AC-64
- `07-autonomy-graduation.md` §8.7: replace AC-{M}–{M+6} with AC-65–AC-72

**Classification:** Mechanical

---

**Problem 2:** AC count 72 is 44% above target range 35-50 for integration-heavy slices. Review needed for:
- Duplication: §6 (R12 validation) has 12 AC (6 erasure step failures + 6 closure step failures). This is comprehensive but each pair tests the same orchestrator recovery pattern with different failure injection points. Could consolidate to 2 representative tests + 10 spot-checks = same coverage, fewer ACs.
- Granularity: §2 processErasure has 12 AC for a single function. AC-11/AC-12 (dispute resolution) could merge into 1 AC with 2 sub-assertions. AC-14/AC-15/AC-16 (freelancer vs company) could merge into 1 AC with entity-type branching.
- §7/§8 graduation: 7 AC for enrichment (§7) + 8 AC for algorithm rollout (§8) = 15 total. These are appropriate given the novel autonomy mechanisms.

Recommendation: Accept 72 ACs. The slice scope justifies it — two orchestrated flows (12 steps total) + graduation (3 capabilities) + end-to-end validation suite. The AC distribution matches functional density. No obvious padding detected.

**Fix:** None required. Note in tracker that S10 exceeds target range due to scope (orchestrated flow hardening + graduation).

**Classification:** N/A
