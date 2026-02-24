# S7 Stress Test — Operations

**Slice:** `slices/slice-07-operations/` (v1) — multi-file format
**Tested against:** shared-infrastructure.md (v6), operations.md (v3), data-and-listings.md (v5), platform-and-product.md (v5), commercial-and-revenue.md (v3)
**Date:** 2026-02-14
**Scenarios:** 17 (20 raw — 3 duplicates merged)
**Severity distribution:** 4 High, 4 Medium, 3 Low, 6 Pass
**Total fixes:** 11

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S7-ST-1 | DeferredActionParamsMap missing 4 new S7 actions | **High** | index.md §15 | SI §2.1 | 4 new deferred actions (`sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit`) not in `DeferredActionParamsMap`. Blocks compilation. Three-part sync gap (8th consecutive occurrence). |
| S7-ST-2 | Decay warning email uses non-existent `EmailCategory` value + internal contradiction | **High** | 11-email-delivery.md §11.2, 09-event-consumers.md §9.7 | SI §5.1, PP §4.2 | `category: "operations_compliance"` does not exist in `EmailCategory`. §9.7 uses correct `"listing_status"`; §11.2 uses invalid value. Internal contradiction between two descriptions of the same handler. |
| S7-ST-3 | `SubscriptionEndedEvent.reason` union missing `"paddle_reconciliation"` | **High** | 04-billing-reconciliation.md §4.1, 00-schema.md §4 | Ops §1.2 | S7 emits `reason: "paddle_reconciliation"` but Ops §1.2 type has only 3 values. Type mismatch blocks compilation for all 4 consumers. |
| S7-ST-4 | NotificationType union missing 3 S7 types | **High** | index.md §17 | SI §8.1 | `task_overdue`, `billing_anomaly`, `compliance_deadline` not in SI §8.1 `NotificationType` union. Compiler rejects notification creation. |
| S7-ST-5 | `compliance_schedule_check` params mismatch and schedule contradiction | **Medium** | 05-compliance.md §5.4 | SI §2.1, SI §2.2 | SI says `{ quarter: string }` and "Quarterly compliance calendar". S7 passes `{}` and runs daily. S7 is correct — SI needs updating. |
| S7-ST-6 | `FeatureGateFrictionSummary` return type diverges from Ops §3.4 | **Medium** | 12-friction-tracking.md | Ops §3.4 | Spec has `complaints` + `conversions` + `YearMonth`. S7 has `ticketCount` + `totalTickets` + `frictionRatio` + string period. Incompatible field names and semantics. |
| S7-ST-7 | `support_acknowledgment` email template missing from SI §5.2 | **Medium** | 02-support-triage.md §2.8 | SI §5.2 | Template used in ticket creation but not in the 25-template inventory. index.md §16 incorrectly claims "no new templates". |
| S7-ST-8 | `refund_request` category not in `TicketCategory` union | **Medium** | 13-refund-processing.md §13.1 | 02-support-triage.md §2.2 | `admin.refunds.list` filters by `category = "refund_request"` but `classifyTicket` defines only 7 categories — none is `"refund_request"`. Query always returns zero results. |
| S7-ST-9 | `winback_delivery_result` status union has unused `"bounced"` member | **Low** | 11-email-delivery.md §11.1 | Ops §1.3 | No code path produces `"bounced"`. `EmailSendResult` has no bounce status. Dead union member until V2 Resend webhook integration. |
| S7-ST-10 | Friction tracking gate names include non-existent `TIER_LIMITS` keys | **Low** | 12-friction-tracking.md | CR §4.1 | `"demographicBreakdown"` should be `"viewerDemographics"`. `"maxPhotos"` should be `"maxMedia"`. Causes silent miscategorisation. |
| S7-ST-11 | `applyVerificationUpgrade` callback hardcodes `"verified"` tier | **Low** | 03-taskspec-queue.md §3.5 | S3 §7.2 | S7 hardcodes `"verified"` as `newTier` argument. Correct for V1 but brittle if S9 introduces additional upgrade paths. Defensive fix: read from TaskSpec context. |
| S7-ST-12 | `churn_risk_detected` consumer uses `ChurnRiskFactor` correctly (P4) | **Pass** | 09-event-consumers.md §9.12 | CR §1.2 | Upsert logic matches schema constraints. P4 compliant. No CR logic reimplementation. |
| S7-ST-13 | `pending_cancellation_created` consumer stores `CancellationReason` correctly | **Pass** | 09-event-consumers.md §9.14 | CR §1.4 | Handler stores `event.reason` directly. Type flows from `PendingCancellationCreatedEvent.reason: CancellationReason`. Multi-emitter correctly documented. |
| S7-ST-14 | Orchestrated flow skip constraints match SI §3.5 | **Pass** | 06-orchestrated-flows.md §6.4 | SI §3.5 | All 12 steps match. 5 non-skippable steps correctly identified. Server-side FORBIDDEN + client-side disabled buttons. |
| S7-ST-15 | `winback_eligible` consumer — P4 compliance verified | **Pass** | 09-event-consumers.md §9.13, 11-email-delivery.md §11.1 | CR §1.3, Ops §7 | Delivery conduit pattern correct. No eligibility re-evaluation, no CR logic reimplementation. |
| S7-ST-16 | D&L event P1 payload field compliance — all 6 consumers verified | **Pass** | 09-event-consumers.md §9.2–§9.7 | D&L §1.1–§1.7, Ops §2 | All fields used by handlers are present in declared payload types. No P1 violations. |
| S7-ST-17 | PP event P1 payload field compliance — all 3 consumers verified | **Pass** | 09-event-consumers.md §9.9–§9.11 | PP §1.6, §1.8, §1.9, Ops §2 | All fields used by `account_closed`, `listing_created`, `contact_attempt` handlers match payload types. No P1 violations. |

## Detailed Findings

### S7-ST-1: DeferredActionParamsMap missing 4 new S7 actions

**Severity:** High
**Slice section:** index.md §15
**Upstream reference:** SI §2.1, SI §2.2
**Agents:** A (primary), B (corroborating)

**Problem:** S7 registers 4 new deferred actions (`sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit`) with typed params documented in index.md §15. None appear in the `DeferredActionParamsMap` type in SI §2.1. The params map is the compilation boundary — `scheduleAction()` and handler dispatch are typed against this map. Without entries, TypeScript rejects calls to `scheduleAction("sla_breach_warning", ...)` because `"sla_breach_warning"` is not a key of `DeferredActionParamsMap`.

SI §2.2 Registered Actions table also lacks the 4 new rows. The pre-draft checklist §1.1 flagged all 4 actions, but the SI amendments were not applied during drafting. This is the three-part sync gap pattern — 8th consecutive occurrence (S0–S7).

**Fix — sibling spec:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Change: Add 4 entries after `search_history_cleanup`:
```typescript
sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }
task_timeout_check: { taskId: UUID }
billing_hold_expiry: { listingId: UUID; holdId: UUID }
compliance_self_audit: Record<string, never>
```
- Section: §2.2 Registered Actions
- Change: Add 4 rows:

| Domain | Action | Trigger | Delay | Retry | On Failure |
|---|---|---|---|---|---|
| Operations | `sla_breach_warning` | Ticket creation with SLA | 80% of SLA duration | `once` | `log` |
| Operations | `task_timeout_check` | TaskSpec creation | Timeout hours from creation | `once` | `log` |
| Operations | `billing_hold_expiry` | Billing hold creation | 48 hours | `once` | `log` |
| Operations | `compliance_self_audit` | Self-perpetuating, seeded on startup | 24h recurring | `once` | `log` |

**Fix — slice:** None. S7 defines the params correctly in §15 and content sections. The gap is in the sibling spec.

**Acceptance criteria impact:** No AC change needed — ACs reference deferred actions correctly. The compilation boundary is the blocker.

---

### S7-ST-2: Decay warning email uses non-existent `EmailCategory` value + internal contradiction

**Severity:** High (elevated from Medium — Agent B identified the internal contradiction dimension)
**Slice section:** 11-email-delivery.md §11.2, 09-event-consumers.md §9.7
**Upstream reference:** SI §5.1 `EmailCategory`, PP §4.2
**Agents:** A (S7-ST-5, Medium), B (S7-ST-B1, High — primary)

**Problem:** The decay warning handler in `11-email-delivery.md` §11.2 sends with `category: "operations_compliance"`. The `EmailCategory` type in SI §5.1 defines 6 values: `"transactional"`, `"enquiry_notification"`, `"listing_status"`, `"profile_nudge"`, `"subscription"`, `"conversion_marketing"`. The value `"operations_compliance"` does not exist and will fail at compile time.

PP §4.2 (Operations Compliance templates) assigns `listing_decay_warning` to `"listing_status"` category with `Unsubscribable: Yes`. The correct category is `"listing_status"`.

Agent B identified an additional dimension: `09-event-consumers.md` §9.7 describes the same handler but uses `category: "listing_status"` (which is correct). The two descriptions of the same handler contradict each other — §9.7 is correct, §11.2 is wrong. This internal contradiction between content files is the same class of error as S6-ST-1: when multiple content agents independently describe the same mechanism, contradictions arise. The SI §5.2 template inventory groups `listing_decay_warning` under the heading "Operations Compliance (4)" — this documentation grouping header was mistaken for a category value by the §11 content agent.

**Fix — slice:**
- Section: `11-email-delivery.md` §11.2, handler pseudocode
- Old: `category: "operations_compliance",`
- New: `category: "listing_status",`

**Fix — sibling specs:** None required. SI §5.1 and PP §4.2 are correct.

**Acceptance criteria impact:** No AC currently specifies the email category. Add: "AC-11.7a: Decay warning email uses `category: "listing_status"` — `EmailService` suppresses send if account has unsubscribed from this category."

---

### S7-ST-3: `SubscriptionEndedEvent.reason` union missing `"paddle_reconciliation"`

**Severity:** High
**Slice section:** 04-billing-reconciliation.md §4.1 (Step 4), 00-schema.md §4
**Upstream reference:** Ops §1.2
**Agents:** A (S7-ST-3, High — primary), B (S7-ST-B4, Medium — corroborating)

**Problem:** S7 billing reconciliation emits `subscription_ended` with `reason: "paddle_reconciliation"` (D3 decision). The `00-schema.md` §4 correctly documents this extension: "The full union becomes: `"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`". However, the authoritative type definition in Ops §1.2 has not been updated:

```typescript
reason: "cancellation" | "grace_period_expired" | "account_closure"
```

The `"paddle_reconciliation"` value is absent. Any consumer pattern-matching on the `reason` field will fail at compile time (exhaustiveness check) or silently drop the new reason at runtime (if using string comparison).

All 4 consumers of `subscription_ended` (PP ×2, CR ×2) must handle the new value. CR's §2 consumer already branches on `origin` and `reason` for churn logging — the new reason provides reconciliation-driven churn distinction. PP consumers do not branch on `reason` (they branch on `origin`), so they require no code change — but the type must still include the new value.

Agent B noted: S7 correctly identifies the change is needed (documented in `00-schema.md` §4) but the fix was not applied to the sibling spec. This is a documentation gap, not a logic error. Severity is High because it blocks compilation for all consumers.

**Fix — sibling spec:**
- Document: `interfaces/operations.md`
- Section: §1.2 `SubscriptionEndedEvent`
- Old: `reason: "cancellation" | "grace_period_expired" | "account_closure"`
- New: `reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`

**Fix — slice:** None. S7 already documents the change correctly.

**Acceptance criteria impact:** AC-4.4 correctly specifies `reason: "paddle_reconciliation"`. No AC change needed once the type is fixed.

---

### S7-ST-4: NotificationType union missing 3 S7 types

**Severity:** High
**Slice section:** index.md §17
**Upstream reference:** SI §8.1

**Problem:** S7 creates 3 new notification types: `task_overdue`, `billing_anomaly`, `compliance_deadline`. The `NotificationType` union in SI §8.1 does not include any of these. The union currently lists 13 types ending with `"system"`. S7 handlers that call `insertNotification({ type: "billing_anomaly", ... })` will fail type checking.

S7's index.md §17 documents the 3 new types and states "All delivered via existing `Notification` table with `accountId` = admin account ID. [Source: D4]". The documentation is correct — the spec needs updating.

SI §8.1 has a note: "Extensible: slices add notification types incrementally. [Source: SI-15]" — this confirms the extension pattern but does not eliminate the need to actually add the types.

**Fix — sibling spec:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §8.1 `NotificationType`
- Change: Add 3 values to the union after `"system"`:
```typescript
| "task_overdue"                         // S7: task approaching/past timeout, escalation
| "billing_anomaly"                      // S7: billing reconciliation anomaly or critical threshold
| "compliance_deadline"                  // S7: compliance obligation approaching deadline, flow escalation
```

**Fix — slice:** None.

**Acceptance criteria impact:** AC-1.9 references the 3 new types correctly. No AC change needed.

---

### S7-ST-5: `compliance_schedule_check` params mismatch and schedule contradiction

**Severity:** Medium
**Slice section:** 05-compliance.md §5.4
**Upstream reference:** SI §2.1, SI §2.2

**Problem:** Two contradictions between S7 and SI for the existing `compliance_schedule_check` action:

1. **Params type:** SI §2.1 defines `compliance_schedule_check: { quarter: string }`. S7 §5.4 calls `scheduleAction("compliance_schedule_check", {}, now() + 24h)` with empty params `{}`. Empty object does not match `{ quarter: string }`.

2. **Schedule frequency:** SI §2.2 says "Quarterly compliance calendar" with delay "Per calendar". S7 §5.4 implements a daily self-perpetuating cycle ("schedule next check in 24h"). S7's daily cadence is operationally correct — deadline monitoring needs daily checks, not quarterly. The quarterly description in SI §2.2 reflects the concept design's compliance calendar ceremony cadence, not the handler execution frequency.

S7's implementation is the correct one: daily checks for approaching deadlines with empty params (no quarter-specific context needed). SI needs updating.

**Fix — sibling spec:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §2.1 `DeferredActionParamsMap`
- Old: `compliance_schedule_check: { quarter: string }`
- New: `compliance_schedule_check: Record<string, never>`
- Section: §2.2 Registered Actions table
- Old: `Operations | compliance_schedule_check | Quarterly compliance calendar | Per calendar | retry_3 | alert_principal`
- New: `Operations | compliance_schedule_check | Self-perpetuating, seeded on startup | 24h recurring | retry_3 | alert_principal`

**Fix — slice:** None. S7 implementation is correct.

**Acceptance criteria impact:** None — AC-5.3 correctly describes the daily self-perpetuating behaviour.

---

### S7-ST-6: `FeatureGateFrictionSummary` return type diverges from Ops §3.4

**Severity:** Medium
**Slice section:** 12-friction-tracking.md, 00-router-plan.md §3.9
**Upstream reference:** Ops §3.4

**Problem:** The Ops interface spec §3.4 defines `FeatureGateFrictionSummary` as:

```typescript
type FeatureGateFrictionSummary = {
  period: YearMonth
  gates: { gateName: string; complaints: number; conversions: number }[]
}
```

S7's implementation returns:

```typescript
type FeatureGateFrictionSummary = {
  period: string
  gates: { gateName: string; ticketCount: number; totalTickets: number; frictionRatio: number }[]
}
```

Four incompatibilities:
1. `complaints` (spec) vs `ticketCount` (slice) — same data, different name.
2. `conversions` (spec) vs `totalTickets` (slice) — different data. Spec expects conversion count from CR data; slice provides total ticket count (a different denominator).
3. `frictionRatio` not in spec — S7 adds a computed field.
4. `period: YearMonth` (spec) vs `period: string` (slice) — the slice uses `"30d" | "90d" | "365d"` for the admin route, not `YearMonth`.

The spec's `conversions` field requires CR data that Operations does not own (S7-2 downstream flag acknowledges this). S7 correctly defers the cross-domain ratio to S9. The spec should be updated to reflect V1 capability.

**Fix — sibling spec:**
- Document: `interfaces/operations.md`
- Section: §3.4 `FeatureGateFrictionSummary`
- Old:
```typescript
type FeatureGateFrictionSummary = {
  period: YearMonth
  gates: { gateName: string; complaints: number; conversions: number }[]
}
```
- New:
```typescript
type FeatureGateFrictionSummary = {
  period: string
  gates: {
    gateName: string
    ticketCount: number
    totalTickets: number
    frictionRatio: number       // ticketCount / totalTickets (V1 — conversions denominator deferred to S9)
  }[]
}
```

**Fix — slice:** None. S7 implementation is the correct V1 scope.

**Acceptance criteria impact:** AC-12.3 says "Return type matches `FeatureGateFrictionSummary`". After the spec fix, this is true.

---

### S7-ST-7: `support_acknowledgment` email template missing from SI §5.2

**Severity:** Medium
**Slice section:** 02-support-triage.md §2.8
**Upstream reference:** SI §5.2, PP §4.2

**Problem:** S7 sends a `support_acknowledgment` email on ticket creation when `accountId` is present (AC-2.7). The pre-draft checklist §2.1 identified this as a new template requiring addition to SI §5.2 (raising the count from 25 to 26). However, the template was not added to the SI template inventory during drafting.

The `index.md` §16 claims "S7 registers no new email templates. It uses 5 existing templates from SI §5.2." — this is incorrect. `support_acknowledgment` does not exist in SI §5.2. It is a new template introduced by S7.

**Fix — sibling specs:**
- Document: `interfaces/shared-infrastructure.md`
- Section: §5.2 Template Inventory, under "Operations Compliance" subsection
- Change: Add row: `| support_acknowledgment | Inbound support request classified | No |`
- Section: §5.2 Template count
- Change: `25 templates` → `26 templates`

- Document: `interfaces/platform-and-product.md`
- Section: §4.2 Operations Compliance templates
- Change: Add row: `| support_acknowledgment | Inbound support request classified | Transactional | No |`

**Fix — slice:**
- Section: `index.md` §16 header text
- Old: `S7 registers no new email templates. It uses 5 existing templates from SI §5.2.`
- New: `S7 registers 1 new email template and uses 4 existing templates from SI §5.2.`

**Acceptance criteria impact:** AC-2.7 is correct in intent but references a non-existent template. No AC change needed — the fix is in the sibling spec registration.

---

### S7-ST-8: `refund_request` category not in `TicketCategory` union

**Severity:** Medium
**Slice section:** 13-refund-processing.md §13.1–§13.2
**Upstream reference:** 02-support-triage.md §2.2

**Problem:** Refund processing filters tickets by `category = "refund_request"` (`admin.refunds.list` at §13.2). The `classifyTicket` function in §2.2 defines 7 categories: `billing_support`, `profile_support`, `claim_dispute`, `feature_gating_confusion`, `account_access`, `data_request`, `other`. The value `"refund_request"` is not among them.

Two consequences:
1. The `classifyTicket` keyword matcher will never assign `"refund_request"` — a refund-related ticket would be classified as `"billing_support"` (matching keywords "refund", "billing", "payment").
2. `admin.refunds.list` queries `WHERE category = "refund_request"` — this will always return zero results because no ticket can have that category.

The `support_tickets.category` column is `text` (not enum), so `"refund_request"` is syntactically valid. But no code path creates tickets with this category. Refund requests are semantically distinct from general billing support — they trigger a different admin workflow (refund evaluation queue vs standard ticket resolution).

**Fix — slice (Option A — recommended):**
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

**Fix — sibling specs:** None. This is an intra-slice consistency issue.

**Acceptance criteria impact:**
- AC-2.1: "one of 7 categories" → "one of 8 categories"
- AC-2.2: Add `refund_request = high` to the deterministic priority list
- AC-13.1: Currently correct in intent, but depends on the category fix to return results

---

### S7-ST-9: `winback_delivery_result` status union has unused `"bounced"` member

**Severity:** Low
**Slice section:** 11-email-delivery.md §11.1
**Upstream reference:** Ops §1.3

**Problem:** Ops §1.3 defines `WinbackDeliveryResultEvent.status` as `"delivered" | "bounced" | "failed"`. S7's handler maps `EmailSendResult` to delivery status:

```
deliveryStatus = match result.status:
  "sent" | "queued" → "delivered"
  "suppressed"      → "failed"
  "failed"          → "failed"
```

No code path produces `"bounced"`. The `EmailSendResult` type (SI §5.1) returns `"sent" | "queued" | "suppressed" | "failed"` — there is no bounce status. Bounce detection would require Resend webhook integration (delivery status callbacks), which is not in V1 scope.

The `"bounced"` value is aspirational — it anticipates V2 Resend webhook integration. At V1, it is a dead union member that no consumer can rely on.

**Fix — sibling spec:**
- Document: `interfaces/operations.md`
- Section: §1.3 `WinbackDeliveryResultEvent`
- Old: `status: "delivered" | "bounced" | "failed"`
- New: `status: "delivered" | "failed"`
- Add note: `// V2: add "bounced" when Resend delivery webhooks are integrated`

**Fix — slice:** None.

**Acceptance criteria impact:** AC-11.2 says `status: "delivered"` on success, `status: "failed"` on failure. Consistent with the fix.

---

### S7-ST-10: Friction tracking gate names include non-existent `TIER_LIMITS` keys

**Severity:** Low
**Slice section:** 12-friction-tracking.md "Gate Name Values"
**Upstream reference:** CR §4.1 `TIER_LIMITS`

**Problem:** The friction tracking documentation lists 6 gate names. Two do not match `TIER_LIMITS` keys from CR §4.1:

1. `"demographicBreakdown"` — CR §4.1 uses `viewerDemographics: boolean`. The correct gate name is `"viewerDemographics"`.
2. `"maxPhotos"` — CR §4.1 uses `maxMedia: number`. The correct gate name is `"maxMedia"`.
3. `"maxCredits"` — matches CR §4.1 `maxCredits: number | "unlimited"`. Correct.

The friction tracking query itself does not validate gate names — it aggregates whatever `details->>'gate'` values exist. But AC-12.7 states "Gate names correspond to `TIER_LIMITS` keys" and the documentation lists incorrect keys, which will cause admin confusion and miscategorisation during triage.

**Fix — slice:**
- Section: `12-friction-tracking.md` "Gate Name Values"
- Old:
```
- `"demographicBreakdown"` — buyer demographic data (Premium only)
...
- `"maxPhotos"` — photo upload limits (tier-graduated)
```
- New:
```
- `"viewerDemographics"` — buyer demographic data (Premium only)
...
- `"maxMedia"` — media upload limits (tier-graduated)
```

**Fix — sibling specs:** None.

**Acceptance criteria impact:** AC-12.7 is correct as-is — the gate name documentation needs fixing, not the AC.

---

### S7-ST-11: `applyVerificationUpgrade` callback hardcodes `"verified"` tier

**Severity:** Low
**Slice section:** 03-taskspec-queue.md §3.5
**Upstream reference:** S3 §7.2

**Problem:** S7's completion callback calls `applyVerificationUpgrade(task.context.listingId, "verified", task.context.score + 1)`. S3 §7.2 defines the function signature as `applyVerificationUpgrade(listingId: UUID, newTier: VerificationTier, score: number)`.

The signature matches. However, S7 hardcodes `"verified"` as the `newTier` argument. S3's `evaluateVerificationUpgrade` (§7.1) currently always recommends `"verified"` for portfolio review tasks. But if S9 introduces additional upgrade paths (e.g., `"premium_verified"` via insurance or award verification), the hardcoded value would be incorrect.

The safer pattern is to store the intended `newTier` in the TaskSpec context at creation time (S3 already stores `score` in context). S3 §7.1's `buildPortfolioReviewTaskSpec` should include `newTier: "verified"` in the context. S7's callback should read `task.context.newTier` instead of hardcoding.

**Fix — slice:**
- Section: `03-taskspec-queue.md` §3.5 completion callback
- Old: `await applyVerificationUpgrade(task.context.listingId, "verified", task.context.score + 1)`
- New: `await applyVerificationUpgrade(task.context.listingId, task.context.newTier ?? "verified", task.context.score + 1)`

**Fix — sibling specs:**
- Document: `slices/slice-03-claim-verify.md`
- Section: §7.1 `buildPortfolioReviewTaskSpec` context object
- Change: Add `newTier: "verified"` to the TaskSpec context alongside existing `listingId`, `score`, `callbackType` fields

**Acceptance criteria impact:** None. AC in index.md §22 does not specify the tier value source. The fix is defensive — current behaviour is correct for V1.

---

### S7-ST-12: `churn_risk_detected` consumer uses `ChurnRiskFactor` correctly (P4)

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.12
**Upstream reference:** CR §1.2

Handler checks `event.riskFactors.includes("payment_at_risk")` — a valid member of `ChurnRiskFactor` union (CR §1.2). Risk level derivation (`"high_risk"` if `payment_at_risk` present, else `"at_risk"`) is documented in both the consumer handler and the registry section (§10.2). Upsert on `listing_id` unique constraint ensures idempotency (P2). No CR logic reimplementation — Ops only reads the factor list, does not evaluate which factors should have been included.

---

### S7-ST-13: `pending_cancellation_created` consumer stores `CancellationReason` correctly

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.14
**Upstream reference:** CR §1.4, CR §4.4

Handler stores `event.reason` directly into `pending_cancellations.reason`. The type is `PendingCancellationCreatedEvent.reason: CancellationReason` (CR §1.4). The 5-value `CancellationReason` union (`"voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"`) matches the schema comment in `00-schema.md` §2.4. The multi-emitter note correctly identifies three write paths (CR consumer, D&L consumer, PP direct write). Cleanup logic (24h inline check in webhook handler) is documented in §10.1.

---

### S7-ST-14: Orchestrated flow skip constraints match SI §3.5

**Severity:** Pass
**Slice section:** 06-orchestrated-flows.md §6.4
**Upstream reference:** SI §3.5

The skip constraint matrix in `06-orchestrated-flows.md` §6.4 reproduces all 12 steps from SI §3.5 with matching skippability values. The 5 non-skippable steps (verify identity, processErasure, close DSAR case, archive listings, deactivate account) are correctly identified. Server-side enforcement uses `TRPCError({ code: "FORBIDDEN" })`. Client-side uses `FlowStepView.skippable` to disable buttons. `skippedBy` correctly uses `ctx.session.accountId` (not `ctx.session.id`). AC-6.5 through AC-6.7 cover the enforcement.

---

### S7-ST-15: `winback_eligible` consumer — P4 compliance verified

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.13, 11-email-delivery.md §11.1
**Upstream reference:** CR §1.3, Ops §7

The handler is a delivery conduit. It passes `event.mergeFields` directly to `EmailService.send()` without transformation. No eligibility re-evaluation, no CR business logic reimplementation. The `accountId` carry-through from `cancelledAccountId` matches Ops §1.3 [OPS-ST-13]. The `"winback"` template ID matches SI §5.2. Category `"conversion_marketing"` matches SI §5.2 template categorisation. Email service preference enforcement handles the unsubscribe gate (SI §5.1). Suppressed sends still emit `winback_delivery_result` with `status: "failed"` (AC-11.10).

---

### S7-ST-16: D&L event P1 payload field compliance — all 6 consumers verified

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.2–§9.7
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

### S7-ST-17: PP event P1 payload field compliance — all 3 consumers verified

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.9–§9.11
**Upstream reference:** PP §1.6, §1.8, §1.9, Ops §2 P1 table

S7 consumes 3 PP events (`account_closed`, `listing_created`, `contact_attempt`). Each handler uses only P1-declared payload fields.

Verified field-by-field:
- `account_closed`: uses `accountId`, `listingsArchived`, `complianceHoldActive` — all in `AccountClosedEvent` (PP §1.9). `listingsArchived` is `UUID[]` in the payload, and the handler does not iterate it (only closes tickets by `accountId`).
- `listing_created`: uses `listingId`, `entityType`, `timestamp` — all in `ListingCreatedEvent` (PP §1.6)
- `contact_attempt`: uses `listingId`, `result` — all in `ContactAttemptEvent` (PP §1.8)

No P1 violations. The `account_closed` handler's compliance register update uses `event.accountId` and `event.complianceHoldActive` — both declared in the payload. The handler does not access `buyerDataDeleted` or `paddleCancellationsPending` (not needed for its actions).

---

## Summary

S7 is structurally sound but carries the recurring three-part sync gap debt (now 8 consecutive occurrences) and introduces one new error class: intra-slice contradictions between content files describing the same handler (S7-ST-2, same pattern as S6-ST-1). The 4 High findings are all type-level gaps that block compilation — DeferredActionParamsMap (4 actions), EmailCategory (invalid value), SubscriptionEndedEvent.reason (missing union member), and NotificationType (3 missing types). All are straightforward sibling spec amendments with no architectural implications. The Medium findings include one internal-only bug (refund_request category never assigned, S7-ST-8) that would render an entire admin feature non-functional at runtime — this is the most consequential finding despite its Medium severity classification because it is invisible to type checking (the column is `text`, not `enum`).

The 6 Pass scenarios (35% pass rate) confirm that S7's event consumer implementations are P1/P4 compliant and that orchestrated flow skip constraints correctly mirror SI §3.5. This pass rate is consistent with expectations for a backend-heavy slice with 13 consumers and 5 query interface implementations.

### Downstream Flag Audit

| Flag | Status | Notes |
|------|--------|-------|
| S7-1 | **Unchanged** | Win-back merge fields remain an S8 responsibility. S7-ST-15 confirms S7's delivery conduit pattern is correct — no changes to the flag's scope. |
| S7-2 | **Unchanged** | Friction ratio vs conversion denominator correctly deferred to S9. S7-ST-6 confirms S7's V1 implementation (ticketCount/totalTickets) is appropriate; the cross-domain CR denominator remains an S9 concern. |
| S7-3 | **Unchanged** | Entity intelligence perception wiring. S7 produces `decision_logs` entries throughout — confirmed by AC-2.11, AC-4.12, AC-5.10, AC-6.10, AC-13.5. S9 consumption scope unaffected. |
| S7-4 | **Unchanged** | Business hours SLA. S7-ST-5 confirms S7 uses calendar-time SLA (daily deferred action checks). S10 decision remains conditional on operational experience. |
| S7-5 | **Unchanged** | Churn risk registry consumption. S7-ST-12 confirms S7's upsert logic and `payment_at_risk` check are P4-compliant. S8 responsibility to emit events with correct `riskFactors` is unaffected. |

### Sibling Spec Changes Required

| Document | Section | Change | Source Scenario |
|----------|---------|--------|-----------------|
| `shared-infrastructure.md` | §2.1 `DeferredActionParamsMap` | Add 4 entries: `sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit` | S7-ST-1 |
| `shared-infrastructure.md` | §2.1 `DeferredActionParamsMap` | Change `compliance_schedule_check: { quarter: string }` → `compliance_schedule_check: Record<string, never>` | S7-ST-5 |
| `shared-infrastructure.md` | §2.2 Registered Actions | Add 4 rows for new Operations deferred actions | S7-ST-1 |
| `shared-infrastructure.md` | §2.2 Registered Actions | Update `compliance_schedule_check` row: "Quarterly compliance calendar / Per calendar" → "Self-perpetuating, seeded on startup / 24h recurring" | S7-ST-5 |
| `shared-infrastructure.md` | §5.2 Template Inventory | Add `support_acknowledgment` template row; update count 25 → 26 | S7-ST-7 |
| `shared-infrastructure.md` | §8.1 `NotificationType` | Add 3 values: `task_overdue`, `billing_anomaly`, `compliance_deadline` | S7-ST-4 |
| `operations.md` | §1.2 `SubscriptionEndedEvent` | Add `"paddle_reconciliation"` to `reason` union | S7-ST-3 |
| `operations.md` | §1.3 `WinbackDeliveryResultEvent` | Remove `"bounced"` from `status` union; add V2 comment | S7-ST-9 |
| `operations.md` | §3.4 `FeatureGateFrictionSummary` | Replace type: `complaints`/`conversions`/`YearMonth` → `ticketCount`/`totalTickets`/`frictionRatio`/`string` | S7-ST-6 |
| `platform-and-product.md` | §4.2 Operations Compliance | Add `support_acknowledgment` template row | S7-ST-7 |
| `slices/slice-03-claim-verify.md` | §7.1 `buildPortfolioReviewTaskSpec` | Add `newTier: "verified"` to TaskSpec context | S7-ST-11 |
