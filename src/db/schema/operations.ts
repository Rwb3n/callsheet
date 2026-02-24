// Operations schema — S4 §1.3, §1.4, Ops interface spec §5
// Owns: pending_cancellations, processed_paddle_events

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { listings } from "./data-and-listings"

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
