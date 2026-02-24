// Commercial schema — S4 §1.5, CR interface spec §4
// Owns: grace_periods

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { listings } from "./data-and-listings"

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
