// Correspondence log schema — Communications Phase 1
// Single shared table for all outbound (and future inbound) email correspondence.
// Owned by Platform (EmailService owner). All sub-entities write through the service.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { listings } from "./data-and-listings"

export const correspondenceDirectionEnum = pgEnum("correspondence_direction", [
  "outbound",
  "inbound",
])

export const correspondenceStatusEnum = pgEnum("correspondence_status", [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "received",
  "suppressed",
])

export const correspondenceLog = pgTable(
  "correspondence_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: text("thread_id").notNull(),
    inReplyTo: uuid("in_reply_to"),
    direction: correspondenceDirectionEnum("direction").notNull(),
    status: correspondenceStatusEnum("status").notNull(),
    accountId: text("account_id").references(() => user.id, { onDelete: "set null" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    externalEmail: text("external_email").notNull(),
    templateId: text("template_id"),
    category: text("category"),
    subject: text("subject"),
    providerMessageId: text("provider_message_id"),
    mergeFieldsHash: text("merge_fields_hash"),
    bodyText: text("body_text"),
    attachmentMeta: jsonb("attachment_meta").$type<{ filename: string; mimeType: string; sizeBytes: number }[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("correspondence_log_account_idx").on(table.accountId),
    index("correspondence_log_thread_idx").on(table.threadId),
    index("correspondence_log_listing_idx").on(table.listingId),
    index("correspondence_log_template_idx").on(table.templateId),
    index("correspondence_log_created_idx").on(table.createdAt),
    index("correspondence_log_external_email_idx").on(table.externalEmail),
  ],
)

// Self-referencing FK added via migration (Drizzle doesn't support self-ref in table definition cleanly)

export const suppressedEmails = pgTable(
  "suppressed_emails",
  {
    email: text("email").primaryKey(),
    reason: text("reason").notNull(),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
    correspondenceLogId: uuid("correspondence_log_id").references(() => correspondenceLog.id, { onDelete: "set null" }),
  },
  (table) => [
    index("suppressed_emails_email_idx").on(table.email),
  ],
)
