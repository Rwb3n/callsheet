# S4 Stress Test — Subscriptions (Merged)

**Slice:** `slices/slice-04-subscriptions.md` (v1)
**Tested against:** All 5 interface specs (SI v3, D&L v3, Ops v3, PP v3, CR v2)
**Date:** 2026-02-13
**Scenarios:** 17 (merged from 20 raw — 3 duplicates removed)
**Severity distribution:** 4 High, 7 Medium, 2 Low, 4 Pass
**Total fixes:** 16

**Partition sources:**
- Part A (CR + Ops + SI boundaries): 12 scenarios → `s4-stress-test-part-a.md`
- Part B (D&L + PP boundaries): 8 scenarios → `s4-stress-test-part-b.md`
- Dedup: S4-ST-7≡S4-ST-19 (merged as S4-ST-7, escalated to High), S4-ST-1/2≡S4-ST-20 (kept as S4-ST-1/2), S4-ST-9≡S4-ST-14 (merged as S4-ST-9)

---

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S4-ST-1 | `DeferredActionParamsMap` missing `grace_period_expiry` and `checkout_precondition_retry` | **High** | §8.1, §12 | SI §2.1 | Three-part sync broken — TypeScript compilation will reject `scheduleDeferredAction` calls. [Also found by Part B as S4-ST-20] |
| S4-ST-2 | SI §2.2 registered actions table missing S4 actions | **High** | §12 | SI §2.2 | No rows for `grace_period_expiry` or `checkout_precondition_retry`. Startup handler resolution will fail. [Also found by Part B as S4-ST-20] |
| S4-ST-3 | `subscription_ended` reason mapping catch-all maps `listing_archived` to `account_closure` | **High** | §2.7 | Ops §1.2, CR §2 | Archival/reconciliation cancellations incorrectly labelled as account closures in churn data and decision logs. |
| S4-ST-4 | `PaymentService` extension in S4 §3.2 undocumented in SI §10.1 | Medium | §3.2 | SI §10.1 | S4 extends `createCheckoutSession` with 4 new params. SI §10.1 has the stale base signature. Future slices see wrong interface. |
| S4-ST-5 | `processedPaddleEvents` 30-day cleanup mechanism incomplete | Medium | §1.4 | SI §2.1, §2.2 | Cleanup attributed to `billing_reconciliation` deferred action but no handler implements it. Fix: inline cleanup during webhook processing. |
| S4-ST-6 | Archival path `subscription_ended` reason hardcoded — bypasses `finaliseSubscriptionEnd` | Medium | §7.1 | Ops §1.2 | §7.1 hardcodes `reason: "cancellation"` without using canonical `finaliseSubscriptionEnd` path. Resolves automatically if S4-ST-7 fix applied. |
| S4-ST-7 | **Archival path double-emits `subscription_ended`** | **High** | §7.1 | Ops §5, CR §4.5, D&L §1.10 | §7.1 emits both `pending_cancellation_created` AND `subscription_ended`. Ops then processes Paddle webhook and emits `subscription_ended` again. Double downstream effects. Fix: D&L emits only `pending_cancellation_created`; Ops emits `subscription_ended` after Paddle confirms, with `origin: "archival"` via pending_cancellation registry attribution. [Both agents found independently: Part A S4-ST-7 + Part B S4-ST-19] |
| S4-ST-8 | `applyDowngrade` + `finaliseSubscriptionEnd` produce double notification on grace period expiry | Medium | §5.1, §8.2 | Ops §1.1 | Grace period expiry triggers both `subscription_tier_changed` notification (from `applyDowngrade`) and `subscription_ended` CTA (from `finaliseSubscriptionEnd`). Provider gets two notifications. Fix: `suppressNotification` param on `applyDowngrade`. |
| S4-ST-9 | `listing_decay_warning` template double-counted in S4 | Low | §11 | SI §5.2 | Already registered in SI §5.2. S4 claims it as an S4 addition — it is not. S4 contributes 1 new template, not 2. [Also found by Part B as S4-ST-14] |
| S4-ST-10 | `EVENT_CONSUMER_MATRIX` entries for S4 consumers not documented | Low | §10 | SI §1.5 | S4 §10 registers 8 consumers but does not specify the matrix amendments. Documentation gap — not a runtime bug. |
| S4-ST-11 | `computeFeatureAccess` simplified signature compliance | Pass | §4.1 | CR §4.2 | Correct. |
| S4-ST-12 | `TIER_LIMITS` imported from CR, not redefined (P4 compliance) | Pass | §4.1, §5.1, §6.1 | CR §4.1 | Correct. |
| S4-ST-13 | `subscription_confirmed` email template missing from PP §4 and SI §5.2 | Medium | §11 | PP §4, SI §5.2 | Template exists in S4 but was never added to upstream spec inventories. Total templates becomes 24 after S4. |
| S4-ST-15 | D&L `subscription_tier_changed` consumer extended for `restoreHiddenItems` — undocumented in D&L spec | Medium | §10 | D&L §2 | S4 extends consumer to restore hidden media/credits on upgrade. D&L interface spec §2 does not mention this action. |
| S4-ST-16 | `pending_cancellations` table in Ops namespace but PP writes directly for closure path | Medium | §1.3 | PP §5, entity-architecture-frame | Single-ownership violation. Pragmatic fix: document as exception justified by orchestrated flow synchronous sequencing requirement. PP's write scoped to closure path only. |
| S4-ST-17 | Feature gating middleware location in `src/lib/` is domain-neutral | Pass | §4.2 | PP §2 | Correct. |
| S4-ST-18 | Pricing page SSG + checkout CTA redirect targets verified | Pass | §6.2 | SI §7.1, PP §5 | Correct. |

---

## Detailed Findings

### S4-ST-1: `DeferredActionParamsMap` missing S4 entries

**Severity:** High
**Slice section:** §8.1, §12
**Upstream reference:** SI §2.1

S4 defines two new deferred actions (`grace_period_expiry`, `checkout_precondition_retry`) with typed params in §8.1. SI §2.1 `DeferredActionParamsMap` lacks both entries. TypeScript compilation will reject `scheduleDeferredAction` calls. Repeat of the S2/S3 three-part-sync pattern.

**Fix — sibling specs:**
- `interfaces/shared-infrastructure.md` §2.1 `DeferredActionParamsMap`: Add:
```typescript
grace_period_expiry: { listingId: UUID; gracePeriodId: UUID }
checkout_precondition_retry: { paddleEvent: CheckoutCompletedEvent; attemptCount: number; maxAttempts: number }
```

**Fix — slice:** None (S4 §8.1 already defines correct params).

---

### S4-ST-2: SI §2.2 registered actions table missing S4 entries

**Severity:** High
**Slice section:** §12
**Upstream reference:** SI §2.2

SI §2.2 has no rows for `grace_period_expiry` or `checkout_precondition_retry`. Three-part sync (ParamsMap + registered action + handler code) only two-thirds complete.

**Fix — sibling specs:**
- `interfaces/shared-infrastructure.md` §2.2: Add two rows:

| Domain | Action | Trigger | Delay | Retry | On Failure |
|---|---|---|---|---|---|
| Commercial | `grace_period_expiry` | Grace period created (payment failure or voluntary cancellation) | 14 days | `retry_3` | `alert_principal` |
| Operations | `checkout_precondition_retry` | `checkout_completed` webhook for unclaimed listing | 5 minutes (recurring up to 1 hour) | `once` | `log` |

**Fix — slice:** None.

---

### S4-ST-3: `subscription_ended` reason mapping misaligns with actual cancellation types

**Severity:** High
**Slice section:** §2.7
**Upstream reference:** Ops §1.2, CR §2

S4 `finaliseSubscriptionEnd` maps `CancellationReason` to `SubscriptionEndedEvent.reason` with catch-all `"account_closure"` for anything not `"voluntary"` or `"payment_failure"`. This captures `"listing_archived"` and `"paddle_reconciliation"` — both are cancellations, not account closures. Misleading for entity learning (SI §9 decision logs) and any consumer branching on `reason`.

**Fix — slice:**
- §2.7, reason mapping:
```typescript
// Old:
reason: reason === "voluntary" ? "cancellation" : reason === "payment_failure" ? "grace_period_expired" : "account_closure",

// New:
reason: reason === "payment_failure" ? "grace_period_expired"
  : reason === "account_closed" ? "account_closure"
  : "cancellation",  // voluntary, listing_archived, paddle_reconciliation
```

**New acceptance criteria:**
| # | Criterion | Test |
|---|---|---|
| AC-46 | `subscription_ended` for `listing_archived` cancellation has `reason: "cancellation"` and `origin: "archival"` | Integration |
| AC-47 | `subscription_ended` for `paddle_reconciliation` cancellation has `reason: "cancellation"` and `origin: "paddle"` | Integration |

---

### S4-ST-4: `PaymentService` extension undocumented in SI

**Severity:** Medium
**Slice section:** §3.2
**Upstream reference:** SI §10.1

S4 extends `createCheckoutSession` with `billingCadence`, `couponCode`, `paddleCustomerId`, `existingSubscriptionId` params not present in SI §10.1. Future slices referencing SI see stale signature.

**Fix — sibling specs:**
- `interfaces/shared-infrastructure.md` §10.1 `PaymentService.createCheckoutSession`: Add optional params:
```typescript
billingCadence?: "annual" | "monthly"
couponCode?: string
paddleCustomerId?: string
existingSubscriptionId?: string  // for upgrades (S4)
```

**Fix — slice:**
- §3.2: Change "S4 amendment to SI §10.1" to "S4 amendment to SI §10.1 — SI spec updated with optional params. S4 passes all params; prior callers pass none."

---

### S4-ST-5: `processedPaddleEvents` cleanup mechanism incomplete

**Severity:** Medium
**Slice section:** §1.4
**Upstream reference:** SI §2.1, §2.2

Cleanup attributed to `billing_reconciliation` deferred action but no handler implements it. Piggybacking unrelated cleanup onto a billing action conflates concerns.

**Fix — slice:**
- §1.4: Replace "Cleaned up by billing_reconciliation deferred action (daily)" with "Cleaned up by inline check within webhook handler — on each webhook invocation, delete rows where `processedAt < now() - 30 days` (same pattern as pending_cancellation cleanup in §2.3)."

**New acceptance criteria:**
| # | Criterion | Test |
|---|---|---|
| AC-48 | `processedPaddleEvents` records older than 30 days are deleted during webhook processing | Integration |

---

### S4-ST-6: Archival path `subscription_ended` reason hardcoded

**Severity:** Medium
**Slice section:** §7.1
**Upstream reference:** Ops §1.2

§7.1 hardcodes `reason: "cancellation"` without using `finaliseSubscriptionEnd`. Creates parallel emission path with independently maintained reason logic. **Resolves automatically when S4-ST-7 fix is applied** (removes the direct emission entirely).

---

### S4-ST-7: Archival path double-emits `subscription_ended` [CRITICAL — both agents found independently]

**Severity:** High
**Slice section:** §7.1
**Upstream reference:** Ops §5, CR §4.5, D&L §1.10

**Root cause:** §7.1 emits both `pending_cancellation_created` and `subscription_ended` at archive time. The `pending_cancellation_created` event triggers Ops to call `PaymentService.cancelSubscription`. When Paddle confirms via webhook, Ops processes it and emits `subscription_ended` again via `finaliseSubscriptionEnd`. Result: two `subscription_ended` events for one archival — CR double-logs churn, PP displays re-subscribe CTA twice.

D&L interface spec §1.10 documents D&L as emitter of `subscription_ended` for archival path — this pre-dates the pending cancellation registry mechanism. §7.1 conflates *initiation* (emit `pending_cancellation_created`) with *completion* (Paddle confirms → `subscription_ended`). Only initiation should happen at archive time.

**Fix — slice:**
- §7.1: Remove the entire `subscription_ended` emission block. Replace with comment:
```typescript
// subscription_ended will be emitted by Ops when Paddle confirms cancellation.
// Ops uses pending_cancellation registry to attribute origin: "archival".
// D&L does NOT emit subscription_ended directly — avoids double emission [S4-ST-7].
```
- AC-32: Change from "listing.archive for paid listing emits subscription_ended with origin: archival" to "listing.archive for paid listing does NOT emit subscription_ended directly — emitted by Ops after Paddle webhook confirmation, with origin: archival via pending_cancellation attribution"

**Fix — sibling specs:**
- `interfaces/data-and-listings.md` §1.10: Remove D&L as emitter of `subscription_ended` for archival path. D&L emits `pending_cancellation_created` only. Ops emits `subscription_ended` after Paddle confirms, with `origin: "archival"` derived from pending_cancellation registry's `reason: "listing_archived"`.

**New acceptance criteria:**
| # | Criterion | Test |
|---|---|---|
| AC-49 | Paddle webhook for archival-path cancellation uses pending_cancellation `reason: "listing_archived"` and emits `subscription_ended` with `origin: "archival"` | Integration |

---

### S4-ST-8: `applyDowngrade` + `finaliseSubscriptionEnd` produce double notification

**Severity:** Medium
**Slice section:** §5.1, §8.2
**Upstream reference:** Ops §1.1

Grace period expiry calls `finaliseSubscriptionEnd` → `applyDowngrade` (emits `subscription_tier_changed`) → then emits `subscription_ended`. Both events trigger PP notifications — provider gets two. The events themselves are correct and intentional (D&L needs tier change, CR/PP need ended). The notification duplication is the issue.

**Fix — slice:**
- §5.1: Add `suppressNotification?: boolean` param to `applyDowngrade`:
```typescript
async function applyDowngrade(params: {
  listingId: UUID
  previousTier: SubscriptionTier
  newTier: SubscriptionTier
  suppressNotification?: boolean  // true when called from finaliseSubscriptionEnd
}): Promise<void>
```
- In notification section: `if (!params.suppressNotification) { ... }`
- `finaliseSubscriptionEnd` passes `suppressNotification: true` when calling `applyDowngrade`.

**New acceptance criteria:**
| # | Criterion | Test |
|---|---|---|
| AC-50 | Grace period expiry produces both `subscription_tier_changed` and `subscription_ended` but only one provider notification | Integration |

---

### S4-ST-9: `listing_decay_warning` template double-counted [merged with Part B S4-ST-14]

**Severity:** Low
**Slice section:** §11
**Upstream reference:** SI §5.2

SI §5.2 already lists `listing_decay_warning` under Operations Compliance templates. S4 does not add it. The template naturally belongs to S7 (Operations). S4's actual new template contribution is only `subscription_confirmed`.

**Fix — slice:**
- §11: Remove `listing_decay_warning` row. Change "S4 registers 2 email templates" to "S4 registers 1 email template." Update count: "S0 (2) + S2 (7) + S3 (4) + S4 (1) = 14 of 24" (24 because S4-ST-13 adds `subscription_confirmed` to the master inventory).

---

### S4-ST-10: `EVENT_CONSUMER_MATRIX` amendments not documented

**Severity:** Low
**Slice section:** §10
**Upstream reference:** SI §1.5

S4 registers 8 consumers but does not specify the `EVENT_CONSUMER_MATRIX` amendments. Documentation gap.

**Fix — slice:**
- §10, after consumer table, add matrix amendments:
```typescript
// S4 additions to EVENT_CONSUMER_MATRIX:
"subscription_tier_changed": [
  { domain: "data-and-listings", mode: "async" },  // existing (S1)
  { domain: "platform", mode: "async" },            // S4 (featureAccessUpdate, providerNotification)
  { domain: "commercial", mode: "async" },           // S4
],
"subscription_ended": [
  { domain: "platform", mode: "async" },             // S4 (downgradeFeatureAccess, resubscribeCTA)
  { domain: "commercial", mode: "async" },            // S4
],
"pending_cancellation_created": [
  { domain: "operations", mode: "async" },            // S4
],
```

---

### S4-ST-13: `subscription_confirmed` email template missing from upstream specs

**Severity:** Medium
**Slice section:** §11
**Upstream reference:** PP §4, SI §5.2

S4 registers `subscription_confirmed` but it appears in neither PP §4 nor SI §5.2 template inventories. The `NotificationType` union (SI §8.1) includes it, but the email template inventory does not.

**Fix — sibling specs:**
- `interfaces/shared-infrastructure.md` §5.2: Add `subscription_confirmed` row under new "Subscription" section. Total templates 23 → 24.
- `interfaces/platform-and-product.md` §4: Add `subscription_confirmed` row. Total templates 23 → 24.

---

### S4-ST-15: D&L `subscription_tier_changed` consumer extension undocumented

**Severity:** Medium
**Slice section:** §10
**Upstream reference:** D&L §2

S4 extends D&L's `subscription_tier_changed` consumer to call `restoreHiddenItems` on upgrade (writes to `media_items.visibility` and `credits.visibility`). D&L interface spec §2 does not document this extended action.

**Fix — sibling specs:**
- `interfaces/data-and-listings.md` §2, `subscription_tier_changed` consumer action: Expand to include: "If `event.newTier` rank > `event.previousTier` rank: restore hidden media/credit items up to new tier limit (`restoreHiddenItems`). [S4 §5.2]"

---

### S4-ST-16: PP writes directly to Ops-owned `pending_cancellations` for closure

**Severity:** Medium
**Slice section:** §1.3
**Upstream reference:** PP §5 step 2, entity-architecture-frame

Single-ownership violation: Operations owns `pending_cancellations` table, but Platform writes directly during account closure. The orchestrated flow requires the record to exist BEFORE calling `PaymentService.cancelSubscription` (Paddle may webhook immediately). Emitting async event would race.

Pragmatic V1 fix: document as exception to single ownership, scoped to closure path only. All other paths (CR churn, D&L archival) use `pending_cancellation_created` event → Ops consumer.

**Fix — slice:**
- §1.3: Add ownership exception note: "**Ownership exception [S4-ST-16]:** Operations owns `pending_cancellations`. For CR-emitted and D&L-emitted `pending_cancellation_created`, Ops' async consumer writes the record. For the account closure path, PP writes directly because the closure orchestrated flow requires the record to exist before calling `PaymentService.cancelSubscription` (Paddle may webhook immediately). PP's write is scoped to closure only."

**Fix — sibling specs:**
- `interfaces/platform-and-product.md` §5 step 2: Add note: "[S4-ST-16] PP writes directly to Ops-owned `pending_cancellations` table for closure path only. Documented ownership exception — Paddle may webhook immediately after `cancelSubscription`, so the record must exist synchronously."

---

## Summary

4 High, 7 Medium, 2 Low, 4 Pass across 17 scenarios. 16 fixes total.

The most critical finding is the archival-path double-emission of `subscription_ended` (S4-ST-7) — both agents found it independently, confirming it is a structural gap, not an edge case. The fix removes D&L's direct emission and consolidates all Paddle-mediated `subscription_ended` emissions through the Ops webhook handler with pending_cancellation registry attribution.

The `DeferredActionParamsMap` three-part sync gap (S4-ST-1/2) repeats the S0–S3 pattern. The reason mapping catch-all (S4-ST-3) produces misleading churn data for archival and reconciliation cancellations.

### Sibling Spec Changes Required (consolidated)

| Document | Section | Change | Source |
|----------|---------|--------|--------|
| `shared-infrastructure.md` | §2.1 | Add `grace_period_expiry` + `checkout_precondition_retry` to `DeferredActionParamsMap` | S4-ST-1 |
| `shared-infrastructure.md` | §2.2 | Add 2 rows to registered actions table | S4-ST-2 |
| `shared-infrastructure.md` | §5.2 | Add `subscription_confirmed` template (total 23→24) | S4-ST-13 |
| `shared-infrastructure.md` | §10.1 | Add 4 optional params to `PaymentService.createCheckoutSession` | S4-ST-4 |
| `data-and-listings.md` | §1.10 | Remove direct `subscription_ended` emission for archival; D&L emits `pending_cancellation_created` only | S4-ST-7 |
| `data-and-listings.md` | §2 | Add `restoreHiddenItems` to `subscription_tier_changed` consumer action | S4-ST-15 |
| `platform-and-product.md` | §4 | Add `subscription_confirmed` template (total 23→24) | S4-ST-13 |
| `platform-and-product.md` | §5 | Add ownership exception note for closure-path `pending_cancellations` write | S4-ST-16 |

### New Acceptance Criteria (5 additions)

| # | Criterion | Test | Source |
|---|---|---|---|
| AC-46 | `subscription_ended` for `listing_archived` cancellation has `reason: "cancellation"`, `origin: "archival"` | Integration | S4-ST-3 |
| AC-47 | `subscription_ended` for `paddle_reconciliation` cancellation has `reason: "cancellation"`, `origin: "paddle"` | Integration | S4-ST-3 |
| AC-48 | `processedPaddleEvents` >30 days deleted during webhook processing | Integration | S4-ST-5 |
| AC-49 | Paddle webhook for archival cancellation uses pending_cancellation `reason: "listing_archived"`, emits `subscription_ended` with `origin: "archival"` | Integration | S4-ST-7 |
| AC-50 | Grace period expiry produces both `subscription_tier_changed` and `subscription_ended` but only one notification | Integration | S4-ST-8 |

### Downstream Flag Audit

All 9 S4 downstream flags (S4-1 through S4-9) verified correct. S1-9 resolution amended per S4-ST-7 (D&L emits `pending_cancellation_created` only, not `subscription_ended` directly). S3-1 resolution confirmed (S4 §9 provides `isPremiumVerificationEligible`).
