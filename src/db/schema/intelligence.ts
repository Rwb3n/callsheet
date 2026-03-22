// Intelligence schema — S9 §11 (00-schema.md)
// Owns: enrichment_schedules, decay_signals, perception_aggregates,
//        ceremony_runs, learning_hypotheses, principal_briefings

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { listings } from "./data-and-listings"

// --- S9 pgEnum declarations (00-schema.md §1) ---

export const decaySignalTypeEnum = pgEnum("decay_signal_type", [
  "website_dead",
  "email_bounced",
  "ch_not_active",
  "stale_listing",
  "social_dead",
  "postcode_invalid",
  "domain_expired",
])

export const decaySignalSeverityEnum = pgEnum("decay_signal_severity", [
  "critical",
  "high",
  "medium",
  "low",
])

export const enrichmentCheckTypeEnum = pgEnum("enrichment_check_type", [
  "website",
  "email",
  "ch",
  "social",
  "postcode",
  "imdb",
])

export const ceremonyTypeEnum = pgEnum("ceremony_type", [
  "taxonomy_review",
  "data_health_review",
  "verification_calibration",
  "provider_outreach",
  "conversion_funnel_analysis",
  "revenue_review",
  "multi_listing_pricing",
  "sponsored_placement_learning",
  "operational_health_review",
  "contractor_performance_review",
  "principal_briefing",
  "learning_hypothesis_analysis",
])

// --- S9 §2.1: enrichment_schedules ---
// Per-listing enrichment cadence. One row per listing per check type (6 max).

export const enrichmentSchedules = pgTable(
  "enrichment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    checkType: enrichmentCheckTypeEnum("check_type").notNull(),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull(),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastFullCycleAt: timestamp("last_full_cycle_at", { withTimezone: true }),
    cadenceTier: text("cadence_tier").notNull(), // "paid" | "claimed" | "unclaimed"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("enrichment_schedules_listing_check_unique").on(
      table.listingId,
      table.checkType,
    ),
    index("enrichment_schedules_next_check_idx").on(table.nextCheckAt),
    index("enrichment_schedules_listing_idx").on(table.listingId),
  ],
)

// --- S9 §2.2: decay_signals ---
// Detected decay signals with severity and resolution status.

export const decaySignals = pgTable(
  "decay_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    signalType: decaySignalTypeEnum("signal_type").notNull(),
    severity: decaySignalSeverityEnum("severity").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"), // "auto_healed" | "manually_resolved" | "listing_archived"
    checkDetails: jsonb("check_details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("decay_signals_listing_active_idx").on(table.listingId, table.resolvedAt),
    index("decay_signals_detected_idx").on(table.detectedAt),
    index("decay_signals_severity_active_idx")
      .on(table.severity, table.resolvedAt)
      .where(sql`${table.resolvedAt} IS NULL`),
  ],
)

// --- S9 §2.3: perception_aggregates ---
// Pre-computed engagement aggregates per listing per period.
// Single table with aggregateType discriminator + JSONB data.

export const perceptionAggregates = pgTable(
  "perception_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    aggregateType: text("aggregate_type").notNull(),
    // "search_terms" | "viewer_demographics" | "competitor_benchmarking" | "enquiry_response"
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    sampleSize: integer("sample_size").notNull(),
  },
  (table) => [
    uniqueIndex("perception_aggregates_listing_type_period_unique").on(
      table.listingId,
      table.aggregateType,
      table.periodStart,
    ),
    index("perception_aggregates_listing_type_idx").on(
      table.listingId,
      table.aggregateType,
      table.periodStart,
    ),
    index("perception_aggregates_computed_idx").on(table.computedAt),
  ],
)

// --- S9 §2.4: ceremony_runs ---
// Ceremony execution log with self-perpetuating scheduling.

export const ceremonyRuns = pgTable(
  "ceremony_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ceremonyType: ceremonyTypeEnum("ceremony_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status").notNull(), // "running" | "completed" | "failed"
    inputsHash: text("inputs_hash").notNull(),
    outputs: jsonb("outputs").$type<Record<string, unknown>>(),
    decisionsLogged: integer("decisions_logged").notNull().default(0),
    nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ceremony_runs_type_started_idx").on(table.ceremonyType, table.startedAt),
    index("ceremony_runs_running_idx")
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    index("ceremony_runs_next_scheduled_idx").on(table.nextScheduledAt),
  ],
)

// --- S9 §2.5: learning_hypotheses ---
// 7 static rows (L1-L7) with mutable measurement columns. Seeded via custom-sql.

export const learningHypotheses = pgTable("learning_hypotheses", {
  id: text("id").primaryKey(), // "L1" through "L7"
  hypothesis: text("hypothesis").notNull(),
  measurementQuery: text("measurement_query").notNull(),
  currentValue: numeric("current_value"),
  previousValue: numeric("previous_value"),
  trend: text("trend"), // "improving" | "stable" | "declining" | "insufficient_data"
  lastMeasuredAt: timestamp("last_measured_at", { withTimezone: true }),
  confoundWarning: text("confound_warning"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- S9 §2.6: principal_briefings ---
// Monthly Principal Operations Briefing snapshots.

export type PrincipalBriefing = {
  operationalHealth: Record<string, unknown>
  revenueHealth: Record<string, unknown>
  learningHypotheses: Record<string, unknown>
  ceremonies: Record<string, unknown>
  escalations: { count: number; critical: unknown[] }
}

export const principalBriefings = pgTable(
  "principal_briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    content: jsonb("content").notNull().$type<PrincipalBriefing>(),
    ceremonyRunId: uuid("ceremony_run_id")
      .notNull()
      .references(() => ceremonyRuns.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("principal_briefings_generated_idx").on(table.generatedAt),
    index("principal_briefings_ceremony_idx").on(table.ceremonyRunId),
    index("principal_briefings_unsent_idx")
      .on(table.sentAt)
      .where(sql`${table.sentAt} IS NULL`),
  ],
)
