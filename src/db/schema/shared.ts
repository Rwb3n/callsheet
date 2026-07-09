// Shared infrastructure schema — S0 §1.2, SI §1.5, SI §2.1, SI §8

import { pgTable, pgEnum, uuid, text, jsonb, timestamp, integer, boolean, index } from "drizzle-orm/pg-core"

// Deferred action enums [SI §2.1, S0 §3]
export const deferredActionStatusEnum = pgEnum("deferred_action_status", [
  "pending", "executing", "completed", "failed", "exhausted", "cancelled",
])
export const deferredActionRetryEnum = pgEnum("deferred_action_retry", ["once", "retry_3"])
export const deferredActionFailureEnum = pgEnum("deferred_action_failure", ["log", "alert_principal"])

export const deferredActions = pgTable(
  "deferred_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    params: jsonb("params").notNull().$type<Record<string, unknown>>(),
    executeAt: timestamp("execute_at", { withTimezone: true }).notNull(),
    retryPolicy: deferredActionRetryEnum("retry_policy").notNull(),
    onFailure: deferredActionFailureEnum("on_failure").notNull(),
    createdBy: text("created_by").notNull(),
    status: deferredActionStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("deferred_actions_poll_idx").on(table.status, table.executeAt),
  ],
)

// Orchestrated flow enums [SI §3.2, S0 §4]
export const flowStatusEnum = pgEnum("flow_status", [
  "initiated", "in_progress", "completed", "failed", "escalated",
])
export const flowTypeEnum = pgEnum("flow_type", ["erasure", "closure"])

export const orchestratedFlows = pgTable(
  "orchestrated_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowType: flowTypeEnum("flow_type").notNull(),
    triggeredBy: text("triggered_by").notNull(),
    status: flowStatusEnum("status").notNull().default("initiated"),
    steps: jsonb("steps").notNull().$type<Record<string, unknown>[]>(),
    currentStep: integer("current_step").notNull().default(0),
    context: jsonb("context").notNull().$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationReason: text("escalation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("orchestrated_flows_status_idx").on(table.status),
    index("orchestrated_flows_type_status_idx").on(table.flowType, table.status),
  ],
)

// Decision log enums [SI §9, S0 §10]
export const decisionDomainEnum = pgEnum("decision_domain", [
  "data-and-listings", "operations", "platform", "commercial", "cross-domain",
])

export const decisionLogs = pgTable(
  "decision_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: decisionDomainEnum("domain").notNull(),
    decisionType: text("decision_type").notNull(),
    inputs: jsonb("inputs").notNull().$type<Record<string, unknown>>(),
    output: jsonb("output").notNull().$type<Record<string, unknown>>(),
    confidence: integer("confidence"), // 0–100 stored as int; null when not applicable
    listingId: uuid("listing_id"),
    accountId: uuid("account_id"),
    additionalContext: jsonb("additional_context").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("decision_logs_domain_type_idx").on(table.domain, table.decisionType),
    index("decision_logs_created_idx").on(table.createdAt),
  ],
)

// Notifications [SI §8, S5 §6]
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissed: boolean("dismissed").notNull().default(false),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_account_dismissed_idx").on(table.accountId, table.dismissed),
    index("notifications_account_unread_idx").on(table.accountId, table.readAt, table.dismissed),
  ],
)

export const eventConsumerErrors = pgTable(
  "event_consumer_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    consumerDomain: text("consumer_domain").notNull(),
    consumerId: text("consumer_id").notNull(),
    payload: jsonb("payload").notNull(),
    error: text("error").notNull(),
    stack: text("stack"),
    mode: text("mode").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("event_consumer_errors_lookup_idx").on(
      table.eventType,
      table.consumerDomain,
      table.createdAt,
    ),
  ],
)

// API keys for machine-to-machine auth [CS-E2, CH-CS-016]
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(), // first 8 chars for identification
    scopes: jsonb("scopes").notNull().$type<string[]>().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_account_idx").on(table.accountId),
    index("api_keys_key_hash_idx").on(table.keyHash),
  ],
)
