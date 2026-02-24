# S7 Drafting Decisions

**Status:** Resolved
**Generated:** 2026-02-14
**Slice:** S7 (Operations)
**Inputs:** `s7-pre-draft-checklist.md`, `shared-infrastructure.md` (v6), `operations.md` (v3)

---

All seven decisions resolved. Three produce new specification entries (D1: deferred action, D3: reason union extension, D6: schema table). Four confirm checklist recommendations without spec changes.

| # | Decision | Options | Recommendation | Rationale |
|---|----------|---------|----------------|-----------|
| D1 | `sla_breach_warning` delivery mechanism | (A) Deferred action only (proactive email at 80% of SLA deadline). (B) On-demand dashboard computation only. (C) Both: deferred action for proactive email alert to principal; dashboard shows approaching breaches via query on `support_tickets.sla_deadline`. | **C — both.** Deferred action for email; on-demand for dashboard. | Deferred action catches breaches when admin is not looking at the dashboard — the entity acts proactively, not reactively. Dashboard provides real-time view without duplicating the alert. Cost is one additional deferred action row per ticket with an SLA deadline; at V1 scale (~50 tickets/month) this is negligible. The action is cancelled on ticket resolution (same pattern as `compliance_hold_recheck` cancellation on hold clear). |
| D2 | `task_assigned` email template for contractors | (A) Add `task_assigned` email template now. (B) Defer to V2 — contractors managed via external platforms at V1. | **B — defer to V2.** No email template added. | V1 uses external platforms (Freshdesk/marketplace) for contractor routing. Adding an internal email notification creates a delivery channel that no one monitors. S7 specifies the TaskSpec queue admin UI and the external routing interface contract (webhook callback URL for completion, status polling endpoint). When internal contractor management is built (V2+), `task_assigned` is added to SI §5.2 and the template table. |
| D3 | `subscription_ended` reason for billing reconciliation path | (A) Add `"paddle_reconciliation"` to the `reason` union in Ops §1.2. (B) Map to existing `"cancellation"` with additional `origin` field distinction. | **A — extend the union.** Add `"paddle_reconciliation"` to `SubscriptionEndedEvent.reason`. | P3 (context defensiveness) requires consumers to branch on `reason` without ambiguity. Billing reconciliation discovers a subscription ended in Paddle with no corresponding `pending_cancellation_created` event — this is a distinct causal path from voluntary cancellation, grace period expiry, or account closure. Mapping it to `"cancellation"` forces consumers to inspect `origin` to distinguish voluntary from reconciliation-detected endings, which violates the principle that `reason` alone should be sufficient for consumer branching. The union becomes: `"cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"`. Ops §1.2 updated. |
| D4 | Admin notification delivery mechanism | (A) Existing `Notification` table with `accountId` = admin account ID. (B) Separate `admin_notifications` table. (C) No persistent notifications — dashboard shows live status only. | **A — existing Notification table.** Admin is a standard account with `role: "admin"`. | Adding a separate table creates parallel infrastructure for the same concept. The existing `Notification` type (SI §8.1) already supports extensible `NotificationType` values. Three new types are added: `"task_overdue"`, `"billing_anomaly"`, `"compliance_deadline"`. Admin queries filter by `accountId` (their own account ID) — identical to provider notification queries. The `getNotifications(accountId)` query already exists from S5. No separate `getAdminNotifications` query needed. |
| D5a | Ops-Q2 (marketplace selection for human procurement) | (A) Prescribe a specific marketplace. (B) Document as V1 implementation choice — specify the interface contract, not the vendor. | **B — document the interface contract.** Marketplace selection is a deployment-time decision. | S7 specifies: (1) TaskSpec queue with external routing status fields (`externalRef?: string`, `externalPlatform?: string`); (2) webhook callback URL contract for task completion; (3) status polling interface. The specific marketplace (PeoplePerHour, Upwork, Fiverr) is a principal operational decision, not an architectural one. Resolves Ops-Q2. |
| D5b | Ops-Q4 (regulatory monitoring approach) | (A) Specify RSS feed integration. (B) Defer to pre-launch governance — specify the compliance calendar interface only. | **B — defer to pre-launch governance.** S7 specifies the compliance calendar and `compliance_schedule_check` handler. | The monitoring feed source (RSS, legal advisory retainer, manual principal input) is a principal governance decision that depends on pre-launch regulatory assessment. S7 documents: compliance calendar accepts manual entries (`compliance_register` with `type: "obligation"`) and the `compliance_schedule_check` deferred action processes them. Source of entries is out of scope. Resolves Ops-Q4 as explicitly deferred. |
| D5c | Ops-Q5 (contractor onboarding process) | (A) Defer entirely. (B) Resolve at specification level — document the lifecycle stages and interface contracts, defer implementation details. | **B — resolve at specification level.** | S7 documents the contractor lifecycle: procurement (TaskSpec created with `requiredSkills`) → quality gate (test task via external platform) → briefing (access to relevant `DataAccessScope`) → DPA (external, tracked as `compliance_register` entry) → access provisioning (external platform credentials) → task assignment. Implementation details (which NDA template, which briefing doc, DPA text) are pre-launch governance. The lifecycle is specified; the content is not. Resolves Ops-Q5. |
| D6 | `getBillingReconciliationStatus` storage | (A) Single-row `billing_reconciliation_status` table updated by the daily handler. (B) `billing_reconciliation_runs` table with full run history. | **A — single-row status table for V1.** | Run history adds query complexity and storage for a signal that only the admin dashboard consumes. The admin needs current status (healthy/anomaly/failed), last run time, and active hold count — all served by a single row. If run history becomes valuable (e.g., for trend analysis in S9 Entity Intelligence), a `billing_reconciliation_runs` table is added then. The single-row table is upserted on each daily reconciliation run. |
| D7 | Billing holds: separate `billing_holds` table vs `checkComplianceHold` integration | (A) `billing_holds` table is standalone; queried separately from compliance holds. (B) `checkComplianceHold` also checks `billing_holds`. | **A — separate queries.** `billing_holds` is standalone. `checkComplianceHold` does NOT check billing holds. | Billing holds and compliance holds serve different purposes with different lifecycles. Compliance holds (DSAR, complaint, investigation) block account closure steps — they are legal obligations. Billing holds (48-hour grace period during reconciliation) block subscription state changes — they are operational guardrails. Merging them into `checkComplianceHold` conflates legal and operational concerns, making the query contract misleading: a caller asking "is there a compliance hold?" does not expect "yes, because billing reconciliation is running." Billing hold status is checked inline during the billing reconciliation handler and surfaced via `getBillingReconciliationStatus().activeHolds`. |

---

## Specification Entries Produced

### D1: New deferred action

Add to `DeferredActionParamsMap` (SI §2.1):

```typescript
sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }
```

Add to SI §2.2 registered actions:

| Domain | Action | Trigger | Delay | Retry | On Failure |
|--------|--------|---------|-------|-------|------------|
| Operations | `sla_breach_warning` | Support ticket created with SLA deadline | `slaDeadline - (0.2 * slaDuration)` (80% elapsed) | `once` | `log` |

Cancel condition: ticket resolved or closed before 80% threshold.

S7 total new deferred actions: **4** (3 from checklist §1.1 + `sla_breach_warning`).

### D3: Ops §1.2 reason union extension

```typescript
// Updated SubscriptionEndedEvent.reason
reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"
```

Consumer impact: all 4 consumers of `subscription_ended` (PP ×2, CR ×2) must handle the new reason value. Expected behaviour:
- PP `downgradeFeatureAccess`: no branch on reason — applies regardless. No change.
- PP `showResubscribeCTA`: show CTA for all reasons. No change.
- CR `churnEventLogging`: logs `"paddle_reconciliation"` as a distinct churn reason. Enables reconciliation-driven churn analysis.
- CR `scheduleWinBack`: schedules win-back for all reasons. No change.

No consumer requires code changes to handle the new value; CR's churn log benefits from the distinction.

### D6: New schema table

```typescript
export const billingReconciliationStatus = pgTable("billing_reconciliation_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(), // "healthy" | "anomaly_detected" | "failed"
  activeHolds: integer("active_holds").notNull().default(0),
  lastAnomalyAt: timestamp("last_anomaly_at", { withTimezone: true }),
  lastAnomalyDescription: text("last_anomaly_description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

Single row, upserted on each daily reconciliation run. `getBillingReconciliationStatus()` is a simple `SELECT` on this table.

S7 total new tables: **7** (6 from checklist §6.1 + `billing_reconciliation_status`).

### D4: New notification types

Add to `NotificationType` union (SI §8.1):

```typescript
| "task_overdue"              // TaskSpec approaching or past timeout
| "billing_anomaly"           // Billing reconciliation detected anomaly
| "compliance_deadline"       // Compliance obligation approaching deadline
```

Delivered via existing `Notification` table. `accountId` = admin account ID.

---

## Summary for Downstream Agents

| Decision | Spec change required | Document affected |
|----------|---------------------|-------------------|
| D1 | Add `sla_breach_warning` to `DeferredActionParamsMap` + registered actions table | SI §2.1, SI §2.2 |
| D2 | None | — |
| D3 | Extend `SubscriptionEndedEvent.reason` union with `"paddle_reconciliation"` | Ops §1.2 |
| D4 | Add 3 notification types to `NotificationType` union | SI §8.1 |
| D5a | Resolve Ops-Q2 (interface contract, not vendor) | S7 §21 |
| D5b | Resolve Ops-Q4 (deferred to pre-launch governance) | S7 §21 |
| D5c | Resolve Ops-Q5 (lifecycle specified, content deferred) | S7 §21 |
| D6 | Add `billing_reconciliation_status` table | S7 §18 |
| D7 | None — confirms separate query paths | — |
