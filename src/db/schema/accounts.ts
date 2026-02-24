// Account extensions schema — S1 §2
// CALLSHEET-specific account data beyond Better Auth's user table.
// accountId = Better Auth user.id (text, not uuid)

import {
  pgTable,
  uuid,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { listings } from "./data-and-listings"
import { shortlistItemStatusEnum } from "./data-and-listings"

// --- Email Preferences Type ---

export type EmailPreferences = {
  enquiry_notification: boolean
  listing_status: boolean
  profile_nudge: boolean
  conversion_marketing: boolean
}

// --- Account Profiles (§2.1) ---

export const accountProfiles = pgTable("account_profiles", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  emailPreferences: jsonb("email_preferences")
    .notNull()
    .$type<EmailPreferences>()
    .default({
      enquiry_notification: true,
      listing_status: true,
      profile_nudge: true,
      conversion_marketing: true,
    }),
  // S2 §2.2 — personalisation step "What do you do?" multi-select, max 10
  departments: text("departments").array().default([]),
  // Paddle customer ID — created on first checkout, reused for all listings [S4 §1.2]
  paddleCustomerId: text("paddle_customer_id"),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
  suppressionReason: text("suppression_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- Shortlists (§2.2) ---

export const shortlists = pgTable(
  "shortlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("My Shortlist"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shortlists_account_idx").on(table.accountId),
  ],
)

export const shortlistItems = pgTable(
  "shortlist_items",
  {
    id: serial("id").primaryKey(),
    shortlistId: uuid("shortlist_id")
      .notNull()
      .references(() => shortlists.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    status: shortlistItemStatusEnum("status").notNull().default("active"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shortlist_items_shortlist_listing_idx")
      .on(table.shortlistId, table.listingId),
    index("shortlist_items_listing_idx").on(table.listingId),
  ],
)

// --- Saved Searches (§2.2) ---

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query"),
    filters: jsonb("filters").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("saved_searches_account_idx").on(table.accountId),
  ],
)

// --- Enquiry Records (§2.2) ---

export const enquiryRecords = pgTable(
  "enquiry_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderAccountId: text("sender_account_id")
      .references(() => user.id, { onDelete: "set null" }),
    senderEmail: text("sender_email"),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    subject: text("subject"),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseTimeMinutes: integer("response_time_minutes"),
  },
  (table) => [
    index("enquiry_records_sender_idx")
      .on(table.senderAccountId)
      .where(sql`${table.senderAccountId} IS NOT NULL`),
    index("enquiry_records_listing_sent_idx")
      .on(table.listingId, table.sentAt),
    // For retroactive linking of anonymous enquiries [S1-ST-20]
    index("enquiry_records_anon_email_idx")
      .on(table.senderEmail)
      .where(sql`${table.senderEmail} IS NOT NULL AND ${table.senderAccountId} IS NULL`),
  ],
)
