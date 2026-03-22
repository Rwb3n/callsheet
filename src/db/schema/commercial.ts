// Commercial schema — S4 §1.5, S8 §2, CR interface spec §4
// Owns: grace_periods, commercial_state, churn_analysis_log, sponsored_impressions

import { pgTable, uuid, text, integer, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { listings, taxonomyServiceAreas } from "./data-and-listings"

// --- Grace Periods (S4 §1.5) ---
// Tracks 14-day grace window after payment failure or voluntary cancellation.

export const gracePeriods = pgTable(
  "grace_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    paddleSubscriptionId: text("paddle_subscription_id").notNull(),
    previousTier: text("previous_tier").notNull(), // SubscriptionTier at failure time
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"), // "payment_recovered" | "downgraded" | "cancelled_by_refund"
  },
  (table) => [
    index("grace_periods_listing_idx").on(table.listingId),
    index("grace_periods_expires_active_idx")
      .on(table.expiresAt)
      .where(sql`${table.resolvedAt} IS NULL`),
  ],
)

// --- Commercial State (S8 §2.1, CR concept design §5.3, §7.2) ---
// Per-listing commercial state. Lazy: row inserted on first commercial event.

export const commercialState = pgTable("commercial_state", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),

  // Conversion trigger tracking (CR §5.3)
  lastViewMilestoneFired: integer("last_view_milestone_fired"),
  firstEnquiryTriggerFired: boolean("first_enquiry_trigger_fired").notNull().default(false),
  competitorUpgradedFired: integer("competitor_upgraded_fired").notNull().default(0),
  lastCompetitorUpgradedAt: timestamp("last_competitor_upgraded_at", { withTimezone: true }),
  analyticsTeaseFired: integer("analytics_tease_fired").notNull().default(0),
  lastAnalyticsTeaseAt: timestamp("last_analytics_tease_at", { withTimezone: true }),
  socialProofFired: integer("social_proof_fired").notNull().default(0),
  lastSocialProofAt: timestamp("last_social_proof_at", { withTimezone: true }),
  engagementSummaryFired: integer("engagement_summary_fired").notNull().default(0),
  lastEngagementSummaryAt: timestamp("last_engagement_summary_at", { withTimezone: true }),
  endowmentCtaShown: boolean("endowment_cta_shown").notNull().default(false),

  // Churn analysis (CR §7.2)
  lastChurnEventAt: timestamp("last_churn_event_at", { withTimezone: true }),
  lastChurnReason: text("last_churn_reason"),

  // Revenue tracking
  // Captures actual price paid including launch discounts (AC-62)
  effectivePriceAtSubscription: integer("effective_price_at_subscription"),

  // S9 §5.5 revenue health extended fields (populated by revenue_health_extended ceremony)
  revenueHealthExtended: jsonb("revenue_health_extended").$type<RevenueHealthExtended>(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// S9 §5.5.1 — 8 extension fields computed monthly by revenue_health_extended handler
export type RevenueHealthExtended = {
  churnByTier: Record<string, number>
  annualRenewalRate: number
  ltv: number
  cac: number
  discountCohortDivergence: number
  downgradeToPaidChurnRatio: number
  averageSubscriptionLifetimeDays: number
  secondaryListingChurnRate: number
}

// --- Churn Analysis Log (S8 §2.2, CR concept design §7.2) ---
// Append-only event log for churn, conversion, and revenue perception signals.

export const churnAnalysisLog = pgTable(
  "churn_analysis_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // Soft reference — no FK. Survives account deletion for GDPR erasure flow.
    accountId: uuid("account_id"),
    accountHash: text("account_hash"),
    eventType: text("event_type").notNull(),
    reason: text("reason"),
    subscriptionTier: text("subscription_tier"),
    annualRevenue: integer("annual_revenue"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("churn_log_listing_created_idx").on(table.listingId, table.createdAt),
    index("churn_log_event_type_created_idx").on(table.eventType, table.createdAt),
    index("churn_log_account_id_idx")
      .on(table.accountId)
      .where(sql`${table.accountId} IS NOT NULL`),
  ],
)

// --- Sponsored Impressions (S8 §2.3, CR concept design §4.4) ---
// Per-impression record for sponsored placement fairness monitoring.

export const sponsoredImpressions = pgTable(
  "sponsored_impressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // FK to taxonomy_service_areas — no onDelete cascade (reference data, never deleted)
    serviceAreaId: integer("service_area_id")
      .notNull()
      .references(() => taxonomyServiceAreas.id),
    impressionDate: timestamp("impression_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sponsored_impressions_listing_date_idx").on(table.listingId, table.impressionDate),
    index("sponsored_impressions_area_date_idx").on(table.serviceAreaId, table.impressionDate),
  ],
)
