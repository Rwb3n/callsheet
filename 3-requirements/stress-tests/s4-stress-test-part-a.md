Now I have all the files. Let me perform the detailed analysis.

# S4 Stress Test — Subscriptions (CR / Ops / SI Boundaries)

**Slice:** `slices/slice-04-subscriptions.md` (v1)
**Tested against:** `interfaces/commercial-and-revenue.md` (v2), `interfaces/operations.md` (v3), `interfaces/shared-infrastructure.md` (v3)
**Date:** 2026-02-13
**Scenarios:** 12
**Severity distribution:** 3 High, 5 Medium, 2 Low, 2 Pass
**Total fixes:** 10

---

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S4-ST-1 | `DeferredActionParamsMap` missing `grace_period_expiry` and `checkout_precondition_retry` entries in SI §2.1 | **High** | §8.1, §12 | SI §2.1 | S4 defines two new deferred actions with typed params but SI `DeferredActionParamsMap` lacks both entries. Startup handler resolution will fail. |
| S4-ST-2 | SI §2.2 registered actions table missing S4 actions | **High** | §12 | SI §2.2 | SI §2.2 has no rows for `grace_period_expiry` or `checkout_precondition_retry`. Three-part sync broken (ParamsMap + registered actions + scheduling call). |
| S4-ST-3 | `subscription_ended` reason mapping in `finaliseSubscriptionEnd` does not match Ops §1.2 / CR §2 expected values | **High** | §2.7 | Ops §1.2, CR §2 | S4 maps `reason === "voluntary"` to `"cancellation"`, `"payment_failure"` to `"grace_period_expired"`, and everything else to `"account_closure"`. But `"listing_archived"` maps to `"account_closure"` — CR §2 consumer branches on `origin` (`"archival"` vs `"closure"`), not `reason`, so CR's churn log will record `reason: "account_closure"` for archival endings. Misleading. |
| S4-ST-4 | `PaymentService` extension in S4 §3.2 incompatible with SI §10.1 base signature | Medium | §3.2 | SI §10.1 | S4 extends `createCheckoutSession` with `billingCadence`, `couponCode`, `paddleCustomerId`, `existingSubscriptionId` params that SI §10.1 does not have. The base interface and the extended interface are both named `PaymentService` — no amendment mechanism documented. SI spec must be updated or S4 must document the extension as an amendment. |
| S4-ST-5 | `processedPaddleEvents` 30-day cleanup attributed to `billing_reconciliation` deferred action but SI §2.2 `billing_reconciliation` params type is `{}` — no mechanism to route cleanup | Medium | §1.4 | SI §2.1, §2.2 | S4 §1.4 says 30-day cleanup is done by `billing_reconciliation` deferred action (daily). SI §2.2 registers `billing_reconciliation` with params `{}`. But S4 §2.3 actually performs inline cleanup of `pending_cancellations` (>24h records) within the webhook handler. The `processedPaddleEvents` cleanup is only documented as a comment in §1.4 — no handler code implements it. Inconsistency. |
| S4-ST-6 | `subscription_ended` emitted from archival path (§7.1) uses `reason: "cancellation"` — conflicts with `finaliseSubscriptionEnd` which would map `"listing_archived"` differently | Medium | §7.1 | Ops §1.2 | §7.1 emits `subscription_ended` directly with hardcoded `reason: "cancellation"`. §2.7 `finaliseSubscriptionEnd` maps `"listing_archived"` to `"account_closure"` as a catch-all. Two emission paths for archival, two different reason values. Only one should exist. |
| S4-ST-7 | Archival path emits both `pending_cancellation_created` and `subscription_ended` simultaneously — but `subscription_ended` should only fire after Paddle confirms cancellation | Medium | §7.1 | Ops §5, CR §4.5 | §7.1 emits `subscription_ended` immediately alongside `pending_cancellation_created`. But Ops §5 says `pending_cancellation_created` triggers Ops to call `PaymentService.cancelSubscription`, then Paddle confirms via webhook, then Ops processes the webhook and emits `subscription_ended`. Emitting `subscription_ended` at archive time pre-empts the webhook flow and results in double emission. |
| S4-ST-8 | `applyDowngrade` emits `subscription_tier_changed` but is called from within the webhook handler which also emits `subscription_tier_changed` for downgrade events | Medium | §5.1, §2.5 | Ops §1.1 | `handleSubscriptionDowngraded` calls `applyDowngrade`, which emits `subscription_tier_changed` (§5.1 line 4). This is correct — `handleSubscriptionDowngraded` itself does not emit. But `applyDowngrade` is also called from `finaliseSubscriptionEnd` (§2.7), which means grace period expiry emits `subscription_tier_changed` (from `applyDowngrade`) AND `subscription_ended`. Need to confirm this double-emission is intentional and consumers handle it correctly. |
| S4-ST-9 | `listing_decay_warning` email template claimed as S4 addition but already exists in SI §5.2 Operations Compliance table | Low | §11 | SI §5.2 | §11 lists `listing_decay_warning` as S4-registered. SI §5.2 already lists it under Operations Compliance templates. S4 is not adding it — it already exists. Template count may be wrong. |
| S4-ST-10 | `EVENT_CONSUMER_MATRIX` entries for S4 consumers not documented | Low | §10 | SI §1.5 | S4 §10 registers 8 consumers but does not specify the corresponding `EVENT_CONSUMER_MATRIX` amendments. SI §1.5 requires every new consumer to update the matrix. Missing documentation — not a runtime bug (consumers will register), but the matrix is the authoritative compile-time check. |
| S4-ST-11 | `computeFeatureAccess` usage in S4 §4.1 matches CR §4.2 simplified signature | Pass | §4.1 | CR §4.2 | S4 calls `computeFeatureAccess(listing.subscriptionTier)` matching CR-ST-9 simplified input. Correct. |
| S4-ST-12 | `TIER_LIMITS` imported from CR, not redefined (P4 compliance) | Pass | §4.1, §5.1, §6.1 | CR §4.1 | S4 references `TIER_LIMITS[tier]` throughout downgrade and feature gating code. Module path (`src/domains/commercial/subscription/feature-access.ts`) places it in CR's domain. Correct. |

---

## Detailed Findings

### S4-ST-1: `DeferredActionParamsMap` missing S4 entries

**Severity:** High
**Slice section:** §8.1, §12
**Upstream reference:** SI §2.1

**Problem:** S4 defines two new deferred actions (`grace_period_expiry`, `checkout_precondition_retry`) with typed params in §8.1. SI §2.1 `DeferredActionParamsMap` does not contain either entry. The deferred action scheduler resolves handlers by action name keyed against this map — without the entries, TypeScript compilation will reject the `scheduleDeferredAction` calls. This is a repeat of the S2/S3 three-part-sync pattern (prior findings §1).

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add two entries to the type:

```typescript
grace_period_expiry: { listingId: UUID; gracePeriodId: UUID }
checkout_precondition_retry: { paddleEvent: CheckoutCompletedEvent; attemptCount: number; maxAttempts: number }
```

**Fix — slice:** None required (S4 §8.1 already defines the correct params shape).

**Acceptance criteria impact:** None — existing AC-26 through AC-30 cover grace period behaviour.

---

### S4-ST-2: SI §2.2 registered actions table missing S4 entries

**Severity:** High
**Slice section:** §12
**Upstream reference:** SI §2.2

**Problem:** SI §2.2 registers actions by domain with trigger, delay, retry, and on-failure columns. S4 introduces two new actions — neither appears in the SI table. The three-part sync requirement (ParamsMap entry + registered action row + handler code) is only two-thirds complete. Without the SI §2.2 rows, the startup registration check (`EVENT_CONSUMER_MATRIX` analogue for deferred actions) cannot validate the handlers exist.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.2 registered actions table
- Change: Add two rows:

| Domain | Action | Trigger | Delay | Retry | On Failure |
|---|---|---|---|---|---|
| Commercial | `grace_period_expiry` | Grace period created (payment failure or voluntary cancellation) | 14 days | `retry_3` | `alert_principal` |
| Operations | `checkout_precondition_retry` | `checkout_completed` webhook for unclaimed listing | 5 minutes (recurring up to 1 hour) | `once` | `log` |

**Fix — slice:** None. S4 §12 already documents both actions with correct retry/failure policies.

**Acceptance criteria impact:** None.

---

### S4-ST-3: `subscription_ended` reason mapping misaligns with event type definition

**Severity:** High
**Slice section:** §2.7
**Upstream reference:** Ops §1.2, CR §2

**Problem:** S4 `finaliseSubscriptionEnd` (§2.7) maps `CancellationReason` values to `SubscriptionEndedEvent.reason` via a ternary chain:

```
reason === "voluntary" ? "cancellation"
: reason === "payment_failure" ? "grace_period_expired"
: "account_closure"
```

The catch-all `"account_closure"` captures `"listing_archived"` and `"paddle_reconciliation"` — both of which are not account closures. Ops §1.2 defines `reason: "cancellation" | "grace_period_expired" | "account_closure"`. There is no `reason` value for `"listing_archived"` or `"paddle_reconciliation"` endings. CR §2 branches on `origin` not `reason` for churn logging, so this is not a functional break for CR. However, the `reason` field carries incorrect semantics — a listing archived by a provider who keeps their account is logged with `reason: "account_closure"`, which is misleading for entity learning (SI §9 decision logs) and any future consumer that branches on `reason`.

Two fixes: (a) expand the `SubscriptionEndedEvent.reason` union to cover all actual reasons, or (b) map `"listing_archived"` and `"paddle_reconciliation"` to `"cancellation"` since they are voluntary/administrative cancellations, not account closures.

**Fix — slice:**
- Section: §2.7 `finaliseSubscriptionEnd` reason mapping
- Old:
```typescript
reason: reason === "voluntary" ? "cancellation" : reason === "payment_failure" ? "grace_period_expired" : "account_closure",
```
- New:
```typescript
reason: reason === "payment_failure" ? "grace_period_expired"
  : reason === "account_closed" ? "account_closure"
  : "cancellation",  // voluntary, listing_archived, paddle_reconciliation
```

This maps `"listing_archived"` and `"paddle_reconciliation"` to `"cancellation"` (correct — they are cancellations, not account closures), while preserving `"account_closed"` → `"account_closure"`.

**Fix — sibling specs:** None. Ops §1.2 `reason` union already covers `"cancellation" | "grace_period_expired" | "account_closure"`. The fix corrects the mapping, not the type.

**Acceptance criteria impact:** AC-10 is relevant but does not test reason mapping for archival/reconciliation paths specifically. Add:

| # | Criterion | Test |
|---|---|---|
| AC-46 | `subscription_ended` emitted for `listing_archived` cancellation has `reason: "cancellation"` and `origin: "archival"` | Integration |
| AC-47 | `subscription_ended` emitted for `paddle_reconciliation` cancellation has `reason: "cancellation"` and `origin: "paddle"` | Integration |

---

### S4-ST-4: `PaymentService` extension undocumented in SI

**Severity:** Medium
**Slice section:** §3.2
**Upstream reference:** SI §10.1

**Problem:** S4 §3.2 redefines the full `PaymentService` interface with additional params (`billingCadence`, `couponCode`, `paddleCustomerId`, `existingSubscriptionId` on `createCheckoutSession`). SI §10.1 has the base interface without these params. S4 says "S4 amendment to SI §10.1" but the amendment is not applied to SI — both documents carry a `PaymentService` definition. At compile time, the S4 version will be used (assuming the import path resolves to S4's module), but there is no authoritative record that SI §10.1 has been extended. Future slices referencing SI §10.1 will see the stale signature.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §10.1 `PaymentService`
- Change: Update `createCheckoutSession` params to include:
```typescript
billingCadence?: "annual" | "monthly"
couponCode?: string
paddleCustomerId?: string
existingSubscriptionId?: string  // for upgrades (S4)
```
All new params are optional — existing callers unaffected.

**Fix — slice:**
- Section: §3.2
- Old: "S4 amendment to SI §10.1"
- New: "S4 amendment to SI §10.1 — SI spec updated with optional params. S4 passes all params; prior callers pass none."

**Acceptance criteria impact:** None.

---

### S4-ST-5: `processedPaddleEvents` cleanup mechanism incomplete

**Severity:** Medium
**Slice section:** §1.4
**Upstream reference:** SI §2.1, §2.2

**Problem:** S4 §1.4 states `processedPaddleEvents` has 30-day retention "cleaned up by billing_reconciliation deferred action (daily)." But: (a) SI §2.2 `billing_reconciliation` has params `{}` — there is no mechanism in the params to distinguish "run reconciliation" from "also clean up old paddle events"; (b) no handler code in S4 implements this cleanup within the `billing_reconciliation` handler; (c) `billing_reconciliation` is an Ops-owned daily deferred action whose purpose is billing reconciliation (Ops concept design §7), not paddle event cleanup. Piggybacking unrelated cleanup onto a billing action conflates concerns.

**Fix — slice:**
- Section: §1.4
- Old: `Retention: 30 days. Cleaned up by billing_reconciliation deferred action (daily).`
- New: `Retention: 30 days. Cleaned up by inline check within the webhook handler — on each webhook invocation, delete rows where processedAt < now() - 30 days (same pattern as pending_cancellation cleanup in §2.3 step 3). No separate deferred action needed.`

This follows the same pattern already established in §2.3 for `pending_cancellations` cleanup (inline during webhook processing). At V1 scale (~50-200 webhooks/day), inline cleanup adds negligible latency.

**Fix — sibling specs:** None.

**Acceptance criteria impact:** Modify AC-39 or add:

| # | Criterion | Test |
|---|---|---|
| AC-48 | `processedPaddleEvents` records older than 30 days are deleted during webhook processing | Integration |

---

### S4-ST-6: Archival path `subscription_ended` reason hardcoded incorrectly

**Severity:** Medium
**Slice section:** §7.1
**Upstream reference:** Ops §1.2

**Problem:** §7.1 emits `subscription_ended` with `reason: "cancellation" as const`. But if this emission survives (see S4-ST-7 for whether it should), the reason should reflect the archival context. The reason `"cancellation"` is technically correct per the S4-ST-3 fix (archival maps to `"cancellation"`), but §7.1 hardcodes it without using `finaliseSubscriptionEnd`, creating a parallel emission path with independently maintained reason logic. If `finaliseSubscriptionEnd` is the canonical path for emitting `subscription_ended` (as it is for all other paths), §7.1 should delegate to it or be removed entirely.

This finding is dependent on S4-ST-7: if the archival path should not emit `subscription_ended` at archive time (which S4-ST-7 argues), this scenario resolves automatically.

**Fix — slice:** Contingent on S4-ST-7. If S4-ST-7 fix is applied (remove `subscription_ended` from §7.1), this scenario is resolved. If not, replace hardcoded reason with `finaliseSubscriptionEnd(listing, "listing_archived", "archival")` to use the canonical path.

**Acceptance criteria impact:** AC-32 must be updated if S4-ST-7 fix is applied — see S4-ST-7 for details.

---

### S4-ST-7: Archival path double-emits `subscription_ended`

**Severity:** Medium
**Slice section:** §7.1
**Upstream reference:** Ops §5, CR §4.5, D&L interface spec §1.10

**Problem:** §7.1 emits both `pending_cancellation_created` and `subscription_ended` at archive time. The `pending_cancellation_created` event triggers Ops to call `PaymentService.cancelSubscription` [Source: Ops §5, S4 §10 consumer table]. When Paddle confirms the cancellation via webhook, Ops' webhook handler processes it, finds the pending cancellation record, and emits `subscription_ended` again via `finaliseSubscriptionEnd`. Result: two `subscription_ended` events for one archival. CR's churn consumer would double-log the churn event. PP would display a re-subscribe CTA twice.

The root cause is that §7.1 conflates the *initiation* of cancellation (emit `pending_cancellation_created` → Ops calls Paddle API) with the *completion* of cancellation (Paddle confirms → Ops emits `subscription_ended`). Only the initiation should happen at archive time.

D&L interface spec §1.10 says D&L emits `subscription_ended` for the archival path. This is the source of the double-emission — the D&L spec pre-dates the pending cancellation registry mechanism that routes archival cancellations through Paddle.

**Fix — slice:**
- Section: §7.1, the block after `pending_cancellation_created` emission
- Old:
```typescript
  // 2. Emit subscription_ended with origin "archival" [D&L interface spec §1.10]
  await emit(
    "subscription_ended",
    {
      type: "subscription_ended",
      listingId: listing.id,
      accountId: listing.accountId!,
      previousTier: listing.subscriptionTier,
      reason: "cancellation" as const,
      origin: "archival" as const,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )
```
- New:
```typescript
  // 2. No subscription_ended emission here — Paddle webhook confirmation
  // triggers Ops to emit subscription_ended with origin "archival" via
  // pending_cancellation registry attribution. [Resolves double-emission]
```

**Fix — sibling specs:**
- Document: `interfaces/data-and-listings.md`
- Section: §1.10
- Change: Remove or amend the statement that D&L emits `subscription_ended` for the archival path. D&L emits `pending_cancellation_created` only; Ops emits `subscription_ended` after Paddle confirms. The `origin: "archival"` attribution is preserved via the pending cancellation record's `reason: "listing_archived"`, which the webhook handler maps to `origin: "archival"`.

**Acceptance criteria impact:**
- AC-32: Change from "listing.archive for paid listing emits subscription_ended with origin: archival" to "listing.archive for paid listing does NOT emit subscription_ended — subscription_ended is emitted by Ops webhook handler after Paddle confirms cancellation, with origin: archival via pending_cancellation attribution"
- Add AC-49: "Paddle webhook for archival-path cancellation uses pending_cancellation reason `listing_archived` and emits `subscription_ended` with `origin: "archival"`"

---

### S4-ST-8: `applyDowngrade` emits `subscription_tier_changed` — double-emission risk in grace period expiry

**Severity:** Medium
**Slice section:** §5.1, §8.2
**Upstream reference:** Ops §1.1

**Problem:** `applyDowngrade` (§5.1) emits `subscription_tier_changed`. `finaliseSubscriptionEnd` (§2.7) calls `applyDowngrade` then emits `subscription_ended`. When grace period expires (§8.2), the handler calls `finaliseSubscriptionEnd`, which calls `applyDowngrade` (emitting `subscription_tier_changed` with `newTier: "free"`) and then emits `subscription_ended`. This produces two events: `subscription_tier_changed` followed by `subscription_ended`. This is intentional and correct — D&L needs `subscription_tier_changed` to update the listing's tier and restore/hide items, while CR and PP need `subscription_ended` for churn logging and CTA display. However, the consumer table in §10 does not document that both events fire together in the grace-period-expiry flow. Consumers must handle receiving both without conflicting side effects.

Specifically: PP consumer for `subscription_tier_changed` updates feature access. PP consumer for `subscription_ended` also sets feature access to free tier. These are idempotent (same result), so no functional break. But the `subscription_tier_changed` notification ("Your listing is now on the free tier") and the `subscription_ended` notification via PP re-subscribe CTA are redundant — the provider gets two notifications.

**Fix — slice:**
- Section: §5.1 `applyDowngrade`, notification block
- Old: The notification fires unconditionally in `applyDowngrade`.
- New: Add a parameter `suppressNotification?: boolean` to `applyDowngrade`. When called from `finaliseSubscriptionEnd`, pass `suppressNotification: true` — `finaliseSubscriptionEnd`'s `subscription_ended` event triggers the appropriate consumer notifications. When called from `handleSubscriptionDowngraded` (tier-to-tier downgrade, not cancellation), omit the param (defaults to false, notification fires).

```typescript
async function applyDowngrade(params: {
  listingId: UUID
  previousTier: SubscriptionTier
  newTier: SubscriptionTier
  suppressNotification?: boolean  // true when called from finaliseSubscriptionEnd
}): Promise<void>
```

And in the notification section of `applyDowngrade`:
```typescript
  // 5. Notification (suppressed when part of finaliseSubscriptionEnd — subscription_ended consumers handle notification)
  if (!params.suppressNotification) {
    // ... existing notification code
  }
```

**Fix — sibling specs:** None.

**Acceptance criteria impact:** Add:

| # | Criterion | Test |
|---|---|---|
| AC-50 | Grace period expiry produces both `subscription_tier_changed` and `subscription_ended` but only one provider notification (not two) | Integration |

---

### S4-ST-9: `listing_decay_warning` template double-counted

**Severity:** Low
**Slice section:** §11
**Upstream reference:** SI §5.2

**Problem:** §11 lists `listing_decay_warning` as one of S4's 2 registered templates. But SI §5.2 already lists `listing_decay_warning` under "Operations Compliance (4)" templates. S4 says "already registered in SI §5.2 — S4 adds it to template registry" — this is contradictory. If SI already registers it, S4 does not add it. S4's actual new template is only `subscription_confirmed`. The running count claim "S0 (2) + S2 (7) + S3 (4) + S4 (2) = 15" is wrong — it should be "S0 (2) + S2 (7) + S3 (4) + S4 (1) = 14" unless another template is identified.

However, checking where `listing_decay_warning` was first registered: it does not appear in S0, S2, or S3 slice template registrations. It appears only in SI §5.2's master inventory. The prior slices registered the transactional templates (S0: `email_verification`, `password_reset`; S2: 7 onboarding/claim templates; S3: 4 claim resolution templates). The Operations Compliance templates (`article_14_notice`, `dsar_acknowledgment`, `dsar_completion`, `listing_decay_warning`) were never assigned to a slice. So S4 is the first slice to claim `listing_decay_warning` — but it is not adding a new template; it is implementing one that SI already inventoried.

The fix is to either (a) count it as a slice-implemented template (not a new template) and adjust the language, or (b) assign it to S7 (Operations) since it is an Ops template triggered by D&L's decay signal.

**Fix — slice:**
- Section: §11
- Old: "S4 registers 2 email templates." and `listing_decay_warning` row
- New: "S4 registers 1 email template." Remove `listing_decay_warning` from the S4 template table (it is an Ops template, naturally belonging to S7 where Ops infrastructure is built). Update running count: "Template count after S4: S0 (2) + S2 (7) + S3 (4) + S4 (1) = 14 of 23."

**Fix — sibling specs:** None. SI §5.2 already has the template.

**Acceptance criteria impact:** None. S4 does not need an AC for `listing_decay_warning` — that is S7's responsibility.

---

### S4-ST-10: `EVENT_CONSUMER_MATRIX` amendments not documented

**Severity:** Low
**Slice section:** §10
**Upstream reference:** SI §1.5

**Problem:** S4 registers 8 event consumers (§10 table). SI §1.5 `EVENT_CONSUMER_MATRIX` is the authoritative startup check — every consumer must appear in the matrix. S4 does not document the required matrix amendments. This is a documentation gap, not a runtime bug (the consumers will still register and function), but the matrix is the compile-time safety net that prevents missing consumers from going unnoticed.

**Fix — slice:**
- Section: §10, after the consumer table
- Old: "All consumers are async."
- New: "All consumers are async. S4 adds the following entries to `EVENT_CONSUMER_MATRIX` (SI §1.5):"

```typescript
"subscription_tier_changed": [
  { domain: "data-and-listings", mode: "async" },  // already in matrix from S1
  { domain: "platform", mode: "async" },            // S4 addition (x2: featureAccessUpdate, providerNotification)
  { domain: "commercial", mode: "async" },           // S4 addition
],
"subscription_ended": [
  { domain: "platform", mode: "async" },             // S4 addition (x2: downgradeFeatureAccess, resubscribeCTA)
  { domain: "commercial", mode: "async" },            // S4 addition
],
"pending_cancellation_created": [
  { domain: "operations", mode: "async" },            // S4 addition
],
```

Note: Per XI-9, PP appears multiple times with the same mode for `subscription_tier_changed` and `subscription_ended` (two distinct consumers). The matrix validates that *at least* N handlers exist for a domain+mode pair.

**Fix — sibling specs:** None — the matrix entries are documented in the slice and applied at implementation time.

**Acceptance criteria impact:** None.

---

### S4-ST-11: `computeFeatureAccess` simplified signature compliance

**Severity:** Pass
**Slice section:** §4.1
**Upstream reference:** CR §4.2

S4 calls `computeFeatureAccess(listing.subscriptionTier)` — a `SubscriptionTier` value, matching CR-ST-9's simplified signature. The function is defined in `src/domains/commercial/subscription/feature-access.ts` (CR's domain). Correct.

---

### S4-ST-12: `TIER_LIMITS` import compliance (P4)

**Severity:** Pass
**Slice section:** §4.1, §5.1, §6.1
**Upstream reference:** CR §4.1

S4 references `TIER_LIMITS[tier]` in downgrade handling (§5.1), feature gating (§4.1), and pricing page (§6.1). The const is located in `src/domains/commercial/subscription/feature-access.ts` — CR's domain directory. S4 imports it; does not redefine. Correct.

---

## Summary

S4's CR and SI boundaries are generally well-aligned. The most significant structural issue is the archival-path double-emission of `subscription_ended` (S4-ST-7): §7.1 emits it at archive time AND the Paddle webhook handler emits it again after cancellation confirmation. This produces duplicate downstream effects. The fix is to remove the direct emission from §7.1 and let the pending cancellation registry handle attribution through the standard webhook flow.

The deferred action three-part sync gap (S4-ST-1, S4-ST-2) is a repeat of the S2/S3 pattern — SI's `DeferredActionParamsMap` and registered actions table must be updated whenever a slice introduces new deferred actions. The reason mapping in `finaliseSubscriptionEnd` (S4-ST-3) conflates archival and reconciliation cancellations with account closure, producing misleading churn data.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S4-1 | Correct | S5 subscription analytics display |
| S4-2 | Correct | S5/S8 churn intervention UI |
| S4-3 | Correct | S8 win-back evaluation logic |
| S4-4 | Correct | S8 conversion triggers |
| S4-5 | Correct | S8 revenue perception |
| S4-6 | Correct | S7 billing reconciliation UI |
| S4-7 | Correct | S7 feature gate friction |
| S4-8 | Correct | S7 refund processing UI |
| S4-9 | Correct | S8 sponsored placement |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `interfaces/shared-infrastructure.md` | §2.1 `DeferredActionParamsMap` | Add `grace_period_expiry` and `checkout_precondition_retry` entries | S4-ST-1 |
| `interfaces/shared-infrastructure.md` | §2.2 Registered actions table | Add two rows for `grace_period_expiry` (Commercial, 14d, retry_3, alert_principal) and `checkout_precondition_retry` (Operations, 5min recurring, once, log) | S4-ST-2 |
| `interfaces/shared-infrastructure.md` | §10.1 `PaymentService` | Add `billingCadence?`, `couponCode?`, `paddleCustomerId?`, `existingSubscriptionId?` to `createCheckoutSession` params | S4-ST-4 |
| `interfaces/data-and-listings.md` | §1.10 | Remove/amend D&L as emitter of `subscription_ended` for archival path — D&L emits `pending_cancellation_created` only; Ops emits `subscription_ended` after Paddle webhook confirmation | S4-ST-7 |