# S7 Stress Test — Part A (CR + Ops + SI Boundaries)

**Agent:** A
**Boundaries:** Commercial & Revenue, Operations, Shared Infrastructure
**Scenarios:** 12
**Date:** 2026-02-14

## Scenario Table

| # | Scenario | Severity | Slice § | Spec § | Finding |
|---|----------|----------|---------|--------|---------|
| S7-ST-1 | DeferredActionParamsMap missing 4 new S7 actions | **High** | index.md §15 | SI §2.1 | 4 new deferred actions (`sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit`) not in `DeferredActionParamsMap`. Blocks compilation. |
| S7-ST-2 | `compliance_schedule_check` params mismatch: SI says `{ quarter: string }`, S7 passes `{}` | **Medium** | 05-compliance.md §5.4 | SI §2.1 | S7 handler passes empty params and self-perpetuates daily. SI defines params as `{ quarter: string }` and §2.2 says "Quarterly compliance calendar". Contradictory schedule and params. |
| S7-ST-3 | `SubscriptionEndedEvent.reason` union missing `"paddle_reconciliation"` in Ops spec | **High** | 04-billing-reconciliation.md §4.1 | Ops §1.2 | S7 emits `reason: "paddle_reconciliation"` but Ops §1.2 type has only `"cancellation" | "grace_period_expired" | "account_closure"`. Type mismatch blocks compilation. |
| S7-ST-4 | NotificationType union missing 3 S7 types | **High** | index.md §17 | SI §8.1 | `task_overdue`, `billing_anomaly`, `compliance_deadline` not in SI §8.1 `NotificationType` union. Compiler rejects notification creation. |
| S7-ST-5 | Decay warning email uses invalid `EmailCategory` value | **Medium** | 11-email-delivery.md §11.2 | SI §5.1 | Handler sends with `category: "operations_compliance"` but `EmailCategory` has no such value. Correct value is `"listing_status"` based on SI §5.3. |
| S7-ST-6 | `FeatureGateFrictionSummary` return type diverges from Ops §3.4 | **Medium** | 12-friction-tracking.md | Ops §3.4 | Ops §3.4 defines `gates[].complaints` + `gates[].conversions`. S7 returns `gates[].ticketCount` + `gates[].totalTickets` + `gates[].frictionRatio`. Incompatible field names. |
| S7-ST-7 | `winback_delivery_result` status union: Ops §1.3 has `"bounced"`, S7 never produces it | **Low** | 11-email-delivery.md §11.1 | Ops §1.3 | Ops §1.3 defines `status: "delivered" | "bounced" | "failed"`. S7 maps all non-success to `"failed"`, never emitting `"bounced"`. Dead union member. |
| S7-ST-8 | `churn_risk_detected` consumer uses `ChurnRiskFactor` correctly via P4 | **Pass** | 09-event-consumers.md §9.12 | CR §1.2 | Handler checks `riskFactors.includes("payment_at_risk")` — a valid `ChurnRiskFactor` value. Upsert logic matches schema constraints. P4 compliant. |
| S7-ST-9 | `pending_cancellation_created` consumer stores `CancellationReason` correctly | **Pass** | 09-event-consumers.md §9.14 | CR §1.4 | Handler stores `event.reason` directly. Type flows from `PendingCancellationCreatedEvent.reason: CancellationReason`. No reimplementation. |
| S7-ST-10 | Orchestrated flow skip constraints match SI §3.5 | **Pass** | 06-orchestrated-flows.md §6.4 | SI §3.5 | All 12 steps (6 erasure, 6 closure) match SI §3.5 exactly. 5 non-skippable steps correctly identified. Server-side FORBIDDEN enforcement documented. |
| S7-ST-11 | `winback_eligible` consumer P4 compliance — no CR logic reimplementation | **Pass** | 09-event-consumers.md §9.13 | CR §1.3, Ops §7 | Handler passes `event.mergeFields` directly to `EmailService.send`. No field transformation, no eligibility re-evaluation. Delivery conduit pattern correct. |
| S7-ST-12 | Friction tracking gate names not validated against `TIER_LIMITS` keys | **Low** | 12-friction-tracking.md | CR §4.1 | Listed gate names (`trendAnalytics`, `topSearchTerms`, `demographicBreakdown`, etc.) include `"demographicBreakdown"` which is not a `TIER_LIMITS` key. CR §4.1 has `viewerDemographics`. Mismatch causes silent miscategorisation. |

## Detailed Findings

### S7-ST-1: DeferredActionParamsMap missing 4 new S7 actions

**Severity:** High
**Slice section:** index.md §15
**Upstream reference:** SI §2.1

**Problem:** S7 registers 4 new deferred actions (`sla_breach_warning`, `task_timeout_check`, `billing_hold_expiry`, `compliance_self_audit`) with typed params documented in index.md §15. None of these actions appear in the `DeferredActionParamsMap` type in SI §2.1. The params map is the compilation boundary — the deferred action scheduler resolves handlers by `DeferredActionParamsMap` key. Without entries, `scheduleAction("sla_breach_warning", ...)` fails at compile time. This is the same three-part sync gap pattern seen in S0–S6 (7 consecutive occurrences).

SI §2.2 Registered Actions table also lacks the 4 new rows and needs updating.

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

**Acceptance criteria impact:** No AC change needed — ACs reference deferred actions correctly. The compilation boundary is the blocker.

---

### S7-ST-2: `compliance_schedule_check` params mismatch and schedule contradiction

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

### S7-ST-3: `SubscriptionEndedEvent.reason` union missing `"paddle_reconciliation"`

**Severity:** High
**Slice section:** 04-billing-reconciliation.md §4.1 (Step 4), 00-schema.md §4
**Upstream reference:** Ops §1.2

**Problem:** S7 billing reconciliation emits `subscription_ended` with `reason: "paddle_reconciliation"` (D3 decision). The `00-schema.md` §4 correctly documents this extension: "The full union becomes: `"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`". However, the authoritative type definition in Ops §1.2 has not been updated:

```typescript
reason: "cancellation" | "grace_period_expired" | "account_closure"
```

The `"paddle_reconciliation"` value is absent. Any consumer pattern-matching on the `reason` field will fail at compile time (exhaustiveness check) or silently drop the new reason at runtime (if using string comparison).

All 4 consumers of `subscription_ended` (PP ×2, CR ×2) must handle the new value. CR's §2 consumer already branches on `origin` and `reason` for churn logging — the new reason provides reconciliation-driven churn distinction. PP consumers do not branch on `reason` (they branch on `origin`), so they require no code change — but the type must still include the new value.

**Fix — sibling spec:**
- Document: `interfaces/operations.md`
- Section: §1.2 `SubscriptionEndedEvent`
- Old: `reason: "cancellation" | "grace_period_expired" | "account_closure"`
- New: `reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`

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

**Acceptance criteria impact:** AC-1.9 references the 3 new types correctly. No AC change needed.

---

### S7-ST-5: Decay warning email uses invalid `EmailCategory` value

**Severity:** Medium
**Slice section:** 11-email-delivery.md §11.2
**Upstream reference:** SI §5.1 `EmailCategory`

**Problem:** The decay warning handler in `11-email-delivery.md` §11.2 sends the email with `category: "operations_compliance"`:

```
EmailService.send({
  ...
  category: "operations_compliance",
  accountId: listing.accountId,
})
```

The `EmailCategory` type in SI §5.1 defines 6 values: `"transactional"`, `"enquiry_notification"`, `"listing_status"`, `"profile_nudge"`, `"subscription"`, `"conversion_marketing"`. There is no `"operations_compliance"` category.

The SI §5.2 template inventory groups `listing_decay_warning` under the heading "Operations Compliance (4)" — but this is a documentation grouping header, not a category value. The template is listed as `Unsubscribable: Yes`, which means it needs a subscribable category. The correct category is `"listing_status"` — the decay warning informs the provider about their listing's status.

The same error appears in `09-event-consumers.md` §9.7 where the inline pseudocode also uses `category: "listing_status"` (which is correct). The contradiction is between §9.7 and §11.2.

**Fix — slice:**
- Section: `11-email-delivery.md` §11.2, handler pseudocode step 4
- Old: `category: "operations_compliance",`
- New: `category: "listing_status",`

**Acceptance criteria impact:** None — AC-11.4 through AC-11.8 do not specify the category value.

---

### S7-ST-6: `FeatureGateFrictionSummary` return type diverges from Ops §3.4

**Severity:** Medium
**Slice section:** 12-friction-tracking.md
**Upstream reference:** Ops §3.4

**Problem:** The Ops interface spec §3.4 defines `FeatureGateFrictionSummary` as:

```typescript
type FeatureGateFrictionSummary = {
  period: YearMonth
  gates: { gateName: string; complaints: number; conversions: number }[]
}
```

S7's implementation (both `12-friction-tracking.md` and `00-router-plan.md` §3.9) returns:

```typescript
type FeatureGateFrictionSummary = {
  period: string
  gates: { gateName: string; ticketCount: number; totalTickets: number; frictionRatio: number }[]
}
```

Three incompatibilities:
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

### S7-ST-7: `winback_delivery_result` status union has unused `"bounced"` member

**Severity:** Low
**Slice section:** 11-email-delivery.md §11.1
**Upstream reference:** Ops §1.3

**Problem:** Ops §1.3 defines `WinbackDeliveryResultEvent.status` as `"delivered" | "bounced" | "failed"`. S7's handler in `09-event-consumers.md` §9.13 and `11-email-delivery.md` §11.1 maps `EmailSendResult` to delivery status:

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

**Acceptance criteria impact:** AC-11.2 says `status: "delivered"` on success, `status: "failed"` on failure. Consistent with the fix.

---

### S7-ST-8: `churn_risk_detected` consumer uses `ChurnRiskFactor` correctly (P4)

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.12
**Upstream reference:** CR §1.2

Verified: Handler checks `event.riskFactors.includes("payment_at_risk")` — a valid member of `ChurnRiskFactor` union (CR §1.2). Risk level derivation (`"high_risk"` if `payment_at_risk` present, else `"at_risk"`) is documented in both the consumer handler and the registry section (§10.2). Upsert on `listing_id` unique constraint ensures idempotency (P2). No CR logic reimplementation — Ops only reads the factor list, does not evaluate which factors should have been included.

---

### S7-ST-9: `pending_cancellation_created` consumer stores `CancellationReason` correctly

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.14
**Upstream reference:** CR §1.4, CR §4.4

Verified: Handler stores `event.reason` directly into `pending_cancellations.reason`. The type is `PendingCancellationCreatedEvent.reason: CancellationReason` (CR §1.4). The 5-value `CancellationReason` union (`"voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"`) matches the schema comment in `00-schema.md` §2.4. The multi-emitter note correctly identifies three write paths (CR consumer, D&L consumer, PP direct write). Cleanup logic (24h inline check in webhook handler) is documented in §10.1.

---

### S7-ST-10: Orchestrated flow skip constraints match SI §3.5

**Severity:** Pass
**Slice section:** 06-orchestrated-flows.md §6.4
**Upstream reference:** SI §3.5

Verified: The skip constraint matrix in `06-orchestrated-flows.md` §6.4 reproduces all 12 steps from SI §3.5 with matching skippability values. The 5 non-skippable steps (verify identity, processErasure, close DSAR case, archive listings, deactivate account) are correctly identified. Server-side enforcement uses `TRPCError({ code: "FORBIDDEN" })`. Client-side uses `FlowStepView.skippable` to disable buttons. `skippedBy` correctly uses `ctx.session.accountId` (not `ctx.session.id`). AC-6.5 through AC-6.7 cover the enforcement.

---

### S7-ST-11: `winback_eligible` consumer — P4 compliance verified

**Severity:** Pass
**Slice section:** 09-event-consumers.md §9.13, 11-email-delivery.md §11.1
**Upstream reference:** CR §1.3, Ops §7

Verified: The handler is a delivery conduit. It passes `event.mergeFields` directly to `EmailService.send()` without transformation. No eligibility re-evaluation, no CR business logic reimplementation. The `accountId` carry-through from `cancelledAccountId` matches Ops §1.3 [OPS-ST-13]. The `"winback"` template ID matches SI §5.2. Category `"conversion_marketing"` matches SI §5.2 template categorisation. Email service preference enforcement handles the unsubscribe gate (SI §5.1). Suppressed sends still emit `winback_delivery_result` with `status: "failed"` (AC-11.10).

---

### S7-ST-12: Friction tracking gate names include non-existent `TIER_LIMITS` key

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

**Acceptance criteria impact:** AC-12.7 is correct as-is — the gate name documentation needs fixing, not the AC.
