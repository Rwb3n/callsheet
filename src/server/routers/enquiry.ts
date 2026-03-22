// Enquiry inbox + response + submission router — S5 §5, S6 §3
// Provider-side inbox with cursor pagination, status filtering, and response mutation.
// Buyer-side submission (four-branch routing), listSent, getSent.

import { z } from "zod"
import { and, eq, lt, desc, sql } from "drizzle-orm"
import { router, publicProcedure, protectedProcedure } from "@/server/trpc"
import { TRPCError } from "@trpc/server"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { enquiryRecords } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { routeEnquiry } from "@/domains/platform/buyer/enquiry-routing"

export type EnquiryRouterDeps = {
  db: Db
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
}

export const getInboxInput = z.object({
  listingId: z.string().uuid(),
  status: z.enum(["all", "unread", "responded", "stale"]).default("all"),
  cursor: z.string().uuid().optional(),
  limit: z.number().min(1).max(50).default(20),
})

export const respondToEnquiryInput = z.object({
  enquiryId: z.string().uuid(),
  listingId: z.string().uuid(),
  responseMessage: z.string().min(1).max(5000),
})

// S6 §3.1 — buyer-side enquiry submission
export const enquirySubmitInput = z.object({
  listingId: z.string().uuid(),
  senderName: z.string().min(1).max(100),
  senderEmail: z.string().email().optional(),
  senderCompany: z.string().max(200).optional(),
  projectType: z.enum([
    "feature", "tv_series", "tv_one_off", "short", "commercial",
    "corporate", "music_video", "digital_social", "live_event",
  ]).optional(),
  message: z.string().min(20).max(2000),
  budget: z.enum(["low", "medium", "high", "undisclosed"]).optional(),
  timeline: z.string().max(200).optional(),
  honeypot: z.string().max(0).optional(),
})

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export function createEnquiryRouter(deps: EnquiryRouterDeps) {
  return router({
    // AC-16: cursor-based pagination (20 per page)
    // AC-17: status filter (all, unread, responded, stale)
    getInbox: protectedProcedure
      .input(getInboxInput)
      .query(async ({ ctx, input }) => {
        await verifyListingOwnership(deps.db, input.listingId, ctx.session.accountId)

        const conditions = [eq(enquiryRecords.listingId, input.listingId)]

        if (input.status !== "all") {
          conditions.push(eq(enquiryRecords.status, input.status))
        }

        if (input.cursor) {
          const [cursorRow] = await deps.db
            .select({ sentAt: enquiryRecords.sentAt })
            .from(enquiryRecords)
            .where(eq(enquiryRecords.id, input.cursor))
            .limit(1)
          if (cursorRow) {
            conditions.push(lt(enquiryRecords.sentAt, cursorRow.sentAt))
          }
        }

        const rows = await deps.db
          .select()
          .from(enquiryRecords)
          .where(and(...conditions))
          .orderBy(desc(enquiryRecords.sentAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = hasMore ? rows.slice(0, input.limit) : rows

        return {
          items: items.map(toEnquiryResponse),
          nextCursor: hasMore ? items[items.length - 1].id : null,
        }
      }),

    // AC-18: respond + email + emit enquiry_responded
    // AC-19: BAD_REQUEST on already-responded
    // AC-22: responseTimeMinutes in event payload
    respondToEnquiry: protectedProcedure
      .input(respondToEnquiryInput)
      .mutation(async ({ ctx, input }) => {
        const listing = await verifyListingOwnership(deps.db, input.listingId, ctx.session.accountId)

        const [enquiry] = await deps.db
          .select()
          .from(enquiryRecords)
          .where(and(
            eq(enquiryRecords.id, input.enquiryId),
            eq(enquiryRecords.listingId, input.listingId),
          ))
          .limit(1)

        if (!enquiry) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        // AC-19: already responded
        if (enquiry.status === "responded") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "already responded" })
        }

        const now = new Date()
        // AC-22: compute response time from enquiry creation
        const responseTimeMinutes = Math.round(
          (now.getTime() - enquiry.sentAt.getTime()) / (1000 * 60),
        )

        await deps.db
          .update(enquiryRecords)
          .set({
            status: "responded",
            respondedAt: now,
            responseTimeMinutes,
          })
          .where(eq(enquiryRecords.id, input.enquiryId))

        // AC-18: send response email (skip if senderEmail null after GDPR erasure) [S5-ST-20]
        if (enquiry.senderEmail) {
          await deps.emailService.send({
            to: enquiry.senderEmail,
            template: "enquiry_response",
            data: {
              listingName: listing.name,
              responseMessage: input.responseMessage,
              providerName: listing.name,
            },
            category: "transactional",
            listingId: input.listingId,
          })
        }

        // Cancel pending reminder for this enquiry
        await cancelDeferredAction(deps.schedulerDb, {
          action: "enquiry_response_reminder",
          filterParams: { enquiryId: input.enquiryId },
          cancelledBy: "enquiry.respondToEnquiry",
        })

        // AC-18, AC-22: emit enquiry_responded
        await deps.bus.emit(
          "enquiry_responded",
          {
            _brand: "EnquiryRespondedEvent" as const,
            listingId: input.listingId,
            enquiryId: input.enquiryId,
            responseTimeMinutes,
          },
          deps.waitUntilFn,
        )

        return { success: true }
      }),

    // S6 AC-20 through AC-27: enquiry submission with four-branch routing
    submit: publicProcedure
      .input(enquirySubmitInput)
      .mutation(async ({ ctx, input }) => {
        // AC-25: honeypot check
        if (input.honeypot) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "SPAM_DETECTED" })
        }

        // AC-26: resolve sender identity
        const senderEmail = ctx.session?.email ?? input.senderEmail
        const senderAccountId = ctx.session?.accountId ?? null
        if (!senderEmail) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email required for anonymous enquiries" })
        }

        // AC-25: rate limit — 10/email/hour
        await checkRateLimit(deps.db, senderEmail)

        // AC-27: load listing + validate active
        const [listing] = await deps.db
          .select({ lifecycleStatus: listings.lifecycleStatus })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing || listing.lifecycleStatus !== "active") {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        const result = await routeEnquiry(
          {
            listingId: input.listingId,
            senderName: input.senderName,
            senderCompany: input.senderCompany,
            projectType: input.projectType,
            message: input.message,
            budget: input.budget,
            timeline: input.timeline,
          },
          { senderAccountId, senderEmail },
          deps,
        )

        // Branch C: contact fallback — no enquiry created
        if (result.code === "NO_EMAIL") {
          return result
        }

        return { enquiryId: result.enquiryId }
      }),

    // S6 §2.3: buyer's sent enquiries with response status
    listSent: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ ctx, input }) => {
        const conditions = [eq(enquiryRecords.senderAccountId, ctx.session.accountId)]

        if (input.cursor) {
          const [cursorRow] = await deps.db
            .select({ sentAt: enquiryRecords.sentAt })
            .from(enquiryRecords)
            .where(eq(enquiryRecords.id, input.cursor))
            .limit(1)
          if (cursorRow) {
            conditions.push(lt(enquiryRecords.sentAt, cursorRow.sentAt))
          }
        }

        const rows = await deps.db
          .select({
            enquiryId: enquiryRecords.id,
            listingId: enquiryRecords.listingId,
            listingSlug: listings.slug,
            listingName: listings.name,
            message: enquiryRecords.body,
            status: enquiryRecords.status,
            submittedAt: enquiryRecords.sentAt,
            respondedAt: enquiryRecords.respondedAt,
          })
          .from(enquiryRecords)
          .innerJoin(listings, eq(enquiryRecords.listingId, listings.id))
          .where(and(...conditions))
          .orderBy(desc(enquiryRecords.sentAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = hasMore ? rows.slice(0, input.limit) : rows

        return {
          enquiries: items.map((r) => ({
            enquiryId: r.enquiryId,
            listingSlug: r.listingSlug,
            listingName: r.listingName,
            message: r.message.slice(0, 200),
            status: r.status,
            submittedAt: r.submittedAt.toISOString(),
            respondedAt: r.respondedAt?.toISOString() ?? null,
          })),
          nextCursor: hasMore ? items[items.length - 1].enquiryId : null,
        }
      }),

    // S6 §2.3: single enquiry detail for buyer
    getSent: protectedProcedure
      .input(z.object({ enquiryId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [row] = await deps.db
          .select({
            enquiryId: enquiryRecords.id,
            listingId: enquiryRecords.listingId,
            listingSlug: listings.slug,
            listingName: listings.name,
            senderName: enquiryRecords.subject,
            message: enquiryRecords.body,
            status: enquiryRecords.status,
            submittedAt: enquiryRecords.sentAt,
            respondedAt: enquiryRecords.respondedAt,
          })
          .from(enquiryRecords)
          .innerJoin(listings, eq(enquiryRecords.listingId, listings.id))
          .where(and(
            eq(enquiryRecords.id, input.enquiryId),
            eq(enquiryRecords.senderAccountId, ctx.session.accountId),
          ))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        return {
          enquiryId: row.enquiryId,
          listingId: row.listingId,
          listingSlug: row.listingSlug,
          listingName: row.listingName,
          senderName: row.senderName,
          message: row.message,
          status: row.status,
          submittedAt: row.submittedAt.toISOString(),
          respondedAt: row.respondedAt?.toISOString() ?? null,
        }
      }),
  })
}

// AC-25: rate limit — 10 enquiries per email per hour
async function checkRateLimit(db: Db, senderEmail: string): Promise<void> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(enquiryRecords)
    .where(and(
      eq(enquiryRecords.senderEmail, senderEmail),
      sql`${enquiryRecords.sentAt} > ${windowStart}`,
    ))
  if (result && result.count >= RATE_LIMIT_MAX) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "RATE_LIMIT_EXCEEDED" })
  }
}

async function verifyListingOwnership(db: Db, listingId: string, accountId: string) {
  const [listing] = await db
    .select({ id: listings.id, name: listings.name, accountId: listings.accountId })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)

  if (!listing || listing.accountId !== accountId) {
    throw new TRPCError({ code: "FORBIDDEN" })
  }
  return listing
}

function toEnquiryResponse(row: typeof enquiryRecords.$inferSelect) {
  return {
    id: row.id,
    senderAccountId: row.senderAccountId,
    senderEmail: row.senderEmail,
    listingId: row.listingId,
    subject: row.subject,
    body: row.body,
    status: row.status,
    sentAt: row.sentAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    responseTimeMinutes: row.responseTimeMinutes,
  }
}
