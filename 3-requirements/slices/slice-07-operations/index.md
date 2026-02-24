# Slice 7: Operations

**Status:** Draft v2 (STRESS TESTED)
**Primary Owner:** Operations
**Last updated:** 2026-02-14
**Dependencies:** S0 (event bus, deferred action scheduler, orchestrated flow engine, service abstraction, tRPC, decision logging, notifications, email transport), S1 (Listing schema, Account schema, verification tiers, lifecycle states, engagement counters, quality scores, event emissions from D&L), S3 (claim evaluation, TaskSpec creation for manual review, verification upgrade callbacks, dispute handling), S4 (subscription schema, Paddle webhook handling, billing cycle data, payment status, pending cancellation events)
**Inputs:** `interfaces/shared-infrastructure.md` (v8), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v6), `interfaces/data-and-listings.md` (v5), `interfaces/commercial-and-revenue.md` (v3), `2-concept-design/operations.md` (v6), `2-concept-design/platform-and-product.md` (v5), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S8 (Commercial & Revenue), S9 (Entity Intelligence), S10 (Hardening)

---

## Summary

S7 implements the Operations sub-entity's full V1 surface: the admin dashboard, support triage with churn-risk-aware priority elevation, the TaskSpec human procurement queue, daily billing reconciliation with 48-hour hold grace periods, GDPR compliance management with statutory deadline tracking, orchestrated flow recovery controls (retry/skip/escalate), failed event investigation, platform health monitoring, and feature gate friction tracking. S7 is the heaviest backend slice — 34 admin tRPC routes (all behind `adminProcedure`), 13 event consumer implementations, 4 new deferred action registrations plus 2 existing handler implementations, 5 query interface implementations (`hasActiveTicket`, `checkComplianceHold`, `getDSARStatus`, `getBillingReconciliationStatus`, `getFeatureGateFrictionSummary`), 3 new notification types, 7 new database tables, 2 table amendments, and 7 pgEnum declarations.

The admin dashboard is a CSR application shell with role-guarded access (`role.startsWith("admin")`). The overview page aggregates 7 parallel COUNT queries into a single response. Support triage implements a 6-step entity decision pipeline: classify, assign priority, check churn risk, compute SLA deadline, attempt KB deflection, create ticket. The billing reconciliation handler is a self-perpetuating daily deferred action that compares Paddle's subscription state against the local database, creates 48-hour billing holds for investigation, and emits `subscription_ended` with `reason: "paddle_reconciliation"` for confirmed discrepancies. Compliance management serves three purposes via a single table: DSAR case management, obligation calendar, and audit trail.

S7 resolves 11 upstream flags (S0-3, S0-11, R3, R11, S2-6, S3-2, S3-3, S3-6, S4-6, S4-7, S4-8) and 3 open questions (Ops-Q2, Ops-Q4, Ops-Q5). It emits 1 new event type (`winback_delivery_result`) and extends the `SubscriptionEndedEvent.reason` union with `"paddle_reconciliation"`.

## V1 Scope Boundary

**In scope:**
- Admin dashboard layout, sidebar navigation, 7-panel overview with aggregate stats [Ops concept design §4]
- Support triage: keyword classification, churn-risk priority elevation, SLA deadlines (calendar time), KB deflection stub, acknowledgment emails [Ops concept design §4]
- `hasActiveTicket(listingId)` query implementation [Ops §3.1]
- TaskSpec queue: list/detail views, completion callbacks (S3 verification upgrade), re-route with max limits, escalation, timeout enforcement [Ops concept design §2]
- External contractor routing interface contract (webhook callback URL, status polling endpoint) — vendor selection deferred [D5a]
- Contractor lifecycle specification (quality gate, briefing, DPA tracking) — content deferred to pre-launch governance [D5c]
- Billing reconciliation: daily Paddle comparison, 48-hour holds, anomaly threshold (10%), self-perpetuating schedule [Ops concept design §7]
- `getBillingReconciliationStatus()` query backed by single-row table [D6, Ops §3.5]
- Compliance register: DSAR case management (30-day statutory deadline), obligation calendar, audit trail [Ops concept design §5]
- `checkComplianceHold(accountId)` and `getDSARStatus()` query implementations [Ops §3.2, §3.3]
- Compliance self-audit deferred action: data retention, GDPR register completeness, DSAR deadline checks
- Orchestrated flow admin: step-level progress, retry/skip/escalate with skip constraint matrix enforcement [SI §3.5, R11]
- Failed event admin: grouped by consumerId, resolve/retry actions [S0-11, R3]
- Platform health monitoring: 5 signal sources, three-level severity [Ops concept design §8]
- 13 event consumer implementations for all Operations-consumed events [Ops §2]
- Win-back and decay warning email delivery [Ops §7]
- `getFeatureGateFrictionSummary()` query implementation [Ops §3.4, S4-7]
- Refund processing: ticket-driven evaluation, Paddle cancellation via `PaymentService`, 30-day policy [S4-8]
- 3 new notification types via existing Notification table [D4]

**Deferred:**
- Contractor email notifications (`task_assigned` template) — V2 when internal contractor management is built [D2]
- Specific marketplace vendor selection — deployment-time decision [D5a]
- Regulatory monitoring feed source (RSS, legal advisory) — pre-launch governance [D5b]
- Business hours SLA computation — S10 if calendar-time proves insufficient
- Health trend analysis, signal history — S9 (Entity Intelligence)
- Automated friction ratio escalation — S9
- Billing reconciliation run history table — S9 if trend analysis needed
- Learned support ticket classifier (replacing keyword matching) — S9

---

## File Manifest

| # | File | Sections Covered |
|---|------|-----------------|
| 00 | `00-schema.md` | Schema additions: 7 new tables, 2 amendments, 7 pgEnums, cumulative snapshot |
| 00 | `00-router-plan.md` | 34 tRPC routes, file tree, rendering modes, admin procedure guard |
| 01 | `01-admin-dashboard.md` | §1 Admin Dashboard Layout & Navigation |
| 02 | `02-support-triage.md` | §2 Support Triage & Ticket Management |
| 03 | `03-taskspec-queue.md` | §3 TaskSpec Queue & Contractor Management |
| 04 | `04-billing-reconciliation.md` | §4 Billing Reconciliation |
| 05 | `05-compliance.md` | §5 Compliance Management |
| 06 | `06-orchestrated-flows.md` | §6 Orchestrated Flow Admin View |
| 07 | `07-failed-events.md` | §7 Failed Event Admin View |
| 08 | `08-health-monitoring.md` | §8 Platform Health Monitoring |
| 09 | `09-event-consumers.md` | §9 Event Consumer Implementations (13 consumers) |
| 10 | `10-registries.md` | §10 Pending Cancellation & Churn Risk Registries |
| 11 | `11-email-delivery.md` | §11 Win-Back & Decay Warning Email Delivery |
| 12 | `12-friction-tracking.md` | §12 Feature Gate Friction Tracking |
| 13 | `13-refund-processing.md` | §13 Refund Processing |

---

## 14. Event Consumers Registered in S7

S7 registers 12 entries in `EVENT_CONSUMER_MATRIX`. All `domain: "operations"`, all `mode: "async"`. `erasure_completed` is NOT registered — it is called directly by the erasure orchestrator (SI §3.5 step 5), not dispatched via the event bus. [Source: `09-event-consumers.md` §9.1]

| Event | Consumer ID | Mode | Source |
|-------|------------|------|--------|
| `claim_approved` | `operations:claim_approved:claimVolumeTracking` | async | D&L §1.1 |
| `claim_rejected` | `operations:claim_rejected:claimVolumeTracking` | async | D&L §1.2 |
| `listing_archived` | `operations:listing_archived:closeTickets` | async | D&L §1.3 |
| `listing_suspended` | `operations:listing_suspended:updateTickets` | async | D&L §1.4 |
| `listing_reactivated` | `operations:listing_reactivated:resumeOutreach` | async | D&L §1.5 |
| `decay_signal_detected` | `operations:decay_signal_detected:decayOutreach` | async | D&L §1.7 |
| `account_closed` | `operations:account_closed:closeTicketsAndCompliance` | async | PP §1.9 |
| `listing_created` | `operations:listing_created:onboardingTracking` | async | PP §1.6 |
| `contact_attempt` | `operations:contact_attempt:outreachPrioritisation` | async | PP §1.8 |
| `churn_risk_detected` | `operations:churn_risk_detected:churnRiskUpsert` | async | CR §1.2 |
| `winback_eligible` | `operations:winback_eligible:winbackDelivery` | async | CR §1.3 |
| `pending_cancellation_created` | `operations:pending_cancellation_created:storePendingCancellation` | async | CR §1.4 |

**Orchestrated (not in matrix):** `erasure_completed` — Ops' "close DSAR case + audit record" handler runs as step 5 of the erasure flow. [Source: `09-event-consumers.md` §9.8]

---

## 15. Deferred Actions Registered in S7

S7 registers 4 new deferred actions and implements handlers for 2 existing actions.

| Action | Params | Handler Location | Schedule | Retry | On Failure | New? |
|--------|--------|-----------------|----------|-------|------------|------|
| `sla_breach_warning` | `{ ticketId: UUID, slaDeadline: ISO8601 }` | `02-support-triage.md` §2.7 | 80% of SLA duration from ticket creation | `once` | `log` | **Yes** |
| `task_timeout_check` | `{ taskId: UUID }` | `03-taskspec-queue.md` §3.8 | `timeout` hours from task creation | `once` | `log` | **Yes** |
| `billing_hold_expiry` | `{ listingId: UUID, holdId: UUID }` | `04-billing-reconciliation.md` §4.3 | 48 hours from hold creation | `once` | `log` | **Yes** |
| `compliance_self_audit` | `Record<string, never>` | `05-compliance.md` §5.5 | Self-perpetuating daily (seeded on startup) | `once` | `log` | **Yes** |
| `billing_reconciliation` | `Record<string, never>` | `04-billing-reconciliation.md` §4.1 | Self-perpetuating daily | `retry_3` | `alert_principal` | No (SI §2.2) |
| `compliance_schedule_check` | `Record<string, never>` | `05-compliance.md` §5.4 | Self-perpetuating daily | `once` | `log` | No (SI §2.2) |

**Cancel conditions:**
- `sla_breach_warning`: cancelled on ticket resolution or closure
- `task_timeout_check`: cancelled on task completion or re-route
- `billing_hold_expiry`: cancelled on manual hold release

---

## 16. Email Templates Used in S7

S7 registers 1 new email template and uses 4 existing templates from SI §5.2.

| Template | Category | Trigger | Source |
|----------|----------|---------|--------|
| `support_acknowledgment` | Transactional | Ticket creation with `accountId` | `02-support-triage.md` §2.8 |
| `dsar_acknowledgment` | Transactional | DSAR compliance entry creation | `05-compliance.md` §5.6 |
| `dsar_completion` | Transactional | DSAR entry transitions to `completed` | `05-compliance.md` §5.6 |
| `winback` | Commercial Conversion | `winback_eligible` event consumer | `11-email-delivery.md` §11.1 |
| `listing_decay_warning` | Operations Compliance | `decay_signal_detected` event consumer | `11-email-delivery.md` §11.2 |

---

## 17. Notification Types Used in S7

3 new notification types added to `NotificationType` union (SI §8.1). All delivered via existing `Notification` table with `accountId` = admin account ID. [Source: D4]

| Type | Trigger | Link |
|------|---------|------|
| `task_overdue` | TaskSpec approaching or past timeout; task escalation | `/admin/tasks/[taskId]` |
| `billing_anomaly` | Billing reconciliation detected anomaly or critical threshold | `/admin/billing` |
| `compliance_deadline` | Compliance obligation approaching deadline; flow escalation | `/admin/compliance/[entryId]` |

---

## 18. Schema Additions

Full schema in `00-schema.md`. Summary:

**7 new tables:** `support_tickets`, `task_specs`, `churn_risk_registry`, `pending_cancellations`, `billing_holds`, `compliance_register`, `billing_reconciliation_status`.

**2 table amendments:** `orchestrated_flows` (+`updatedAt`), `event_consumer_errors` (+`resolved`, +`resolvedAt`).

**1 additional amendment (from §12):** `support_tickets` (+`details` JSONB column for category-specific metadata including gate identification for friction tracking).

**7 pgEnums:** `support_ticket_priority`, `support_ticket_status`, `task_spec_domain`, `task_spec_priority`, `task_spec_status`, `compliance_entry_type`, `compliance_entry_status`.

**Cumulative schema after S7:** S0 (8) + S1 (14) + S4 (3 + 2 amendments) + S5 (column additions) + S6 (3) + S7 (7 + 3 amendments) = **35 tables**.

---

## 19. Upstream Flag Resolutions

| Flag | Source | Section | Resolution |
|------|--------|---------|-----------|
| S0-3 | S0 downstream flags | §6 | `orchestrated_flows.updatedAt` column added. Updated on each step completion/skip/retry. Used for admin "last activity" display and sort. |
| S0-11 | S0 downstream flags | §7 | `event_consumer_errors` amended with `resolved: boolean` and `resolvedAt: timestamp`. Partial index on `(created_at DESC) WHERE resolved = false`. |
| R3 | SQ-2 | §7 | Failed event admin view implemented: grouped by `consumerId`, filterable by date range and resolved status, with resolve and retry actions. |
| R11 | SQ-2 | §6 | Skip constraint enforcement: client-side disabled buttons + server-side FORBIDDEN rejection. Skip requires free-text reason + admin `accountId`. Matrix per SI §3.5. |
| S2-6 | S2 downstream flags | §3 | Manual cleaning TaskSpecs from 4rfv import pipeline: admin creates `data_maintenance` domain TaskSpecs via the queue UI. |
| S3-2 | S3 downstream flags | §3 | Admin claim review UI: `admin.tasks.list` filtered by `domain = "verification"` displays all pending claim review TaskSpecs with evidence and checklist. |
| S3-3 | S3 downstream flags | §3 | Dispute resolution detail view: side-by-side claimant comparison panel. Admin resolves with `result: { winner, reasoning }`. |
| S3-6 | S3 downstream flags | §3 | Completion callback: `admin.tasks.complete` detects `context.callbackType === "verification_upgrade"` and calls S3's `applyVerificationUpgrade`. |
| S4-6 | S4 downstream flags | §4 | Billing monitoring: `getBillingReconciliationStatus()` query, admin billing page with status, holds, manual trigger. |
| S4-7 | S4 downstream flags | §12 | Feature gate friction tracking: `getFeatureGateFrictionSummary` aggregates tickets by gate name, displayed on health page. |
| S4-8 | S4 downstream flags | §13 | Refund processing: admin evaluation queue, approve (Paddle cancellation) / deny paths, 30-day policy guidance. |

---

## 20. Downstream Flags

| Flag | Target | Description |
|------|--------|-------------|
| S7-1 | S8 (Commercial) | Win-back email template merge fields: CR constructs `mergeFields` (subject, body, listingName, enquiryCount, viewCount) in S8; S7 delivers via `winback_eligible` consumer. S8 must populate `WinbackEligibleEvent.mergeFields` matching the `winback` template. |
| S7-2 | S9 (Entity Intel) | Friction ratio vs conversion denominator: S7 computes `ticketCount / totalTickets`. The CR-X-6 escalation threshold (5:1 complaints:conversions) requires the conversion denominator from CR data. S9 automates the cross-reference. |
| S7-3 | S9 (Entity Intel) | Entity intelligence perception wiring: S7 produces `decision_logs` entries for every triage, routing, reconciliation, and compliance action. S9 consumes these for learned classifiers, threshold auto-tuning, and pattern detection. |
| S7-4 | S10 (Hardening) | Business hours SLA computation: S7 uses calendar-time SLA (stricter). If operational experience shows calendar SLA creates false breach warnings during off-hours, S10 implements business hours calculator. |
| S7-5 | S8 (Commercial) | Churn risk registry consumption: S7 upserts `churn_risk_registry` from `churn_risk_detected` events. S8 must emit these events with `riskFactors` array including `"payment_at_risk"` for high-risk classification. |

---

## 21. Open Question Resolutions

| Question | Source | Resolution | Decision Ref |
|----------|--------|-----------|-------------|
| Ops-Q2 | Marketplace selection for human procurement | Resolved as interface contract, not vendor. S7 specifies TaskSpec queue, external routing fields (`externalRef`, `externalPlatform`), webhook callback URL contract, and status polling interface. Specific marketplace (PeoplePerHour, Upwork, etc.) is a deployment-time principal decision. | D5a |
| Ops-Q4 | Regulatory monitoring approach | Deferred to pre-launch governance. S7 specifies the compliance calendar (`compliance_register` with `type: "obligation"`) and `compliance_schedule_check` handler. The monitoring feed source (RSS, legal advisory, manual principal input) is a principal governance decision. | D5b |
| Ops-Q5 | Contractor onboarding process | Resolved at specification level. S7 documents the contractor lifecycle: procurement → quality gate → briefing → DPA → access provisioning → task assignment. Implementation details (NDA template, briefing content, DPA text) are pre-launch governance. | D5c |

---

## 22. Acceptance Criteria

### §1 Admin Dashboard (9 AC)

| # | Criterion |
|---|-----------|
| AC-1.1 | Unauthenticated users visiting `/admin` are redirected to `/login?redirect=/admin` |
| AC-1.2 | Authenticated users with `role !== "admin"` visiting `/admin` are redirected to `/dashboard` |
| AC-1.3 | `adminProcedure` returns `FORBIDDEN` for non-admin `AuthSession` |
| AC-1.4 | Admin sidebar renders 8 navigation items with correct route links |
| AC-1.5 | Sidebar badge counts are sourced from `AdminOverview` response (no independent fetches) |
| AC-1.6 | `admin.dashboard.getOverview` returns all 7 aggregate panels with correct types |
| AC-1.7 | Overview query completes in <500ms p95 |
| AC-1.8 | Notification badge displays unread count from existing `getNotifications(ctx.session.accountId)` |
| AC-1.9 | Three new notification types (`task_overdue`, `billing_anomaly`, `compliance_deadline`) are delivered via existing `Notification` table with `accountId` = admin account ID |

### §2 Support Triage (15 AC)

| # | Criterion |
|---|-----------|
| AC-2.1 | `classifyTicket` assigns one of 8 categories based on keyword matching against subject + body [S7-ST-8] |
| AC-2.2 | Base priority is deterministic per category: `data_request`, `claim_dispute`, and `refund_request` = high; `billing_support` and `account_access` = normal; `feature_gating_confusion` and `profile_support` = low; `other` = normal [S7-ST-8] |
| AC-2.3 | Churn risk elevation: `high_risk` accounts have priority elevated by one level; `at_risk` accounts receive badge only; expired entries ignored |
| AC-2.4 | SLA deadline computed from priority: critical=4h, high=24h, normal=72h, low=7d (calendar time) |
| AC-2.5 | `sla_breach_warning` deferred action scheduled at 80% of SLA duration on ticket creation with non-null `slaDeadline` |
| AC-2.6 | `sla_breach_warning` cancelled when ticket status transitions to `"resolved"` or `"closed"` |
| AC-2.7 | `support_acknowledgment` email sent on ticket creation when `accountId` is present with email |
| AC-2.8 | KB deflection returns suggested article URL for 5 categories [S7-ST-8] |
| AC-2.9 | `hasActiveTicket(listingId)` returns `ActiveTicketRecord | null` with <50ms p95 |
| AC-2.10 | `hasActiveTicket` returns null when no tickets with `status IN ('open', 'assigned')` exist |
| AC-2.11 | Every ticket creation and status change produces a `decision_logs` entry |
| AC-2.12 | `admin.support.list` supports cursor-based pagination with filters; default sort `sla_deadline ASC NULLS LAST` |
| AC-2.13 | `admin.support.getDetail` returns ticket with account email, listing name, churn risk level via LEFT JOINs |
| AC-2.14 | Priority change recomputes SLA deadline and reschedules `sla_breach_warning` for active tickets |
| AC-2.15 | `admin.support.updateStatus` is idempotent |

### §4 Billing Reconciliation (13 AC)

| # | Criterion |
|---|-----------|
| AC-4.1 | `billing_reconciliation` handler fetches active subscriptions via `PaymentService.listSubscriptions` and compares with local `listings` |
| AC-4.2 | If mismatch >= 10%, handler sets status = `"failed"`, creates `billing_anomaly` notification (critical), does NOT create holds or emit events |
| AC-4.3 | For each mismatch below threshold: if no existing hold, creates one with `expiresAt = now() + 48h` and schedules `billing_hold_expiry` |
| AC-4.4 | For expired hold with no `pending_cancellations` record: emits `subscription_ended` with `reason: "paddle_reconciliation"` and all Ops §1.2 fields |
| AC-4.5 | Handler upserts `billing_reconciliation_status` on every run |
| AC-4.6 | Handler self-perpetuates by scheduling next run at `now() + 24h` |
| AC-4.7 | `billing_hold_expiry` handler deletes expired hold; does NOT emit `subscription_ended` |
| AC-4.8 | `admin.billing.getStatus` returns current status from single-row table; <100ms p95 |
| AC-4.9 | `admin.billing.triggerReconciliation` schedules immediate deferred action and logs decision |
| AC-4.10 | `admin.billing.releaseHold` deletes hold, cancels `billing_hold_expiry`, logs decision with admin identity |
| AC-4.11 | `admin.billing.listHolds` returns paginated holds with listing name and computed `remainingHours` |
| AC-4.12 | Every reconciliation run, hold creation, and hold release produces a `decision_logs` entry |
| AC-4.13 | `checkComplianceHold` does NOT query `billing_holds` — separate queries, separate purposes |

### §5 Compliance Management (10 AC)

| # | Criterion |
|---|-----------|
| AC-5.1 | `checkComplianceHold(accountId)` returns correct hold status; <100ms p95 |
| AC-5.2 | `getDSARStatus()` returns open DSARs, approaching deadlines, recent erasures, upcoming deadlines; <200ms p95 |
| AC-5.3 | `compliance_schedule_check` creates `compliance_deadline` notification for entries within 7 days. Marks overdue. Self-perpetuates. |
| AC-5.4 | `compliance_self_audit` checks data retention, GDPR register completeness, DSAR status. Escalates on failure. Self-perpetuates. |
| AC-5.5 | DSAR creation sends `dsar_acknowledgment` email |
| AC-5.6 | DSAR completion sends `dsar_completion` email |
| AC-5.7 | DSAR entry defaults `deadline` to `receivedAt + 30 days` |
| AC-5.8 | Only `dsar`, `complaint`, `investigation` types with `status = 'open'` create holds |
| AC-5.9 | Billing holds NOT checked by `checkComplianceHold` |
| AC-5.10 | Every create and updateStatus produces a `decision_logs` entry |

### §6 Orchestrated Flow Admin (10 AC)

| # | Criterion |
|---|-----------|
| AC-6.1 | Flow list filtered by flowType and status, sorted by deadline/started_at/updated_at, cursor-based pagination |
| AC-6.2 | Erasure flows display 30-day deadline countdown (green >7d, amber 3-7d, red <3d). Closure flows: no deadline. |
| AC-6.3 | Flow detail displays each step with status, attempt count, completion time, error message |
| AC-6.4 | Retry increments attempt, sets step to in_progress, resumes execution. Decision log created. |
| AC-6.5 | Skip on skippable step records skipReason and skippedBy, advances flow. Decision log created. |
| AC-6.6 | Skip on non-skippable step rejected with FORBIDDEN. Client UI disables skip button. |
| AC-6.7 | Skip requires non-empty reason; empty rejected with BAD_REQUEST |
| AC-6.8 | Escalate sets flow to escalated, records reason and timestamp, creates notification |
| AC-6.9 | `orchestrated_flows.updatedAt` updated on every step state change. Null for pre-migration rows. |
| AC-6.10 | All recovery actions require `adminProcedure` and produce `decision_logs` entries |

### §7 Failed Event Admin (6 AC)

| # | Criterion |
|---|-----------|
| AC-7.1 | Errors grouped by `consumerId`, showing error count and latest error detail per group |
| AC-7.2 | Filterable by date range, consumerId, resolved status; default shows unresolved only |
| AC-7.3 | Resolve marks error as resolved; hidden from default view |
| AC-7.4 | Retry re-emits stored payload through event bus; original error marked resolved |
| AC-7.5 | Re-emission triggers all consumers (not directed); P2 idempotency prevents duplication |
| AC-7.6 | `totalUnresolved` count returned for health monitoring |

### §8 Platform Health (10 AC)

| # | Criterion |
|---|-----------|
| AC-8.1 | `admin.health.getStatus` returns 5 health signals with correct severity mapping |
| AC-8.2 | Overall status: unhealthy if any critical, degraded if any warning, healthy otherwise |
| AC-8.3 | Billing signal reads from single-row table; defaults to warning if no row |
| AC-8.4 | Event errors signal: >10 unresolved in 24h = critical, >0 = warning |
| AC-8.5 | Deferred action signal: >0 exhausted in 24h = warning |
| AC-8.6 | Orchestrated flow signal: >0 failed/escalated = critical |
| AC-8.7 | Paddle webhook silence: >48h since last reconciliation = warning |
| AC-8.8 | 5 queries execute in parallel; <500ms p95 |
| AC-8.9 | Health page includes friction tracking summary (§12) as sub-section |
| AC-8.10 | No persistent health history at V1 |

### §11 Email Delivery (11 AC)

| # | Criterion |
|---|-----------|
| AC-11.1 | `winback_eligible` consumer resolves email and calls `EmailService.send("winback", ...)` with CR-provided mergeFields |
| AC-11.2 | `winback_delivery_result` emitted after every processing — delivered or failed |
| AC-11.3 | `winback_delivery_result.accountId` carries through `cancelledAccountId` (not looked up separately) |
| AC-11.4 | `decay_signal_detected` consumer skips email when `activeSupportTicket` present |
| AC-11.5 | Suppressed decay warnings produce decision log with `action: "decay_warning_suppressed"` |
| AC-11.6 | Decay handler resolves listing owner; skips for unclaimed listings |
| AC-11.7 | Decay warning email includes signalType, signalSeverity, listingName as merge fields |
| AC-11.7a | Decay warning email uses `category: "listing_status"` — `EmailService` suppresses send if account has unsubscribed from this category [S7-ST-2] |
| AC-11.8 | Email send failures caught via try/catch and do NOT propagate to `event_consumer_errors` |
| AC-11.9 | Win-back uses `category: "conversion_marketing"` — suppressed if unsubscribed |
| AC-11.10 | Suppressed win-back still emits `winback_delivery_result` with `status: "failed"` |

### §12 Feature Gate Friction (8 AC)

| # | Criterion |
|---|-----------|
| AC-12.1 | `admin.friction.getSummary` returns friction ratios grouped by gate name for specified period |
| AC-12.2 | Query aggregates tickets WHERE `category = 'feature_gating_confusion'` grouped by `details->>'gate'` |
| AC-12.3 | Return type matches `FeatureGateFrictionSummary` |
| AC-12.4 | Response time <500ms p95 |
| AC-12.5 | Displayed as sub-section on `/admin/health` page |
| AC-12.6 | Rows exceeding escalation threshold highlighted in red |
| AC-12.7 | Gate names correspond to `TIER_LIMITS` keys |
| AC-12.8 | `support_tickets` includes `details` JSONB column for gate identification |

### §13 Refund Processing (9 AC)

| # | Criterion |
|---|-----------|
| AC-13.1 | `admin.refunds.list` returns refund request tickets joined with account email, listing name, subscription tier |
| AC-13.2 | Approve creates `pending_cancellations` record and calls `PaymentService.cancelSubscription({ effectiveFrom: "immediately" })` |
| AC-13.3 | Deny resolves ticket without Paddle API call |
| AC-13.4 | Both paths resolve ticket and cancel `sla_breach_warning` |
| AC-13.5 | Every evaluation produces `decision_logs` entry with decision, reason, admin identity |
| AC-13.6 | Approval does NOT emit `subscription_ended` directly — Paddle webhook triggers S4 path |
| AC-13.7 | `pending_cancellations` record created with `reason: "voluntary"` BEFORE calling Paddle |
| AC-13.8 | Rejects tickets not in `status: "open"` |
| AC-13.9 | Rejects tickets with no active subscription on listing |

**Total: 101 acceptance criteria across 10 sections.**

---

## 23. Stress Test Resolution Log (v2)

17 scenarios targeting S7's implementation delta against upstream interface specs (SI v6, Ops v3, D&L v5, PP v5, CR v3), prior slices (S0, S1, S3, S4), and concept design (operations v6). 4 High, 4 Medium, 3 Low, 6 Pass. 11 fixes applied.

Full analysis: `stress-tests/s7-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S7-ST-1 | DeferredActionParamsMap missing 4 new S7 actions | **High** | Sibling spec fix: 4 entries added to SI §2.1 + 4 rows to SI §2.2. No slice change. |
| S7-ST-2 | Decay warning email uses non-existent `EmailCategory` + internal contradiction | **High** | `11-email-delivery.md` §11.2: `"operations_compliance"` → `"listing_status"`. AC-11.7a added. |
| S7-ST-3 | `SubscriptionEndedEvent.reason` union missing `"paddle_reconciliation"` | **High** | Sibling spec fix: `"paddle_reconciliation"` added to Ops §1.2 reason union. No slice change. |
| S7-ST-4 | NotificationType union missing 3 S7 types | **High** | Sibling spec fix: 3 values added to SI §8.1. No slice change. |
| S7-ST-5 | `compliance_schedule_check` params mismatch and schedule contradiction | **Medium** | Sibling spec fix: SI §2.1 params → `Record<string, never>`, SI §2.2 schedule → daily. No slice change. |
| S7-ST-6 | `FeatureGateFrictionSummary` return type diverges from Ops §3.4 | **Medium** | Sibling spec fix: Ops §3.4 type updated to match S7 V1 implementation. No slice change. |
| S7-ST-7 | `support_acknowledgment` email template missing from SI §5.2 | **Medium** | `index.md` §16: corrected template count claim. Sibling spec fix: template added to SI §5.2 + PP §4.2. |
| S7-ST-8 | `refund_request` category not in `TicketCategory` union | **Medium** | `02-support-triage.md`: `refund_request` added to TicketCategory, classifyTicket, priority table, KB deflection. AC-2.1 and AC-2.2 updated. |
| S7-ST-9 | `winback_delivery_result` status union has unused `"bounced"` member | **Low** | Sibling spec fix: `"bounced"` removed from Ops §1.3, V2 comment added. No slice change. |
| S7-ST-10 | Friction tracking gate names include non-existent `TIER_LIMITS` keys | **Low** | `12-friction-tracking.md`: `"demographicBreakdown"` → `"viewerDemographics"`, `"maxPhotos"` → `"maxMedia"`. |
| S7-ST-11 | `applyVerificationUpgrade` callback hardcodes `"verified"` tier | **Low** | `03-taskspec-queue.md` §3.5: `"verified"` → `task.context.newTier ?? "verified"`. Sibling fix: S3 §7.1 adds `newTier` to context. |
| S7-ST-12 | `churn_risk_detected` consumer uses `ChurnRiskFactor` correctly (P4) | **Pass** | Correct. No fix needed. |
| S7-ST-13 | `pending_cancellation_created` consumer stores `CancellationReason` correctly | **Pass** | Correct. No fix needed. |
| S7-ST-14 | Orchestrated flow skip constraints match SI §3.5 | **Pass** | Correct. No fix needed. |
| S7-ST-15 | `winback_eligible` consumer — P4 compliance verified | **Pass** | Correct. No fix needed. |
| S7-ST-16 | D&L event P1 payload field compliance — all 6 consumers verified | **Pass** | Correct. No fix needed. |
| S7-ST-17 | PP event P1 payload field compliance — all 3 consumers verified | **Pass** | Correct. No fix needed. |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v6) | §1 event bus + P1–P5 principles, §2 deferred actions (6 used), §3 orchestrated flow engine + skip constraints, §4.1 `AuthSession` type, §5 email transport, §7.1 CSR for admin, §8.1 notification types, §9 decision logging, §10.1 `PaymentService` |
| `operations.md` (v3 interface) | §1 emitted events (3 types), §2 consumed events (13 consumers), §3 query interfaces (5 implementations), §4 TaskSpec standard, §5 pending cancellation registry |
| `operations.md` (v6 concept design) | §2 human procurement, §4 support triage, §5 compliance, §7 billing reconciliation, §8 platform health |
| `data-and-listings.md` (v5 interface) | §1.1–§1.9 event payload types consumed by S7 |
| `platform-and-product.md` (v5 interface) | §1.6, §1.8, §1.9 event payload types consumed by S7 |
| `commercial-and-revenue.md` (v3 interface) | §1.2–§1.4 event payload types consumed by S7, §4.1 `TIER_LIMITS` keys for friction tracking |
| `decisions/sq-2.md` | R3 (failed event admin), R11 (skip constraints), R8 (generic orchestrator) |
| `slices/slice-00-infrastructure.md` (v2) | S0-3 (updatedAt), S0-11 (resolved/resolvedAt) upstream flags |
| `slices/slice-01-data-model.md` (v2) | Schema foundation (listings, accounts, verifications tables) |
| `slices/slice-03-claim-verify.md` (v2) | S3-2, S3-3, S3-6 upstream flags; `applyVerificationUpgrade` callback |
| `slices/slice-04-subscriptions.md` (v2) | S4-6, S4-7, S4-8 upstream flags; Paddle webhook handler; `pending_cancellations` |
| `slices/slice-05-provider-experience.md` (v2) | `getNotifications` query reuse; route organization pattern |
