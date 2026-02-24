# S7 Stress Test — Part B (D&L + PP Boundaries)

**Agent:** B
**Boundaries:** Data & Listings, Platform & Product
**Scenarios:** 8
**Date:** 2026-02-14

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S7-ST-B1 | Decay warning email uses non-existent `EmailCategory` value `"operations_compliance"` | **High** | `11-email-delivery.md` §11.2 | SI §5.1 | `EmailCategory` type has no `"operations_compliance"` value — only 6 values exist. PP §4.2 assigns `listing_decay_warning` to `"listing_status"`. |
| S7-ST-B2 | S7 registers 4 new deferred actions not added to `DeferredActionParamsMap` | **High** | `index.md` §15 | SI §2.1 | `sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit` are used throughout S7 but absent from SI §2.1 `DeferredActionParamsMap`. Compile-time type safety broken. |
| S7-ST-B3 | `support_acknowledgment` email template not registered in SI §5.2 | Medium | `02-support-triage.md` §2.8 | SI §5.2 | Template used in ticket creation but not in the 25-template inventory. Pre-draft checklist §2.1 identified this as a required addition — not yet applied. |
| S7-ST-B4 | `SubscriptionEndedEvent.reason` union in Ops §1.2 missing `"paddle_reconciliation"` | Medium | `04-billing-reconciliation.md` §4.1 | Ops §1.2 | S7 `00-schema.md` §4 documents this as a sibling spec change, but Ops §1.2 still shows 3-value union: `"cancellation" | "grace_period_expired" | "account_closure"`. The 4th value `"paddle_reconciliation"` is emitted in billing reconciliation but the spec is not yet updated. |
| S7-ST-B5 | `refund_request` category not in `TicketCategory` union | Medium | `13-refund-processing.md` §13.1 | `02-support-triage.md` §2.2 | `admin.refunds.list` filters by `category = "refund_request"` but `classifyTicket` defines only 7 categories, none of which is `"refund_request"`. Query will always return zero results. |
| S7-ST-B6 | D&L event P1 payload field compliance — all 6 consumers verified | Pass | `09-event-consumers.md` §9.2–§9.7 | D&L §1.1–§1.7, Ops §2 | All fields used by handlers are present in declared payload types and match Ops §2 P1 table. |
| S7-ST-B7 | PP event P1 payload field compliance — all 3 consumers verified | Pass | `09-event-consumers.md` §9.9–§9.11 | PP §1.6, §1.8, §1.9, Ops §2 | All fields used by `account_closed`, `listing_created`, `contact_attempt` handlers match payload types and Ops §2 P1 table. |
| S7-ST-B8 | `applyVerificationUpgrade` callback signature mismatch between S3 and S7 | Low | `03-taskspec-queue.md` §3.5 | S3 §7.2 | S3 defines `applyVerificationUpgrade(listingId, newTier, score)`. S7 calls `applyVerificationUpgrade(task.context.listingId, "verified", task.context.score + 1)`. Signature matches. However, S7 hardcodes `"verified"` as `newTier` — S3 §7.1's evaluation may produce a different tier if the upgrade criteria change in S9. |

## Detailed Findings

### S7-ST-B1: Decay warning email uses non-existent `EmailCategory` value

**Severity:** High
**Slice section:** `11-email-delivery.md` §11.2
**Upstream reference:** SI §5.1, PP §4.2

**Problem:** The decay warning email handler calls `EmailService.send()` with `category: "operations_compliance"`. The `EmailCategory` type in SI §5.1 defines exactly 6 values: `"transactional"`, `"enquiry_notification"`, `"listing_status"`, `"profile_nudge"`, `"subscription"`, `"conversion_marketing"`. The value `"operations_compliance"` does not exist in this union and will fail at compile time.

PP §4.2 (Operations Compliance templates) assigns `listing_decay_warning` to `"listing_status"` category with `Unsubscribable: Yes`. The correct category is `"listing_status"`.

The same error appears in `09-event-consumers.md` §9.7 where the identical handler pseudocode uses `category: "operations_compliance"`.

**Fix — slice:**
- Section: `11-email-delivery.md` §11.2 handler pseudocode
- Old: `category: "operations_compliance",`
- New: `category: "listing_status",`

- Section: `09-event-consumers.md` §9.7 handler pseudocode
- Old: `category: "listing_status",` (verify — the §9.7 version already uses `"listing_status"`, so only §11.2 needs fixing)

**Correction:** Checking §9.7 — the handler in `09-event-consumers.md` §9.7 at line 238 uses `category: "listing_status"`, which is correct. Only `11-email-delivery.md` §11.2 at line 131 uses `category: "operations_compliance"`. The two descriptions of the same handler contradict each other.

**Fix — slice (revised):**
- Section: `11-email-delivery.md` §11.2 handler pseudocode
- Old: `category: "operations_compliance",`
- New: `category: "listing_status",`

**Fix — sibling specs:** None required. SI §5.1 and PP §4.2 are correct.

**Acceptance criteria impact:** AC-11.7 is unaffected (merge fields). No AC currently specifies the email category. Add: "AC-11.7a: Decay warning email uses `category: "listing_status"` — `EmailService` suppresses send if account has unsubscribed from this category."

---

### S7-ST-B2: 4 new deferred actions not registered in `DeferredActionParamsMap`

**Severity:** High
**Slice section:** `index.md` §15
**Upstream reference:** SI §2.1

**Problem:** S7 registers 4 new deferred actions (`sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit`) and implements handlers for 2 existing ones (`billing_reconciliation`, `compliance_schedule_check`). The 4 new actions are used extensively throughout S7 (scheduling, cancelling, handling), but none appear in the `DeferredActionParamsMap` type in SI §2.1.

The `DeferredActionParamsMap` is the compile-time safety boundary for deferred actions — `scheduleAction()` and handler dispatch are typed against this map. Without entries for the 4 new actions, TypeScript will reject calls to `scheduleAction("sla_breach_warning", ...)` because `"sla_breach_warning"` is not a key of `DeferredActionParamsMap`.

This is the three-part sync gap pattern (DeferredActionParamsMap + registered actions table + handler). The pre-draft checklist §1.1 flagged all 4 actions, but the SI amendments were not applied during drafting.

**Fix — sibling specs:**
- Document: `shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add 4 entries:
```typescript
sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }
task_timeout_check: { taskId: UUID }
billing_hold_expiry: { listingId: UUID; holdId: UUID }
compliance_self_audit: Record<string, never>
```

- Section: §2.2 Registered Actions table
- Change: Add 4 rows:
  - `Operations | sla_breach_warning | Ticket creation with SLA deadline | 80% of SLA duration | once | log`
  - `Operations | task_timeout_check | TaskSpec creation | timeout hours from creation | once | log`
  - `Operations | billing_hold_expiry | Billing hold created | 48 hours | once | log`
  - `Operations | compliance_self_audit | Self-perpetuating, seeded on startup | 24h recurring | once | log`

**Fix — slice:** None. S7 defines the params correctly in §15 and content sections. The gap is in the sibling spec.

**Acceptance criteria impact:** None directly. But without the SI fix, no S7 handler can compile.

---

### S7-ST-B3: `support_acknowledgment` email template missing from SI §5.2

**Severity:** Medium
**Slice section:** `02-support-triage.md` §2.8 (AC-2.7)
**Upstream reference:** SI §5.2

**Problem:** S7 sends a `support_acknowledgment` email on ticket creation when `accountId` is present (AC-2.7). The pre-draft checklist §2.1 identified this as a new template requiring addition to SI §5.2 (raising the count from 25 to 26). However, the template was not added to the SI template inventory during drafting.

The `index.md` §16 lists `support_acknowledgment` as an "existing template from SI §5.2" — this is incorrect. The template does not exist in SI §5.2. It is a new template introduced by S7.

**Fix — sibling specs:**
- Document: `shared-infrastructure.md`
- Section: §5.2 Template Inventory, under "Operations Compliance" subsection
- Change: Add row:
  `| support_acknowledgment | Inbound support request classified | No |`

- Section: §5.2 Template count
- Change: `25 templates` → `26 templates`

- Document: `platform-and-product.md`
- Section: §4.2 Operations Compliance templates
- Change: Add row:
  `| support_acknowledgment | Inbound support request classified | Transactional | No |`

**Fix — slice:**
- Section: `index.md` §16 header text
- Old: `S7 registers no new email templates. It uses 5 existing templates from SI §5.2.`
- New: `S7 registers 1 new email template and uses 4 existing templates from SI §5.2.`

**Acceptance criteria impact:** AC-2.7 is correct in intent but references a non-existent template. No AC change needed — the fix is in the sibling spec registration.

---

### S7-ST-B4: `SubscriptionEndedEvent.reason` union not updated in Ops interface spec

**Severity:** Medium
**Slice section:** `00-schema.md` §4, `04-billing-reconciliation.md` §4.1
**Upstream reference:** Ops §1.2

**Problem:** S7's billing reconciliation emits `subscription_ended` with `reason: "paddle_reconciliation"` (D3 decision). `00-schema.md` §4 correctly documents this as a sibling spec change and states the union becomes `"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`. However, Ops §1.2 still shows the 3-value union without `"paddle_reconciliation"`.

This is a documentation gap, not a logic error — S7 correctly identifies the change is needed but the fix was not applied to the sibling spec. The 4 consumers of `subscription_ended` (PP x2, CR x2) must be aware of the new value. S7 §4 asserts "All 4 consumers handle the new value without code changes" — this is plausible (no consumer branches on `reason` specifically) but should be verified during fix application.

**Fix — sibling specs:**
- Document: `operations.md` (interface spec)
- Section: §1.2 `SubscriptionEndedEvent` type definition
- Old: `reason: "cancellation" | "grace_period_expired" | "account_closure"`
- New: `reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`

**Fix — slice:** None. S7 already documents the change correctly.

**Acceptance criteria impact:** AC-4.4 references "all Ops §1.2 fields" — correct once the spec is updated.

---

### S7-ST-B5: `refund_request` category not in `TicketCategory` union

**Severity:** Medium
**Slice section:** `13-refund-processing.md` §13.1–§13.2
**Upstream reference:** `02-support-triage.md` §2.2

**Problem:** Refund processing filters tickets by `category = "refund_request"` (`admin.refunds.list` at §13.2). The `classifyTicket` function in §2.2 defines 7 categories: `billing_support`, `profile_support`, `claim_dispute`, `feature_gating_confusion`, `account_access`, `data_request`, `other`. The value `"refund_request"` is not among them.

Two consequences:
1. The `classifyTicket` keyword matcher will never assign `"refund_request"` — a refund-related ticket would be classified as `"billing_support"` (matching keywords "refund", "billing", "payment").
2. `admin.refunds.list` queries `WHERE category = "refund_request"` — this will always return zero results because no ticket can have that category.

The `support_tickets.category` column is `text` (not enum), so `"refund_request"` is syntactically valid. But no code path creates tickets with this category.

**Resolution options:**
- **Option A (recommended):** Add `"refund_request"` to the `TicketCategory` union and add a keyword pattern for it in `classifyTicket`. Refund requests are semantically distinct from general billing support — they trigger a different admin workflow (refund evaluation queue vs standard ticket resolution).
- **Option B:** Change `admin.refunds.list` to filter by `category = "billing_support"` and add a `details->>'subtype'` check. This overloads billing_support with two workflows and complicates both the triage and refund paths.

**Fix — slice (Option A):**
- Section: `02-support-triage.md` §2.2 `TicketCategory` type
- Old:
```typescript
type TicketCategory =
  | "billing_support"
  | "profile_support"
  | "claim_dispute"
  | "feature_gating_confusion"
  | "account_access"
  | "data_request"
  | "other"
```
- New:
```typescript
type TicketCategory =
  | "billing_support"
  | "profile_support"
  | "claim_dispute"
  | "feature_gating_confusion"
  | "account_access"
  | "data_request"
  | "refund_request"
  | "other"
```

- Section: `02-support-triage.md` §2.2 `classifyTicket` pseudocode, add before the `billing_support` pattern:
```
  if matches(subjectAndBody, ["refund", "money back", "cancel and refund"]):
    return "refund_request"
```

- Section: `02-support-triage.md` §2.3 base priority table, add:
  `"refund_request" -> "high"` (30-day policy window creates urgency)

- Section: `02-support-triage.md` §2.5 KB deflection patterns, add:
  `"refund_request": "/help/refund-policy"`

**Acceptance criteria impact:**
- AC-2.1: "one of 7 categories" → "one of 8 categories"
- AC-2.2: Add `refund_request = high` to the deterministic priority list
- AC-13.1: Currently correct in intent, but depends on the category fix to return results

---

### S7-ST-B6: D&L event P1 payload field compliance — all 6 consumers verified

**Severity:** Pass
**Slice section:** `09-event-consumers.md` §9.2–§9.7
**Upstream reference:** D&L §1.1–§1.7, Ops §2 P1 table

S7 consumes 6 D&L events (`claim_approved`, `claim_rejected`, `listing_archived`, `listing_suspended`, `listing_reactivated`, `decay_signal_detected`). Each consumer handler uses only fields declared in the D&L event payload types and listed in the Ops §2 P1 table.

Verified field-by-field:
- `claim_approved`: uses `listingId`, `method`, `timestamp` — all in `ClaimApprovedEvent` (D&L §1.1)
- `claim_rejected`: uses `listingId`, `timestamp` — all in `ClaimRejectedEvent` (D&L §1.2)
- `listing_archived`: uses `listingId` — present in `ListingArchivedEvent` (D&L §1.3)
- `listing_suspended`: uses `listingId` — present in `ListingSuspendedEvent` (D&L §1.4)
- `listing_reactivated`: uses `listingId` — present in `ListingReactivatedEvent` (D&L §1.5)
- `decay_signal_detected`: uses `listingId`, `signal.severity`, `activeSupportTicket` — all in `DecaySignalDetectedEvent` (D&L §1.7)

The `erasure_completed` handler (§9.8) is orchestrated (not bus-dispatched) and uses `accountHash`, `listingIdsAnonymised`, `listingIdsDeleted`, `freelancerListingsDeleted`, `timestamp` — all present in `ErasureCompletedEvent` (D&L §1.9).

No P1 violations. No undeclared field access.

---

### S7-ST-B7: PP event P1 payload field compliance — all 3 consumers verified

**Severity:** Pass
**Slice section:** `09-event-consumers.md` §9.9–§9.11
**Upstream reference:** PP §1.6, §1.8, §1.9, Ops §2 P1 table

S7 consumes 3 PP events (`account_closed`, `listing_created`, `contact_attempt`). Each handler uses only P1-declared payload fields.

Verified field-by-field:
- `account_closed`: uses `accountId`, `listingsArchived`, `complianceHoldActive` — all in `AccountClosedEvent` (PP §1.9). `listingsArchived` is `UUID[]` in the payload, and the handler does not iterate it (only closes tickets by `accountId`).
- `listing_created`: uses `listingId`, `entityType`, `timestamp` — all in `ListingCreatedEvent` (PP §1.6)
- `contact_attempt`: uses `listingId`, `result` — all in `ContactAttemptEvent` (PP §1.8)

No P1 violations. The `account_closed` handler's compliance register update uses `event.accountId` and `event.complianceHoldActive` — both declared in the payload. The handler does not access `buyerDataDeleted` or `paddleCancellationsPending` (not needed for its actions).

---

### S7-ST-B8: `applyVerificationUpgrade` callback — hardcoded tier value

**Severity:** Low
**Slice section:** `03-taskspec-queue.md` §3.5
**Upstream reference:** S3 §7.2

**Problem:** S7's completion callback calls `applyVerificationUpgrade(task.context.listingId, "verified", task.context.score + 1)`. S3 §7.2 defines the function signature as `applyVerificationUpgrade(listingId: UUID, newTier: VerificationTier, score: number)`.

The signature matches. However, S7 hardcodes `"verified"` as the `newTier` argument. S3's `evaluateVerificationUpgrade` (§7.1) currently always recommends `"verified"` for portfolio review tasks. But if S9 introduces additional upgrade paths (e.g., `"premium_verified"` via insurance or award verification), the hardcoded value would be incorrect.

The safer pattern is to store the intended `newTier` in the TaskSpec context at creation time (S3 already stores `score` in context). S3 §7.1's `buildPortfolioReviewTaskSpec` should include `newTier: "verified"` in the context. S7's callback should read `task.context.newTier` instead of hardcoding.

**Fix — slice:**
- Section: `03-taskspec-queue.md` §3.5 completion callback
- Old: `await applyVerificationUpgrade(task.context.listingId, "verified", task.context.score + 1)`
- New: `await applyVerificationUpgrade(task.context.listingId, task.context.newTier ?? "verified", task.context.score + 1)`

**Fix — sibling specs:**
- Document: `slice-03-claim-verify.md`
- Section: §7.1 `buildPortfolioReviewTaskSpec` context object
- Change: Add `newTier: "verified"` to the TaskSpec context alongside existing `listingId`, `score`, `callbackType` fields

**Acceptance criteria impact:** None. AC in `index.md` §22 does not specify the tier value source. The fix is defensive — current behaviour is correct for V1.
