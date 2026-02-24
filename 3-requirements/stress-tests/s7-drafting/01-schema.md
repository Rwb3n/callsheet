# S7 Schema Additions

**Status:** Phase 1 output
**Generated:** 2026-02-14
**Slice:** S7 (Operations)
**Inputs:** `s7-pre-draft-checklist.md` §6, `01-decisions.md` (D1, D3, D6, D7), `slice-01-data-model.md` §1, `slice-04-subscriptions.md` §1.3

---

S7 adds 7 new tables, amends 2 existing tables, and declares 7 pgEnum types. This is the heaviest schema slice since S1. All tables live in `src/db/schema/operations.ts` except `billing_reconciliation_status` which also lives in `operations.ts` (Operations owns billing reconciliation).

## 1. pgEnum Declarations

```typescript
// src/db/schema/operations.ts

export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", [
  "critical", "high", "normal", "low",
])

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open", "assigned", "resolved", "closed",
])

export const taskSpecDomainEnum = pgEnum("task_spec_domain", [
  "verification", "support", "moderation", "compliance", "data_maintenance", "outreach",
])

export const taskSpecPriorityEnum = pgEnum("task_spec_priority", [
  "critical", "high", "normal", "low",
])

export const taskSpecStatusEnum = pgEnum("task_spec_status", [
  "pending", "assigned", "in_progress", "completed", "timed_out", "re_routed",
])

export const complianceEntryTypeEnum = pgEnum("compliance_entry_type", [
  "dsar", "erasure", "article_14", "complaint", "investigation", "obligation",
])

export const complianceEntryStatusEnum = pgEnum("compliance_entry_status", [
  "open", "in_progress", "completed", "overdue",
])
```

No enum for `billing_reconciliation_status.status` — the field uses `text` with a comment documenting the union (`"healthy" | "anomaly_detected" | "failed"`). At V1 scale (~1 reconciliation run/day), a pgEnum adds migration friction for a single-row table with three values. If the status set expands beyond 5 values, promote to enum.

---

## 2. New Tables

### 2.1 support_tickets

Ops active ticket registry. Tracks the full support ticket lifecycle from triage through resolution. `slaDeadline` is nullable — not all ticket categories carry SLA deadlines (D1: `sla_breach_warning` deferred action schedules at 80% of SLA duration, cancelled on resolution). [Source: Ops concept design §4, Ops interface spec §3.1]

```typescript
export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  category: text("category").notNull(),
    // Triage-assigned: "billing_support" | "profile_support" | "claim_dispute" |
    // "feature_gating_confusion" | "account_access" | "data_request" | "other"
  priority: supportTicketPriorityEnum("priority").notNull(),
  status: supportTicketStatusEnum("status").notNull().default("open"),
  subject: text("subject").notNull(),
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id) — ticket lookup by account
// Index: (listing_id) — hasActiveTicket query (Ops §3.1)
// Index: (status, priority) — admin queue ordering
// Partial index: (sla_deadline) WHERE status IN ('open', 'assigned') — SLA breach dashboard query
// Index: (category) WHERE category = 'feature_gating_confusion' — friction tracking (S4-7)
```

**FK semantics:** `onDelete: "set null"` on both `accountId` and `listingId`. Tickets survive account closure and listing archival — they are audit records. The account/listing reference becomes null, but the ticket and its metadata persist for compliance and operational review.

**D1 integration:** When a ticket is created with a non-null `slaDeadline`, the handler schedules a `sla_breach_warning` deferred action at `slaDeadline - (0.2 * slaDuration)` (i.e., 80% elapsed). On ticket resolution (`status` transitions to `"resolved"` or `"closed"`), the deferred action is cancelled. [Source: 01-decisions.md D1]

### 2.2 task_specs

Operations TaskSpec queue. Each row is a unit of work for human procurement — verification reviews, dispute resolution, data cleaning, outreach. [Source: Ops interface spec §4, Ops concept design §2]

```typescript
export const taskSpecs = pgTable("task_specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: taskSpecDomainEnum("domain").notNull(),
  priority: taskSpecPriorityEnum("priority").notNull(),
  status: taskSpecStatusEnum("status").notNull().default("pending"),
  task: text("task").notNull(),
  context: jsonb("context").notNull(),
    // Snapshot at creation — immutable (R6). Contains listing data, evidence,
    // confidence scores, or whatever the creating domain provides.
  checklist: jsonb("checklist").notNull().$type<string[]>(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  estimatedTime: text("estimated_time").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  timeout: integer("timeout").notNull(),  // hours — per-domain default (8h–7d, Ops §2)
  escalation: text("escalation").notNull(),
  requiredSkills: jsonb("required_skills").notNull().$type<string[]>(),
  dataAccessScope: jsonb("data_access_scope").notNull().$type<DataAccessScope>(),
  learningCapture: jsonb("learning_capture").notNull().$type<LearningCapture>(),
  rerouteCount: integer("reroute_count").notNull().default(0),
  maxReroutes: integer("max_reroutes").notNull(),
  externalRef: text("external_ref"),       // external platform reference ID (D5a)
  externalPlatform: text("external_platform"), // "upwork" | "peopleperhour" | etc. (D5a)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  result: jsonb("result"),  // outcome captured on completion
})
// Index: (domain, status) — admin queue filtered by domain
// Index: (status, priority) — admin queue sorted by priority within status
// Partial index: (deadline) WHERE status IN ('pending', 'assigned', 'in_progress') — timeout check
```

**R6 immutability constraint:** Only 4 columns are mutable post-creation: `status`, `rerouteCount`, `completedAt`, `result`. All other columns are write-once. This is enforced at the application layer (tRPC mutation restricts update fields), not via database trigger. The `context` snapshot captures all relevant data at task creation time so the task remains self-contained even if the source entity changes.

**D5a integration:** `externalRef` and `externalPlatform` support external contractor routing. The specific marketplace is a deployment-time decision — S7 specifies the interface contract (webhook callback URL for completion, status polling endpoint), not the vendor. [Source: 01-decisions.md D5a]

### 2.3 churn_risk_registry

Queryable index for support triage priority elevation. Upserted from `churn_risk_detected` events (CR). Entries auto-expire after 90 days. [Source: Ops concept design §4, CR-X-20]

```typescript
export const churnRiskRegistry = pgTable("churn_risk_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  riskLevel: text("risk_level").notNull(),  // "at_risk" | "high_risk"
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),  // detectedAt + 90 days
})
// Index: (account_id) — lookup during support triage priority elevation
// Index: (expires_at) — cleanup query for expired entries
// Unique: (listing_id) — one active risk record per listing; upsert on new detection
```

**FK semantics:** `onDelete: "cascade"` on both references. Churn risk records are operational signals, not audit records. When the listing or account is deleted, the risk record has no value.

### 2.4 pending_cancellations

Paddle webhook attribution registry. Operations stores a pending cancellation record when a cancellation is initiated (voluntary, archival, closure); the Paddle webhook handler looks up this record to attribute the `subscription_ended` event reason. [Source: Ops interface spec §5, CR-X-4]

```typescript
export const pendingCancellations = pgTable("pending_cancellations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paddleSubscriptionId: text("paddle_subscription_id").notNull(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
    // CancellationReason: "voluntary" | "payment_failure" | "paddle_reconciliation" |
    // "account_closed" | "listing_archived"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (paddle_subscription_id) — primary lookup path for webhook handler
// Retention: cleaned up 24h after creation via inline check in webhook handler
```

**S4 alignment note:** This table was first specified in S4 §1.3. S7 is the authoritative definition. S4's definition is identical in structure. The `reason` union includes all 5 values from S4 (`"voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"`). The checklist §6.1 listed only 3 values (`"account_closed" | "listing_archived" | "voluntary"`) — the full set from S4 is correct because `"payment_failure"` covers grace period expiry and `"paddle_reconciliation"` covers the billing reconciliation discovery path (D3).

**Ownership exception [S4-ST-16]:** Operations owns this table. For CR-emitted and D&L-emitted `pending_cancellation_created`, Ops' async consumer writes the record. For the account closure path, PP writes directly — the closure orchestrated flow requires the record to exist before calling `PaymentService.cancelSubscription` (Paddle may webhook immediately). PP's direct write is scoped to closure only.

**No unique constraint on `paddle_subscription_id`:** The checklist §6.1 shows `.unique()` on this column. S4's authoritative definition does not include a unique constraint — only an index. A subscription can have multiple pending cancellation records if a prior record was not cleaned up within 24h (edge case: cleanup missed + re-cancellation). The index without unique constraint is correct. S4's definition governs.

### 2.5 billing_holds

48-hour grace period for billing reconciliation anomalies. Created when daily reconciliation detects a Paddle/local mismatch that requires investigation before subscription state changes proceed. [Source: Ops concept design §7, Ops interface spec §5]

```typescript
export const billingHolds = pgTable("billing_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason"),  // human-readable description of the anomaly
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),  // createdAt + 48h
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id) — lookup during subscription state change guard
// Index: (expires_at) — billing_hold_expiry deferred action cleanup
```

**D7 separation:** Billing holds are standalone — `checkComplianceHold` does NOT query this table. Billing holds block subscription state changes during reconciliation investigation. Compliance holds block account closure steps for legal obligations. Different lifecycles, different consumers, separate queries. Billing hold status is checked inline during the billing reconciliation handler and surfaced via `getBillingReconciliationStatus().activeHolds`. [Source: 01-decisions.md D7]

### 2.6 compliance_register

DSAR tracking, compliance obligations, and audit records. Serves three purposes: (1) DSAR case management with statutory deadlines, (2) compliance obligation calendar for `compliance_schedule_check`, (3) audit trail for completed compliance actions. [Source: Ops concept design §5, Ops interface spec §3.2–§3.3]

```typescript
export const complianceRegister = pgTable("compliance_register", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: complianceEntryTypeEnum("type").notNull(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  status: complianceEntryStatusEnum("status").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  details: jsonb("details"),
    // Type-specific structured data. Examples:
    // dsar:        { requestMethod: string; dataSubjectEmail: string; scopeNotes?: string }
    // obligation:  { regulationRef: string; description: string; frequency?: string }
    // complaint:   { source: string; listingId?: UUID; summary: string }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (type, status) — admin dashboard filtered views
// Index: (account_id) — checkComplianceHold query (Ops §3.2)
// Partial index: (deadline) WHERE status IN ('open', 'in_progress') — compliance deadline monitoring
```

**FK semantics:** `onDelete: "set null"` on `accountId`. Compliance records (especially DSARs and complaints) must survive account deletion — they are legal audit records. The account reference becomes null, but the compliance entry persists.

**`checkComplianceHold` query path:** `SELECT` from `compliance_register` WHERE `accountId = ?` AND `type IN ('dsar', 'complaint', 'investigation')` AND `status = 'open'`. Returns `ComplianceHoldResult` (boolean hold + array of blocking entries). <100ms p95. [Source: Ops interface spec §3.2]

### 2.7 billing_reconciliation_status

Single-row status table for the daily billing reconciliation run. Upserted on each run completion. Serves `getBillingReconciliationStatus()` query — a simple `SELECT` returning current reconciliation health. [Source: 01-decisions.md D6]

```typescript
export const billingReconciliationStatus = pgTable("billing_reconciliation_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),  // "healthy" | "anomaly_detected" | "failed"
  activeHolds: integer("active_holds").notNull().default(0),
  lastAnomalyAt: timestamp("last_anomaly_at", { withTimezone: true }),
  lastAnomalyDescription: text("last_anomaly_description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// No indexes needed — single-row table, always accessed by full scan (1 row)
```

**D6 rationale:** Run history (`billing_reconciliation_runs`) deferred to S9 (Entity Intelligence) if trend analysis becomes valuable. V1 admin needs only current status, last run time, and active hold count — all served by one row, upserted on each daily reconciliation.

---

## 3. Existing Table Amendments

### 3.1 orchestrated_flows — add updatedAt

Resolves S0-3 downstream flag. Admin "last activity" queries need a single column rather than deriving from step timestamps in the JSONB `steps` array.

```typescript
// Migration: add updatedAt to orchestrated_flows (S0 §4)
updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
```

Updated on each step completion within `executeOrchestratedFlow()`. Not `.notNull()` — existing rows from before the migration will have `null` until their next step executes. Application code treats `null` as "no activity since migration".

### 3.2 event_consumer_errors — add resolved and resolvedAt

Resolves S0-11 downstream flag. Admin failed event view needs resolution tracking — mark errors as resolved after investigation or retry.

```typescript
// Migration: add resolution columns to event_consumer_errors (S0 §4)
resolved: boolean("resolved").notNull().default(false),
resolvedAt: timestamp("resolved_at", { withTimezone: true }),
```

**Index addition:**

```
// Add to existing event_consumer_errors indexes:
// Partial index: (created_at DESC) WHERE resolved = false — admin view shows unresolved errors
```

---

## 4. Sibling Spec Change (D3)

`SubscriptionEndedEvent.reason` union in Ops §1.2 is extended with `"paddle_reconciliation"`. The full union becomes:

```typescript
reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"
```

This is a sibling spec change (Ops interface spec), not a schema change. Documented here for downstream awareness. All 4 consumers of `subscription_ended` (PP x2, CR x2) handle the new value without code changes — CR's churn log benefits from the distinction for reconciliation-driven churn analysis. [Source: 01-decisions.md D3]

---

## 5. Schema Summary

| # | Table | Owner | Rows at V1 Scale | Purpose |
|---|-------|-------|-------------------|---------|
| 1 | `support_tickets` | Operations | ~50/month | Support ticket lifecycle |
| 2 | `task_specs` | Operations | ~30/month | Human procurement queue |
| 3 | `churn_risk_registry` | Operations | ~20 active | Churn risk tracking for triage |
| 4 | `pending_cancellations` | Operations | ~5/month (transient) | Paddle webhook attribution |
| 5 | `billing_holds` | Operations | ~2/month (transient) | 48h reconciliation grace period |
| 6 | `compliance_register` | Operations | ~10/month | DSAR, obligations, audit |
| 7 | `billing_reconciliation_status` | Operations | 1 (single-row) | Daily reconciliation health |

**Amended tables:** `orchestrated_flows` (+`updatedAt`), `event_consumer_errors` (+`resolved`, +`resolvedAt`).

**Total new pgEnums:** 7 (2 for support tickets, 3 for task specs, 2 for compliance register).

**Cumulative schema after S7:** S0 (8 tables) + S1 (14 tables) + S4 (3 tables + 2 column additions) + S5 (0 new tables, column additions) + S6 (3 tables) + S7 (7 tables + 2 column additions) = **35 tables**.
