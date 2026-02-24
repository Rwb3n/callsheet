Now I have enough data to write the stress test scenarios. Let me synthesize all findings.

---

## S4 Stress Test — Subscriptions (Scenarios S4-ST-13 through S4-ST-20: D&L + PP Boundaries)

**Slice:** `slices/slice-04-subscriptions.md` (v1)
**Tested against:** `data-and-listings.md` (v3), `platform-and-product.md` (v3), `shared-infrastructure.md` (v3), `operations.md` (v3), `commercial-and-revenue.md` (v2)
**Date:** 2026-02-13
**Scenarios:** 8 (S4-ST-13 through S4-ST-20)
**Severity distribution:** 1 High, 4 Medium, 1 Low, 2 Pass
**Total fixes:** 6

---

### Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S4-ST-13 | `subscription_confirmed` email template missing from PP §4 and SI §5.2 | Medium | §11 | PP §4, SI §5.2 | S4 registers `subscription_confirmed` as an email template but it appears in neither PP §4 nor SI §5.2 template inventories |
| S4-ST-14 | `listing_decay_warning` wrongly claimed as S4-registered | Low | §11 | SI §5.2, PP §4.2 | Already registered in SI §5.2 and PP §4.2. S4 claims "adds it to template registry" but the template already exists — S4 adds no new registration |
| S4-ST-15 | D&L `subscription_tier_changed` consumer extended for `restoreHiddenItems` — no spec-level documentation | Medium | §10 | D&L §2 | S4 extends the D&L consumer registered in S1 to call `restoreHiddenItems` on upgrade. D&L interface spec §2 does not document this data modification (media/credit visibility writes). D&L owns media_items and credits tables — the consumer change is within D&L's domain, but the spec should document the extended action. |
| S4-ST-16 | `pending_cancellations` schema in Ops namespace but PP writes directly for closure path | **High** | §1.3 | PP §5 step 2 | S4 §1.3 places `pending_cancellations` in `src/db/schema/operations.ts`. PP §5 step 2 creates records directly (not via event). This violates single-ownership — Operations owns the table, but Platform writes to it without going through Ops' interface. No query or write interface is exposed by Ops for this. |
| S4-ST-17 | Feature gating middleware location ambiguity — S4 defines it but PP owns enforcement | Pass | §4.2 | PP §2 | S4 §4.2 defines `enforceFeatureGate` and `checkFeatureAccess` in `src/lib/feature-gate.ts`. This is a shared utility that imports CR's `computeFeatureAccess` (P4) and is consumed by PP routes. The file location in `src/lib/` is domain-neutral. Correct. |
| S4-ST-18 | Pricing page SSG + checkout CTA branching touches PP onboarding flow but redirect targets unverified | Pass | §6.2 | SI §7.1, PP §5 | S4 §6.2 redirects unauthenticated to `/signup?redirect=/pricing&tier={tier}` and no-listing users to `/create-listing/type`. Both targets are S2 routes. SSG classification matches SI §7.1. Correct. |
| S4-ST-19 | S4 §7 archival path emits `subscription_ended` immediately — races with Ops' Paddle webhook emission | Medium | §7.1 | Ops §1.2, D&L §1.10 | S4 §7 emits both `pending_cancellation_created` and `subscription_ended` synchronously during archive. Ops' `pending_cancellation_created` consumer then calls `PaymentService.cancelSubscription`, Paddle eventually sends a webhook, and Ops would emit `subscription_ended` again. Double emission of `subscription_ended` for the same listing. |
| S4-ST-20 | `DeferredActionParamsMap` missing S4's two new actions (`grace_period_expiry`, `checkout_precondition_retry`) | Medium | §8.1 | SI §2.1 | S4 §8.1 defines two new entries for `DeferredActionParamsMap` but SI §2.1 does not include them. SI §2.2 registered actions table also lacks entries for both. |

---

### Detailed Findings

### S4-ST-13: `subscription_confirmed` email template missing from PP §4 and SI §5.2

**Severity:** Medium
**Slice section:** §11
**Upstream reference:** PP §4, SI §5.2

**Problem:** S4 §11 registers `subscription_confirmed` as a new email template with category "Subscription", unsubscribable "No", owned by PP. S4 §13 says "`subscription_confirmed` is already in SI §8.1" — but that is the *notification type* union (`NotificationType`), not the email template inventory. SI §5.2 lists 23 email templates; `subscription_confirmed` is not among them. PP §4 lists 23 templates across three sections; `subscription_confirmed` is not among them. The email template does not exist in any spec. S4 must add it to both SI §5.2 and PP §4.

**Fix — slice:**
- Section: §11
- Old: `**Template count after S4:** S0 (2) + S2 (7) + S3 (4) + S4 (2) = 15 of 23.`
- New: `**Template count after S4:** S0 (2) + S2 (7) + S3 (4) + S4 (1) = 14 of 23. Note: S4 also requires `subscription_confirmed` to be added to SI §5.2 and PP §4 as a new template (total becomes 24 after S4).` — see sibling spec changes.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2, Operations Compliance section (add new "Subscription" section)
- Change: Add `subscription_confirmed` row: `| subscription_confirmed | Checkout completed (new subscription) | No |`. Category: Subscription. Update total template count from 23 to 24.
- Document: `interfaces/platform-and-product.md`
- Section: §4 (add new §4.4 "Subscription" section or append to §4.1)
- Change: Add `subscription_confirmed` row: `| subscription_confirmed | Checkout completed (new subscription) | Subscription | No |`. Update summary from 23 to 24 email templates.

**Acceptance criteria impact:** None — existing AC-41 tests the consumer behaviour, not the template registration.

---

### S4-ST-14: `listing_decay_warning` wrongly claimed as S4-registered

**Severity:** Low
**Slice section:** §11
**Upstream reference:** SI §5.2, PP §4.2

**Problem:** S4 §11 says `listing_decay_warning` is "already registered in SI §5.2 — S4 adds it to template registry." This is contradictory — if it is already registered in SI §5.2 (it is: line 491) and PP §4.2 (it is: line 309), then S4 does not "add" it. S4 should not count it as an S4-registered template. The template was part of the base 23 inventory defined before any slice. S4's actual new template contribution is only `subscription_confirmed` (per S4-ST-13 fix).

**Fix — slice:**
- Section: §11
- Old: The entire `listing_decay_warning` row in the §11 table and the explanatory text.
- New: Remove the `listing_decay_warning` row from §11. Update table header to "S4 registers 1 email template." Add note: "`listing_decay_warning` is already registered in SI §5.2 and PP §4.2 — no S4 action required."

**Acceptance criteria impact:** None.

---

### S4-ST-15: D&L consumer extension for `restoreHiddenItems` undocumented in D&L spec

**Severity:** Medium
**Slice section:** §10
**Upstream reference:** D&L §2 (consumed events, `subscription_tier_changed`)

**Problem:** S4 §10 extends the D&L `subscription_tier_changed` consumer (first registered in S1 §10) to call `restoreHiddenItems` on upgrade. This function writes to `media_items.visibility` and `credits.visibility` — columns that D&L owns. D&L interface spec §2 documents the consumer action as: "Update `listing.commercial.subscriptionTier` to `event.newTier`, then recalculate enrichment cadence via `scheduleEnrichment()`" [Source: D&L §2, DL-ST-9]. There is no mention of visibility restoration. The consumer's action in the interface spec must be updated to reflect the extended behaviour, because sibling consumers or future agents reading D&L §2 will have an incomplete picture of what this consumer does.

**Fix — slice:**
- No slice change needed. The slice correctly documents the extension in §10.

**Fix — sibling specs:**
- Document: `interfaces/data-and-listings.md`
- Section: §2, "From Operations (1 event)" table, `subscription_tier_changed` row
- Change: Expand the D&L Action from: "Update `listing.commercial.subscriptionTier` to `event.newTier`, then recalculate enrichment cadence via `scheduleEnrichment()` [X-18, DL-ST-9]" to: "Update `listing.commercial.subscriptionTier` to `event.newTier`, then recalculate enrichment cadence via `scheduleEnrichment()`. If `event.newTier` rank > `event.previousTier` rank: restore hidden media/credit items up to new tier limit (`restoreHiddenItems`). [X-18, DL-ST-9, S4 §5.2]"

**Acceptance criteria impact:** AC-41 already covers this. No change.

---

### S4-ST-16: `pending_cancellations` table ownership violated by PP direct writes

**Severity:** High
**Slice section:** §1.3
**Upstream reference:** PP §5 step 2, entity-architecture-frame §Sub-Entity Contract Specification

**Problem:** S4 §1.3 places the `pending_cancellations` table in `src/db/schema/operations.ts` — Operations owns it. S4's summary (line 18) and PP §5 step 2 both state that PP writes `pending_cancellation` records directly for the account closure path. This is a single-ownership violation: Operations owns the table, yet Platform performs direct INSERT operations against it. The entity-architecture-frame's design rule is explicit: "Every data entity, process, and event type has exactly one owner. No shared mutable state across sub-entity boundaries." The fix is to make PP's closure path emit `pending_cancellation_created` (PP is already documented as a third emitter for this event in D&L §1.10 note) and let Ops' existing consumer (`operations:pending_cancellation_created:storeAndCancel`) handle the write. PP still calls `PaymentService.cancelSubscription` directly (it owns the closure orchestration), but the pending_cancellation record creation must go through Ops.

However, this introduces a sequencing problem: PP needs the pending_cancellation record to exist BEFORE calling `PaymentService.cancelSubscription`, because Paddle may send the cancellation webhook almost immediately. If PP emits the event async, the record might not exist when the webhook arrives.

Resolution: PP emits `pending_cancellation_created` **synchronously** for the closure path. Ops' consumer stores the record. Then PP calls `PaymentService.cancelSubscription`. This preserves single-ownership while maintaining the sequencing guarantee. Alternatively, the Ops consumer for `pending_cancellation_created` is already registered as async (S4 §10). The pragmatic V1 fix: document PP's closure-path write as an **exception** to single ownership, justified by the synchronous sequencing requirement of the closure orchestrated flow. Add an explicit note in both S4 §1.3 and PP §5 step 2 that this is a deliberate exception, not a pattern to follow.

**Fix — slice:**
- Section: §1.3
- Old: (no ownership exception note)
- New: Add after the table definition: "**Ownership exception [S4-ST-16]:** Operations owns `pending_cancellations`. For CR-emitted and D&L-emitted `pending_cancellation_created`, Ops' async consumer writes the record. For the account closure path, PP writes directly because the closure orchestrated flow requires the record to exist before calling `PaymentService.cancelSubscription` (Paddle may webhook immediately). This is a documented exception to single-ownership, justified by the orchestrated flow's synchronous sequencing requirement. PP's write is scoped to closure only — all other paths go through the event/consumer pattern."
- Section: Summary (line 18)
- Old: `PP writes pending_cancellation records directly for the closure path (PP interface spec §5 step 2).`
- New: `PP writes pending_cancellation records directly for the closure path only (PP §5 step 2) — documented ownership exception [S4-ST-16] due to orchestrated flow sequencing.`

**Fix — sibling specs:**
- Document: `interfaces/platform-and-product.md`
- Section: §5 step 2
- Change: Add note: "[S4-ST-16] PP writes directly to Ops-owned `pending_cancellations` table for closure path only. Documented ownership exception — Paddle may webhook immediately after `cancelSubscription`, so the record must exist synchronously before the API call. All non-closure paths use `pending_cancellation_created` event → Ops consumer."

**Acceptance criteria impact:** Add AC-46: "Account closure step 2 creates `pending_cancellation` record with `reason: 'account_closed'` before calling `PaymentService.cancelSubscription`" (Integration).

---

### S4-ST-19: Archival path double-emits `subscription_ended`

**Severity:** Medium
**Slice section:** §7.1
**Upstream reference:** Ops §1.2, D&L §1.10

**Problem:** S4 §7.1 emits both `pending_cancellation_created` and `subscription_ended` during archive. The `pending_cancellation_created` consumer (Ops, S4 §10) stores the record then calls `PaymentService.cancelSubscription`. When Paddle confirms the cancellation via webhook, Ops processes it through the standard webhook flow (`handleSubscriptionCancelled` in §2.7), which calls `finaliseSubscriptionEnd`, which emits `subscription_ended` again. The same listing gets two `subscription_ended` emissions: one from D&L (§7.1, origin "archival") and one from Ops (webhook handler, origin "paddle" with pending_cancellation attribution "listing_archived"). Downstream consumers (PP feature downgrade, CR churn log, CR win-back scheduling) execute twice for the same cancellation.

D&L §1.10 documents that D&L emits `subscription_ended` for the archival path. But it also documents that D&L emits `pending_cancellation_created` which triggers Ops to call Paddle, which triggers Ops to emit `subscription_ended`. The two emissions are architecturally redundant.

The fix: D&L should NOT emit `subscription_ended` directly in §7.1. D&L emits only `pending_cancellation_created`. Ops' consumer stores the record, calls Paddle, and when Paddle confirms, Ops emits `subscription_ended` with the correct attribution from the pending_cancellation registry (reason: "listing_archived", origin should be "archival" not "paddle"). This consolidates emission to a single path and keeps Ops as the sole primary emitter of `subscription_ended` for all Paddle-mediated cancellations.

This requires updating the `origin` mapping: when `inferCancellationReason` finds reason "listing_archived" in the pending_cancellation registry, Ops should set origin to "archival" (not "paddle"), and when reason is "account_closed", origin should be "closure".

**Fix — slice:**
- Section: §7.1
- Old: The entire `subscription_ended` emission block (lines 931-944).
- New: Remove the `subscription_ended` emission. Add comment: `// subscription_ended will be emitted by Ops when Paddle confirms cancellation via webhook. // Ops uses pending_cancellation registry to attribute origin: "archival". // D&L does NOT emit subscription_ended directly — avoids double emission [S4-ST-19].`
- Section: §2.7, `handleSubscriptionCancelled`, the `origin` mapping block (lines 349-352)
- Old:
  ```
  const origin: "paddle" | "archival" | "closure" =
    reason === "listing_archived" ? "archival"
    : reason === "account_closed" ? "closure"
    : "paddle"
  ```
- New: No change needed — this mapping is already correct. The origin is derived from the pending_cancellation reason, which correctly maps "listing_archived" to "archival" and "account_closed" to "closure".
- Section: AC-32
- Old: `listing.archive for paid listing emits subscription_ended with origin: "archival"`
- New: `listing.archive for paid listing results in subscription_ended with origin: "archival" (emitted by Ops after Paddle webhook confirmation, not by D&L directly)`

**Fix — sibling specs:**
- Document: `interfaces/data-and-listings.md`
- Section: §1.10
- Old: "D&L performs two emissions in sequence: 1. Emit `pending_cancellation_created` ... 2. Emit `subscription_ended` ..."
- New: "D&L emits `pending_cancellation_created` only. Ops' consumer stores the record and calls `PaymentService.cancelSubscription`. When Paddle confirms, Ops emits `subscription_ended` via the standard webhook path, with `origin: 'archival'` derived from the pending_cancellation registry's `reason: 'listing_archived'` [S4-ST-19]. D&L does not emit `subscription_ended` directly — this avoids double emission."

**Acceptance criteria impact:** AC-32 reworded (see above). No new AC.

---

### S4-ST-20: `DeferredActionParamsMap` missing S4 entries

**Severity:** Medium
**Slice section:** §8.1
**Upstream reference:** SI §2.1

**Problem:** S4 §8.1 defines two new `DeferredActionParamsMap` entries: `grace_period_expiry` and `checkout_precondition_retry`. SI §2.1 `DeferredActionParamsMap` does not include either. SI §2.2 registered actions table does not include either. Per the prior-findings pattern (S0, S2, S3): every deferred action needs three things in sync — a `DeferredActionParamsMap` entry, a handler registration in §2.2, and a scheduling call. The scheduling calls exist in S4 §8.2 and §2.4. The `DeferredActionParamsMap` entries and §2.2 rows are missing from SI.

**Fix — slice:**
- No slice change needed. S4 §8.1 correctly defines the param types. S4 §12 correctly lists both actions.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1, `DeferredActionParamsMap` type
- Change: Add two entries:
  ```typescript
  grace_period_expiry: { listingId: UUID; gracePeriodId: UUID }
  checkout_precondition_retry: { paddleEvent: CheckoutCompletedEvent; attemptCount: number; maxAttempts: number }
  ```
- Section: §2.2, registered actions table
- Change: Add two rows:
  | Commercial | `grace_period_expiry` | Subscription cancelled or payment failure | 14 days after grace period start | `retry_3` | `alert_principal` |
  | Operations | `checkout_precondition_retry` | `checkout_completed` webhook for unclaimed listing | 5 minutes | `once` | `log` |

**Acceptance criteria impact:** None — existing AC-26, AC-28, AC-5, AC-6 cover the functional behaviour.

---

## Summary

S4's D&L and PP boundary surface is largely sound but has one structural issue and several documentation gaps. The highest-severity finding (S4-ST-16) is a single-ownership violation where Platform writes directly to an Operations-owned table during account closure — pragmatically resolved by documenting the exception rather than re-architecturing the flow. The double-emission of `subscription_ended` in the archival path (S4-ST-19) is an implementable bug that would cause duplicate downstream side-effects in production. The `subscription_confirmed` email template (S4-ST-13) exists in the slice but was never added to upstream specs. The recurring `DeferredActionParamsMap` sync pattern (S4-ST-20) continues from S0-S3.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S1-9 (archival-path cancellation) | Needs amendment | Resolution is structurally correct but S4-ST-19 changes the emission pattern: D&L emits only `pending_cancellation_created`, not `subscription_ended` directly |
| S3-1 (Premium Verified gate) | Correct | S4 §9 provides `isPremiumVerificationEligible`. S3 §8 consumes it. |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `interfaces/shared-infrastructure.md` | §5.2 | Add `subscription_confirmed` email template (total 23 becomes 24) | S4-ST-13 |
| `interfaces/platform-and-product.md` | §4 | Add `subscription_confirmed` email template (total 23 becomes 24) | S4-ST-13 |
| `interfaces/data-and-listings.md` | §2, `subscription_tier_changed` consumer action | Add `restoreHiddenItems` on upgrade to consumer description | S4-ST-15 |
| `interfaces/platform-and-product.md` | §5 step 2 | Add ownership exception note for direct `pending_cancellations` write | S4-ST-16 |
| `interfaces/data-and-listings.md` | §1.10 | Remove direct `subscription_ended` emission; document single-path via Ops webhook | S4-ST-19 |
| `interfaces/shared-infrastructure.md` | §2.1, §2.2 | Add `grace_period_expiry` and `checkout_precondition_retry` to `DeferredActionParamsMap` and registered actions table | S4-ST-20 |