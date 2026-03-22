// Operations schema — S4 §1.3, §1.4, S7 §1–§5, Ops interface spec §3–§5
// Owns: pending_cancellations, processed_paddle_events, support_tickets,
//        task_specs, churn_risk_registry, billing_holds, compliance_register,
//        billing_reconciliation_status

import { pgTable, pgEnum, uuid, text, timestamp, integer, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { listings } from "./data-and-listings"

// --- S7 pgEnum declarations (00-schema.md §1) ---

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

// --- S7 §2.1: support_tickets ---
// Ops active ticket registry. Tracks full lifecycle from triage through resolution.
// FK onDelete: "set null" — tickets are audit records, survive account/listing deletion.

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").references(() => user.id, { onDelete: "set null" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    // "billing_support" | "profile_support" | "claim_dispute" | "feature_gating_confusion"
    // | "account_access" | "data_request" | "refund_request" | "other"
    priority: supportTicketPriorityEnum("priority").notNull(),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    subject: text("subject").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("support_tickets_account_idx").on(table.accountId),
    index("support_tickets_listing_idx").on(table.listingId),
    index("support_tickets_status_priority_idx").on(table.status, table.priority),
    index("support_tickets_category_idx").on(table.category),
  ],
)

// --- S7 §2.2: task_specs ---
// Operations TaskSpec queue. Each row is a unit of work for human procurement.
// R6: only status, rerouteCount, completedAt, result are mutable post-creation.

export type DataAccessScope = {
  tables: string[]
  filter?: string
}

export type LearningCapture = {
  captureFields: string[]
  feedbackLoop?: string
}

export const taskSpecs = pgTable(
  "task_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: taskSpecDomainEnum("domain").notNull(),
    priority: taskSpecPriorityEnum("priority").notNull(),
    status: taskSpecStatusEnum("status").notNull().default("pending"),
    task: text("task").notNull(),
    context: jsonb("context").notNull().$type<Record<string, unknown>>(),
    checklist: jsonb("checklist").notNull().$type<string[]>(),
    acceptanceCriteria: text("acceptance_criteria").notNull(),
    estimatedTime: text("estimated_time").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }),
    timeout: integer("timeout").notNull(), // hours
    escalation: text("escalation").notNull(),
    requiredSkills: jsonb("required_skills").notNull().$type<string[]>(),
    dataAccessScope: jsonb("data_access_scope").notNull().$type<DataAccessScope>(),
    learningCapture: jsonb("learning_capture").notNull().$type<LearningCapture>(),
    rerouteCount: integer("reroute_count").notNull().default(0),
    maxReroutes: integer("max_reroutes").notNull(),
    externalRef: text("external_ref"),
    externalPlatform: text("external_platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: jsonb("result").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("task_specs_domain_status_idx").on(table.domain, table.status),
    index("task_specs_status_priority_idx").on(table.status, table.priority),
  ],
)

// --- S7 §2.3: churn_risk_registry ---
// Queryable index for support triage priority elevation. Entries auto-expire after 90 days.

export const churnRiskRegistry = pgTable(
  "churn_risk_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    riskLevel: text("risk_level").notNull(), // "at_risk" | "high_risk"
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("churn_risk_registry_listing_idx").on(table.listingId),
    index("churn_risk_registry_account_idx").on(table.accountId),
    index("churn_risk_registry_expires_idx").on(table.expiresAt),
  ],
)

// --- S7 §2.5: billing_holds ---
// 48-hour grace period for billing reconciliation anomalies.

export const billingHolds = pgTable(
  "billing_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("billing_holds_listing_idx").on(table.listingId),
    index("billing_holds_expires_idx").on(table.expiresAt),
  ],
)

// --- S7 §2.6: compliance_register ---
// DSAR tracking, compliance obligations, and audit records. FK set null — legal records survive account deletion.

export const complianceRegister = pgTable(
  "compliance_register",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: complianceEntryTypeEnum("type").notNull(),
    accountId: text("account_id").references(() => user.id, { onDelete: "set null" }),
    status: complianceEntryStatusEnum("status").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("compliance_register_type_status_idx").on(table.type, table.status),
    index("compliance_register_account_idx").on(table.accountId),
  ],
)

// --- S7 §2.7: billing_reconciliation_status ---
// Single-row status table for daily billing reconciliation run.

export const billingReconciliationStatus = pgTable("billing_reconciliation_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(), // "healthy" | "anomaly_detected" | "failed"
  activeHolds: integer("active_holds").notNull().default(0),
  lastAnomalyAt: timestamp("last_anomaly_at", { withTimezone: true }),
  lastAnomalyDescription: text("last_anomaly_description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- Pending Cancellations (S4 §1.3) ---
// Stores reason attribution for Paddle webhook handler lookup.
// Ops' pending_cancellation_created consumer writes records.
// PP writes directly for account closure path only [S4-ST-16].

export const pendingCancellations = pgTable(
  "pending_cancellations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paddleSubscriptionId: text("paddle_subscription_id").notNull(),
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(), // CancellationReason
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_cancellations_paddle_sub_idx").on(table.paddleSubscriptionId),
  ],
)

// --- Processed Paddle Events (S4 §1.4) ---
// Idempotency table — deduplicates Paddle webhook deliveries.
// Retention: 30 days, cleaned up inline during webhook processing [S4-ST-5].

export const processedPaddleEvents = pgTable("processed_paddle_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
})
