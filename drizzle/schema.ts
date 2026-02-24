import { pgTable, index, uuid, text, jsonb, timestamp, integer, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const decisionDomain = pgEnum("decision_domain", ['data-and-listings', 'operations', 'platform', 'commercial'])
export const deferredActionFailure = pgEnum("deferred_action_failure", ['log', 'alert_principal'])
export const deferredActionRetry = pgEnum("deferred_action_retry", ['once', 'retry_3'])
export const deferredActionStatus = pgEnum("deferred_action_status", ['pending', 'executing', 'completed', 'failed', 'exhausted', 'cancelled'])
export const flowStatus = pgEnum("flow_status", ['initiated', 'in_progress', 'completed', 'failed', 'escalated'])
export const flowType = pgEnum("flow_type", ['erasure', 'closure'])


export const deferredActions = pgTable("deferred_actions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	action: text().notNull(),
	params: jsonb().notNull(),
	executeAt: timestamp("execute_at", { withTimezone: true, mode: 'string' }).notNull(),
	retryPolicy: deferredActionRetry("retry_policy").notNull(),
	onFailure: deferredActionFailure("on_failure").notNull(),
	createdBy: text("created_by").notNull(),
	status: deferredActionStatus().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text("last_error"),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	cancelledBy: text("cancelled_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("deferred_actions_poll_idx").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.executeAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const orchestratedFlows = pgTable("orchestrated_flows", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	flowType: flowType("flow_type").notNull(),
	triggeredBy: uuid("triggered_by").notNull(),
	status: flowStatus().default('initiated').notNull(),
	steps: jsonb().notNull(),
	currentStep: integer("current_step").default(0).notNull(),
	context: jsonb().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	deadline: timestamp({ withTimezone: true, mode: 'string' }),
	escalatedAt: timestamp("escalated_at", { withTimezone: true, mode: 'string' }),
	escalationReason: text("escalation_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("orchestrated_flows_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("orchestrated_flows_type_status_idx").using("btree", table.flowType.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
]);

export const decisionLogs = pgTable("decision_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	domain: decisionDomain().notNull(),
	decisionType: text("decision_type").notNull(),
	inputs: jsonb().notNull(),
	output: jsonb().notNull(),
	confidence: integer(),
	listingId: uuid("listing_id"),
	accountId: uuid("account_id"),
	additionalContext: jsonb("additional_context"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("decision_logs_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("decision_logs_domain_type_idx").using("btree", table.domain.asc().nullsLast().op("text_ops"), table.decisionType.asc().nullsLast().op("text_ops")),
]);

export const eventConsumerErrors = pgTable("event_consumer_errors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventType: text("event_type").notNull(),
	consumerDomain: text("consumer_domain").notNull(),
	consumerId: text("consumer_id").notNull(),
	payload: jsonb().notNull(),
	error: text().notNull(),
	stack: text(),
	mode: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("event_consumer_errors_lookup_idx").using("btree", table.eventType.asc().nullsLast().op("timestamptz_ops"), table.consumerDomain.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
]);
