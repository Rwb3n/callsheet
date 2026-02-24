# S7 Pre-Draft Checklist — Operations

**Generated:** 2026-02-14
**Slice:** `slices/slice-07-operations/` (multi-file format)
**Primary domain:** Operations
**Upstream specs:** `shared-infrastructure.md` (v6), `operations.md` (v3), `platform-and-product.md` (v5), `data-and-listings.md` (v5), `commercial-and-revenue.md` (v3)

---

## 1. Deferred Actions to Register

S7 introduces **3 new deferred actions** and implements handlers for 3 existing ones.

### 1.1 New Deferred Actions

| Action | Params | Trigger | Delay | Retry | On Failure | Domain |
|--------|--------|---------|-------|-------|------------|--------|
| `compliance_self_audit` | `Record<string, never>` | Self-perpetuating, seeded on startup | 24h recurring | `retry_3` | `alert_principal` | Operations |
| `task_timeout_check` | `{ taskId: UUID }` | TaskSpec created | Per domain timeout (8h–7d, see Ops §2) | `once` | `log` | Operations |
| `billing_hold_expiry` | `{ listingId: UUID; holdId: UUID }` | Billing reconciliation creates 48h hold | 48 hours | `once` | `log` | Operations |

**SI §2.1 entries to add:**

```typescript
// Add to DeferredActionParamsMap
compliance_self_audit: Record<string, never>
task_timeout_check: { taskId: UUID }
billing_hold_expiry: { listingId: UUID; holdId: UUID }
```

**SI §2.2 rows to add:**

| Domain | Action | Trigger | Delay | Retry | On Failure |
|--------|--------|---------|-------|-------|------------|
| Operations | `compliance_self_audit` | Self-perpetuating, seeded on startup | 24h recurring | `retry_3` | `alert_principal` |
| Operations | `task_timeout_check` | TaskSpec created | Per domain default timeout | `once` | `log` |
| Operations | `billing_hold_expiry` | Billing reconciliation creates hold | 48 hours | `once` | `log` |

### 1.2 Existing Deferred Actions — S7 Implements Handlers

| Action | Registered In | S7 Handler |
|--------|--------------|------------|
| `compliance_schedule_check` | SI §2.2 | S7 implements the quarterly compliance calendar check handler |
| `billing_reconciliation` | SI §2.2 | S7 implements the daily billing reconciliation handler |
| `checkout_precondition_retry` | SI §2.2 (S4-ST-1) | S7 admin view displays failed/exhausted retries. No new handler — S4 implements handler, S7 provides visibility. |

### 1.3 Decision Needed During Drafting

**`sla_breach_warning`?** Ops concept design §4 specifies SLA breach alerts at 80% of deadline. This could be a deferred action (schedule on ticket creation, cancel on resolution) or computed on-demand when rendering the admin dashboard. If deferred action:

```typescript
sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }
```

Tradeoff: deferred action is proactive (email/notification); on-demand is simpler (dashboard shows approaching breaches). **Recommend deferred action for email alerts to principal; on-demand for dashboard display.**

---

## 2. Email Templates to Register

S7 introduces **1 new email template** and implements send logic for 2 existing ones.

### 2.1 New Templates

| Template ID | Trigger | Category | Unsubscribable | Owner |
|-------------|---------|----------|----------------|-------|
| `support_acknowledgment` | Inbound support request received (auto-ack, Ops §4) | `transactional` | No | Operations |

**SI §5.2 row to add:**

| Template ID | Trigger | Unsubscribable |
|-------------|---------|----------------|
| `support_acknowledgment` | Inbound support request classified | No |

**Current count:** 25 templates (SI §5.2). After S7: **26**.

### 2.2 Existing Templates — S7 Implements Send Logic

| Template ID | Already In | S7 Usage |
|-------------|-----------|----------|
| `listing_decay_warning` | SI §5.2 (Operations Compliance) | S7 implements the decay warning email send handler — triggered by Ops consumer of `decay_signal_detected`. S4-ST-9 confirmed this belongs to S7. |
| `winback` | SI §5.2 (Commercial Conversion) | S7 implements the win-back email delivery handler — Ops consumer of `winback_eligible` from CR. Already in SI. |
| `dsar_acknowledgment` | SI §5.2 (Operations Compliance) | S7 provides the admin UI trigger and implements the DSAR acknowledgment send. |
| `dsar_completion` | SI §5.2 (Operations Compliance) | S7 implements the DSAR/erasure completion notification send. |
| `article_14_notice` | SI §5.2 (Operations Compliance) | S7 provides the admin view for Article 14 batch send status. Send logic is pre-launch (S2 import pipeline). |

### 2.3 Decision Needed During Drafting

**`task_assigned`?** When a TaskSpec is assigned to a contractor, should they receive an email notification? The concept design implies Freshdesk or marketplace routing — at V1, contractors are managed via external platforms. No email template needed if all task routing is via external tools. **Recommend: defer to V2. S7 provides the admin TaskSpec queue; contractor notification is via external channels.**

---

## 3. Event Emissions

S7 emits events already defined in Ops interface spec §1. No new event types.

| Event | Emitted By | Key Payload Fields | P1 Check |
|-------|-----------|-------------------|----------|
| `subscription_tier_changed` | Ops (S7 Paddle webhook handler — already implemented in S4, S7 extends with billing reconciliation emission path) | `listingId`, `accountId`, `previousTier`, `newTier`, `timestamp` | All present in Ops §1.1 ✓ |
| `subscription_ended` | Ops (S7 billing reconciliation — confirmed missing from Paddle path) | `listingId`, `accountId`, `previousTier`, `reason`, `origin`, `timestamp` | All present in Ops §1.2 ✓ |
| `winback_delivery_result` | Ops (S7 win-back email handler) | `listingId`, `accountId`, `status`, `timestamp` | All present in Ops §1.3 ✓ |

**Critical check:** `subscription_ended` emitted from billing reconciliation must include `origin: "paddle"` and use `inferCancellationReason` for attribution via the `pending_cancellation` registry. The `reason` field must be one of `"cancellation" | "grace_period_expired" | "account_closure"`. Billing reconciliation specifically uses `reason: "paddle_reconciliation"` — **this value is not in the Ops §1.2 union type.** Decision needed: add `"paddle_reconciliation"` to the reason union, or map to `"cancellation"`.

**Note:** S4 already implements the Paddle webhook handler and the three event emissions. S7 extends this with the billing reconciliation emission path and the win-back delivery handler. S7 should NOT re-implement the webhook handler — it extends the consumer matrix with new admin views.

---

## 4. Event Consumers

S7 implements handlers for **13 events consumed by Operations** (Ops interface spec §2). Most are new implementations; some extend S4's Paddle webhook handling.

### 4.1 New Consumer Implementations in S7

| Event | Source | Ops Action | Sync/Async | Implementation |
|-------|--------|-----------|------------|---------------|
| `claim_approved` | D&L | Claim volume tracking, learning hypothesis L2/L3 | Async | New handler in S7 |
| `claim_rejected` | D&L | Claim volume tracking | Async | New handler in S7 |
| `listing_archived` | D&L | Close active support tickets for listing | Async | New handler in S7 |
| `listing_suspended` | D&L | Close/update relevant tickets | Async | New handler in S7 |
| `listing_reactivated` | D&L | Resume outreach, re-enable enrichment cadence | Async | New handler in S7 |
| `decay_signal_detected` | D&L | Cross-ref active tickets, suppress duplicate outreach | Async | New handler in S7 |
| `erasure_completed` | D&L | Close DSAR case, create compliance audit record | Orchestrated | New handler in S7 |
| `account_closed` | PP | Close active tickets, update compliance register, compliance hold monitor | Async | New handler in S7 |
| `listing_created` | PP | Onboarding volume tracking | Async | New handler in S7 |
| `contact_attempt` | PP | Outreach prioritisation for unreachable listings | Async | New handler in S7 |
| `churn_risk_detected` | CR | Upsert `ChurnRiskRegistry`, elevate ticket priority | Async | New handler in S7 |
| `winback_eligible` | CR | Send win-back email via Resend, emit `winback_delivery_result` | Async | New handler in S7 |
| `pending_cancellation_created` | CR | Store pending cancellation record for Paddle attribution | Async | New handler in S7 |

**`EVENT_CONSUMER_MATRIX` additions:** S7 must register all 13 Operations consumer entries in the matrix. S4 already registers Operations' Paddle webhook-related entries — verify no duplication.

### 4.2 Existing Consumers — S4 Already Implements

S4 implements the Paddle webhook handler within Operations' boundary. S7 should NOT duplicate these. S7 adds administrative views on top of the S4-implemented handler.

---

## 5. Notification Types

S7 introduces **3 new notification types** for admin-facing alerts.

```typescript
// Add to NotificationType union (SI §8.1)
| "task_overdue"                  // TaskSpec approaching timeout
| "billing_anomaly"              // Billing reconciliation detected anomaly
| "compliance_deadline"          // Compliance obligation approaching deadline
```

**Decision needed:** These are admin-only notifications (role = `"admin"`). The existing notification infrastructure targets account holders. Admin notifications may need a separate query (`getAdminNotifications` vs `getNotifications`) or a filter by recipient role. **Recommend: use existing `Notification` table with `accountId` set to admin account ID.** Admin is a standard account with `role: "admin"`.

---

## 6. Schema Amendments

S7 is the heaviest schema slice since S1. It introduces 6 new tables and amends 2 existing ones.

### 6.1 New Tables

```typescript
// 1. support_tickets — Ops active ticket registry + full ticket lifecycle
export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  category: text("category").notNull(),                    // from triage: "billing_support", "profile_support", etc.
  priority: supportTicketPriorityEnum("priority").notNull(), // "critical" | "high" | "normal" | "low"
  status: supportTicketStatusEnum("status").notNull().default("open"), // "open" | "assigned" | "resolved" | "closed"
  subject: text("subject").notNull(),
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id), (listing_id), (status, priority), (sla_deadline) WHERE status = 'open'

// 2. task_specs — Operations TaskSpec queue (R6: immutable post-creation)
export const taskSpecs = pgTable("task_specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: taskSpecDomainEnum("domain").notNull(),          // "verification" | "support" | "moderation" | "compliance" | "data_maintenance" | "outreach"
  priority: taskSpecPriorityEnum("priority").notNull(),    // "critical" | "high" | "normal" | "low"
  status: taskSpecStatusEnum("status").notNull().default("pending"), // "pending" | "assigned" | "in_progress" | "completed" | "timed_out" | "re_routed"
  task: text("task").notNull(),
  context: jsonb("context").notNull(),                     // snapshot at creation (R6 immutability)
  checklist: jsonb("checklist").notNull().$type<string[]>(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  estimatedTime: text("estimated_time").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  timeout: integer("timeout").notNull(),                   // hours
  escalation: text("escalation").notNull(),
  requiredSkills: jsonb("required_skills").notNull().$type<string[]>(),
  dataAccessScope: jsonb("data_access_scope").notNull().$type<DataAccessScope>(),
  learningCapture: jsonb("learning_capture").notNull().$type<LearningCapture>(),
  rerouteCount: integer("reroute_count").notNull().default(0),
  maxReroutes: integer("max_reroutes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  result: jsonb("result"),                                 // outcome captured on completion
})
// Index: (domain, status), (status, priority), (deadline) WHERE status IN ('pending', 'assigned', 'in_progress')

// 3. churn_risk_registry — queryable index for support triage priority elevation
export const churnRiskRegistry = pgTable("churn_risk_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  riskLevel: text("risk_level").notNull(),                 // "at_risk" | "high_risk"
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // +90 days auto-expire
})
// Index: (account_id), (expires_at)
// Unique: (listing_id) — upsert on new detection

// 4. pending_cancellations — Paddle webhook attribution registry
export const pendingCancellations = pgTable("pending_cancellations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paddleSubscriptionId: text("paddle_subscription_id").notNull().unique(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),                        // "account_closed" | "listing_archived" | "voluntary"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (paddle_subscription_id) — unique lookup during webhook processing

// 5. billing_holds — 48-hour grace period for billing reconciliation
export const billingHolds = pgTable("billing_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id) — unique
// Index: (expires_at)

// 6. compliance_register — DSAR tracking, compliance obligations, audit records
export const complianceRegister = pgTable("compliance_register", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: complianceEntryTypeEnum("type").notNull(),         // "dsar" | "erasure" | "article_14" | "complaint" | "investigation" | "obligation"
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  status: complianceEntryStatusEnum("status").notNull(),   // "open" | "in_progress" | "completed" | "overdue"
  receivedAt: timestamp("received_at", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  details: jsonb("details"),                               // type-specific structured data
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (type, status), (account_id), (deadline) WHERE status IN ('open', 'in_progress')
```

### 6.2 Existing Table Amendments

| Table | Amendment | Type | Source |
|-------|----------|------|--------|
| `orchestrated_flows` | Add `updatedAt` column | `timestamp("updated_at", { withTimezone: true })` — updated on each step completion | S0-3 downstream flag |
| `event_consumer_errors` | Add `resolved` and `resolvedAt` columns | `resolved: boolean NOT NULL DEFAULT false`, `resolvedAt: timestamp` | S0-11 downstream flag |

**pgEnum declarations for S7:**

```typescript
export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", ["critical", "high", "normal", "low"])
export const supportTicketStatusEnum = pgEnum("support_ticket_status", ["open", "assigned", "resolved", "closed"])
export const taskSpecDomainEnum = pgEnum("task_spec_domain", ["verification", "support", "moderation", "compliance", "data_maintenance", "outreach"])
export const taskSpecPriorityEnum = pgEnum("task_spec_priority", ["critical", "high", "normal", "low"])
export const taskSpecStatusEnum = pgEnum("task_spec_status", ["pending", "assigned", "in_progress", "completed", "timed_out", "re_routed"])
export const complianceEntryTypeEnum = pgEnum("compliance_entry_type", ["dsar", "erasure", "article_14", "complaint", "investigation", "obligation"])
export const complianceEntryStatusEnum = pgEnum("compliance_entry_status", ["open", "in_progress", "completed", "overdue"])
```

---

## 7. Upstream Flags to Resolve

| Flag | Source | Description | Resolution Needed |
|------|--------|-------------|-------------------|
| S0-3 | S0 §downstream flags | `orchestrated_flows` may benefit from `updatedAt` column for admin "last activity" queries | S7 adds `updatedAt` column to `orchestrated_flows` table. Updated on each step completion. §6.2 above. |
| S0-11 | S0 §downstream flags | `event_consumer_errors` table lacks `resolved` / `resolvedAt` columns for admin resolution tracking | S7 adds `resolved: boolean` and `resolvedAt: timestamp` to `event_consumer_errors`. §6.2 above. |
| S2-6 | S2 §downstream flags | 4rfv import Phase 3 (manual cleaning) requires Operations TaskSpec and contractor procurement. S2 provides the export script. S7 provides admin UI and task routing. | S7 implements the TaskSpec queue admin UI that displays Phase 3 manual cleaning tasks. Task routing via external platforms (Freshdesk/marketplace) at V1. |
| S3-2 | S3 §downstream flags | Admin claim review UI — TaskSpec queue with listing context, evidence summary, confidence score, checklist. S3 creates TaskSpecs, S7 displays and manages them. | S7 implements admin TaskSpec list view filtered by `domain = "verification"`, with listing context panel, evidence display, confidence score, and checklist rendering. |
| S3-3 | S3 §downstream flags | Dispute resolution admin UI — display both claimants, evidence, timeline, escalation status. S7 provides the admin interface for dispute TaskSpecs. | S7 implements dispute TaskSpec detail view with dual-claimant display, evidence comparison, timeline, and escalation controls. |
| S3-6 | S3 §downstream flags | `evaluateVerificationUpgrade` portfolio review TaskSpec completion callback — S7 provides the admin completion handler that calls back into S3's `applyVerificationUpgrade` | S7 implements the "Complete" action on portfolio review TaskSpecs that calls S3's `applyVerificationUpgrade(listingId)` function. |
| S4-6 | S4 §downstream flags | Billing reconciliation monitoring UI and failed event admin view — S7 provides the admin interface for billing health and subscription anomalies | S7 implements billing reconciliation status display (calls `getBillingReconciliationStatus()`) and failed event admin view (R3). |
| S4-7 | S4 §downstream flags | Feature gate friction tracking — complaint logging per gate, friction ratio computation. S7 provides admin data entry, Ops provides `getFeatureGateFrictionSummary` query implementation. | S7 implements `getFeatureGateFrictionSummary` query (aggregates `support_tickets` by category `"feature_gating_confusion"` + gate name). Admin UI displays friction ratios. |
| S4-8 | S4 §downstream flags | Refund processing UI — S7 admin interface for evaluating and executing refunds via Paddle API | S7 implements admin refund evaluation view. Calls `PaymentService.cancelSubscription` with `effectiveFrom: "immediately"` for approved refunds. Decision log entry for each refund decision. |

**Summary:** 9 upstream flags. All require S7 implementation. None pre-resolved.

---

## 8. Open Questions to Resolve

| # | Question | Expected Resolution |
|---|----------|-------------------|
| Ops-Q2 | Marketplace selection for human procurement (PeoplePerHour, Upwork, Fiverr, sector-specific?) | S7 should resolve or explicitly defer. **Recommend: document as V1 implementation choice.** S7 specifies the TaskSpec queue and external routing interface — the specific marketplace is a deployment-time decision. S7 documents the interface contract for external task routing (webhook callback URL for completion, status polling). |
| Ops-Q4 | Regulatory monitoring approach (RSS feeds, legal advisory retainer, manual principal input?) | S7 should resolve or explicitly defer. **Recommend: defer to pre-launch governance.** S7 specifies the compliance calendar and `compliance_schedule_check` handler. The monitoring feed source is a principal decision. Document the interface: compliance calendar accepts manual entries and scheduled checks. |
| Ops-Q5 | Contractor onboarding process (test task, NDA, briefing materials, access provisioning) | S7 should resolve or explicitly defer. **Recommend: resolve at specification level.** S7 documents the contractor lifecycle: procurement → quality gate (test task) → briefing → DPA → access provisioning → task assignment. Implementation details (which NDA template, which briefing doc) are pre-launch governance. |
| R3 | Failed event admin view with aggregation by event type/consumer/error/time range | **Must resolve.** S7 implements the admin view reading `event_consumer_errors` table. UI: grouped by `consumerId` (which encodes `{domain}:{eventType}:{actionName}`), filterable by date range, sortable by count. Resolution actions: mark resolved, retry (re-emit event). |
| R6 | TaskSpec instances snapshot field values at creation. Immutable post-creation. | **Must resolve.** S7 implements `task_specs` table with `context: jsonb` (snapshot) and no UPDATE on content fields. Only `status`, `rerouteCount`, `completedAt`, and `result` are mutable. |
| R11 | Skip constraint matrix — per step per flow type, enforced in admin UI | **Must resolve.** S7 implements the admin orchestrated flow view with skip buttons. Skip is disabled for non-skippable steps per SI §3.5. Skip requires free-text reason + admin identifier. |

---

## 9. Query Interface Implementations

S7 implements **5 Ops query interfaces** (Ops interface spec §3).

| Interface | Signature | Consumer | Implementation Notes |
|-----------|----------|----------|---------------------|
| `hasActiveTicket(listingId)` | → `ActiveTicketRecord \| null` | D&L (before suspension) | Query `support_tickets` by `listingId` WHERE `status IN ('open', 'assigned')`. <50ms p95. |
| `checkComplianceHold(accountId)` | → `ComplianceHoldResult` | PP (account closure) | Query `compliance_register` by `accountId` WHERE `type IN ('dsar', 'complaint', 'investigation')` AND `status = 'open'`. <100ms p95. |
| `getDSARStatus()` | → `DSARDashboardView` | PP (admin dashboard) | Aggregate `compliance_register` WHERE `type = 'dsar'`. <200ms p95. |
| `getFeatureGateFrictionSummary(period)` | → `FeatureGateFrictionSummary` | CR (monthly ceremony) | Aggregate `support_tickets` WHERE `category = 'feature_gating_confusion'` by gate name within period. <500ms p95. |
| `getBillingReconciliationStatus()` | → `BillingReconciliationStatus` | PP (admin dashboard) | Read `billing_reconciliation_status` row (single-row table or latest entry). <100ms p95. |

**Note:** `getBillingReconciliationStatus` may require a dedicated `billing_reconciliation_runs` table to track run history, or a single-row status table updated by the daily reconciliation handler. **Recommend: single-row status table** for simplicity at V1. Add `billing_reconciliation_runs` to schema if run history display is needed.

---

## 10. Drafting Reminders (from stress test patterns)

| # | Pattern | Check |
|---|---------|-------|
| 1 | **Three-part sync gap** | S7 adds 3 deferred actions: add to `DeferredActionParamsMap` (SI §2.1) + registered actions table (SI §2.2) + handler in slice. Also 1 email template: add to SI §5.2 + PP template table. |
| 2 | **P1 payload compliance** | S7 implements 13 event consumers. Every handler must use payload fields only (no DB read in handler). Cross-reference Ops §2 payload fields consumed table. |
| 3 | **Prose-code contradictions** | S7 has the most decision tree logic of any slice (support triage, billing reconciliation, compliance audit). Author prose and pseudocode together. |
| 4 | **Schema amendment debt** | S7 adds 6 new tables + 2 column amendments. Document cumulative schema snapshot. |
| 5 | **N+1 query patterns** | TaskSpec list view requires joining task_specs → listings for context display. Use batch queries. |
| 6 | **AuthSession property references** | Admin routes use `ctx.session?.accountId` (NOT `ctx.session?.id`). Verify against SI §4.1. Recurring risk per S6-ST-4. |
| 7 | **P4 compliance** | S7 imports `mapPaddleWebhook` and `inferCancellationReason` from CR. `computeFeatureAccess` from CR for admin display. DO NOT re-implement. |
| 8 | **`subscription_ended` reason union** | Billing reconciliation path produces `reason: "paddle_reconciliation"` — decide whether this maps to existing union value or extends it. |
| 9 | **Admin role guard** | All S7 routes require `ctx.session?.role === "admin"` (or `role.startsWith("admin")` per SI §4.1 note). Single middleware. |
| 10 | **Multi-file format** | S7 is domain-logic heavy. Expect 7-9 content sections. Use multi-file directory format (`slices/slice-07-operations/`). |
| 11 | **Consumer-written vs join contradiction risk** | S6-ST-1 class error. Multiple content agents may describe TaskSpec lifecycle differently. Ensure schema foundation decision propagates to all content sections. |
| 12 | **Decision log integration** | S7 implements several autonomous decisions (support triage, billing reconciliation, compliance scheduling). Each must produce a `decision_logs` row per SI §9. |

---

## 11. S7 Scope Summary (for drafter orientation)

**Core deliverables** (from tracker + concept design + upstream flags):

1. **Admin dashboard layout** — authenticated admin-only route (`/admin`), navigation (TaskSpecs, Support, Billing, Compliance, Orchestrated Flows, Failed Events, Health). [Source: PP concept design §8, Ops concept design §7]
2. **TaskSpec queue** — list/filter/sort TaskSpecs by domain/priority/status, detail view with listing context + evidence + checklist, complete/re-route/escalate actions, completion callbacks (S3-6: `applyVerificationUpgrade`). Resolves S3-2, S3-3, S3-6, R6, S2-6. [Source: Ops interface spec §4, Ops concept design §2]
3. **Support triage implementation** — ticket creation from inbound requests, category classification, KB deflection stub, SLA tracking, churn risk priority elevation, active ticket registry (`hasActiveTicket` query). [Source: Ops concept design §4, Ops interface spec §3.1]
4. **Billing reconciliation handler** — daily deferred action, Paddle API reconciliation, anomaly detection (>10% halt), 48-hour hold, `subscription_ended`/`subscription_tier_changed` emission, `getBillingReconciliationStatus` query. Resolves S4-6. [Source: Ops concept design §7, Ops interface spec §5]
5. **Compliance management** — compliance register (DSAR tracking, obligations, audit records), `compliance_schedule_check` handler, compliance self-audit handler, `checkComplianceHold` and `getDSARStatus` queries. [Source: Ops concept design §5, Ops interface spec §3.2–§3.3]
6. **Failed event admin view** — list `event_consumer_errors` grouped by `consumerId`, resolution tracking (`resolved`/`resolvedAt`), retry action. Resolves R3, S0-11. [Source: SI §1.5, R3]
7. **Orchestrated flow admin view** — list/detail view for erasure and closure flows, step progress display, retry/skip/escalate actions, skip constraint enforcement per SI §3.5. Resolves R11, S0-3. [Source: SI §3, SQ-2]
8. **Feature gate friction tracking** — `getFeatureGateFrictionSummary` implementation, admin display of friction ratios per gate. Resolves S4-7. [Source: Ops interface spec §3.4, CR-X-6]
9. **Refund processing admin view** — refund evaluation, Paddle API call, decision logging. Resolves S4-8. [Source: CR concept design §2.6]
10. **Platform health monitoring display** — surface health signals (search index lag, error rates, background job failures, Paddle webhook silence). [Source: Ops concept design §7]
11. **13 event consumer implementations** — all Operations-consumed events per Ops interface spec §2. [Source: Ops interface spec §2]
12. **Pending cancellation registry** — CRUD for pending cancellation records, lookup during Paddle webhook processing. [Source: Ops interface spec §5]
13. **Churn risk registry** — upsert from `churn_risk_detected`, query during support triage, auto-expire stale entries. [Source: Ops concept design §4, CR-X-20]
14. **Win-back email delivery** — `winback_eligible` consumer, email send via Resend, `winback_delivery_result` emission. [Source: Ops interface spec §7]
15. **Decay warning email** — `decay_signal_detected` consumer, duplicate outreach suppression via active ticket check, email send. [Source: Ops concept design §4, S4-ST-9]

**Out of scope for S7:**
- Provider dashboard (S5 — complete)
- Buyer experience (S6 — complete)
- Conversion triggers, churn intervention logic, win-back evaluation logic (S8 — CR domain)
- Sponsored placement selection (S8)
- Quality scoring algorithms, decay detection algorithms (S9 — D&L perception)
- GDPR erasure orchestrator flow implementation (S10 — S7 provides admin view, S10 implements the flow)
- Account closure orchestrator flow implementation (S5 initiates, S10 validates end-to-end)
- Entity intelligence, ceremony automation (S9)

**Stress test consideration:** S7 is the domain-logic heaviest slice. Boundary surfaces include SI (orchestrated flows, deferred actions, event consumer errors), Ops spec (all 5 queries, all 13 consumers), D&L (active ticket check, decay coordination), PP (admin dashboard ownership), CR (feature gate friction, billing attribution). **20+ scenarios recommended** per boundary-checks guidance.
