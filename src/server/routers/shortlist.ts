// Shortlist CRUD + item management — S6 §4, AC-28 through AC-32
// All routes require authentication. Max 10 shortlists per account, 50 items per shortlist.

import { z } from "zod"
import { and, eq, ne, lt, desc, count, max, sql } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import { TRPCError } from "@trpc/server"
import type { Db } from "@/db/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { shortlists, shortlistItems } from "@/db/schema/accounts"
import { listings, verifications } from "@/db/schema/data-and-listings"

const MAX_SHORTLISTS = 10
const MAX_ITEMS_PER_SHORTLIST = 50

export type ShortlistRouterDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export const createShortlistInput = z.object({
  name: z.string().min(1).max(100),
})

export const renameShortlistInput = z.object({
  shortlistId: z.string().uuid(),
  name: z.string().min(1).max(100),
})

export const deleteShortlistInput = z.object({
  shortlistId: z.string().uuid(),
})

export const getItemsInput = z.object({
  shortlistId: z.string().uuid(),
  cursor: z.string().optional(),
})

export const addItemInput = z.object({
  shortlistId: z.string().uuid(),
  listingId: z.string().uuid(),
})

export const removeItemInput = z.object({
  shortlistId: z.string().uuid(),
  listingId: z.string().uuid(),
})

export function createShortlistRouter(deps: ShortlistRouterDeps) {
  return router({
    // AC-28: list all shortlists with active item counts
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await deps.db
        .select({
          id: shortlists.id,
          name: shortlists.name,
          createdAt: shortlists.createdAt,
          itemCount: count(
            sql`CASE WHEN ${shortlistItems.status} = 'active' THEN 1 END`,
          ),
          lastAddedAt: max(
            sql`CASE WHEN ${shortlistItems.status} = 'active' THEN ${shortlistItems.addedAt} END`,
          ),
        })
        .from(shortlists)
        .leftJoin(shortlistItems, eq(shortlistItems.shortlistId, shortlists.id))
        .where(eq(shortlists.accountId, ctx.session.accountId))
        .groupBy(shortlists.id)
        .orderBy(desc(shortlists.createdAt))

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        itemCount: Number(r.itemCount),
        lastAddedAt: r.lastAddedAt ? new Date(r.lastAddedAt as string).toISOString() : null,
      }))
    }),

    // AC-31, AC-32: get items with listing display data via single JOIN
    getItems: protectedProcedure
      .input(getItemsInput)
      .query(async ({ ctx, input }) => {
        await verifyShortlistOwnership(deps.db, input.shortlistId, ctx.session.accountId)

        const conditions = [
          eq(shortlistItems.shortlistId, input.shortlistId),
          ne(shortlistItems.status, "removed"),
        ]

        if (input.cursor) {
          conditions.push(lt(shortlistItems.addedAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select({
            shortlistItemId: shortlistItems.id,
            listingId: shortlistItems.listingId,
            addedAt: shortlistItems.addedAt,
            status: shortlistItems.status,
            slug: listings.slug,
            name: listings.name,
            headline: listings.headline,
            entityType: listings.entityType,
            baseRegion: listings.baseRegion,
            verificationTier: verifications.tier,
            headshotUrl: listings.headshotUrl,
            logoUrl: listings.logoUrl,
          })
          .from(shortlistItems)
          .innerJoin(listings, eq(listings.id, shortlistItems.listingId))
          .leftJoin(verifications, eq(verifications.listingId, listings.id))
          .where(and(...conditions))
          .orderBy(desc(shortlistItems.addedAt))
          .limit(21)

        const hasMore = rows.length > 20
        const items = hasMore ? rows.slice(0, 20) : rows

        return {
          items: items.map((r) => ({
            shortlistItemId: r.shortlistItemId,
            listingId: r.listingId,
            addedAt: r.addedAt.toISOString(),
            status: r.status,
            listing: {
              slug: r.slug,
              name: r.name,
              headline: r.headline,
              entityType: r.entityType,
              baseRegion: r.baseRegion,
              verificationTier: r.verificationTier ?? "unclaimed",
              headshotUrl: r.headshotUrl,
              logoUrl: r.logoUrl,
            },
          })),
          nextCursor: hasMore ? items[items.length - 1].addedAt.toISOString() : null,
        }
      }),

    // AC-28: create shortlist, reject at 10
    create: protectedProcedure
      .input(createShortlistInput)
      .mutation(async ({ ctx, input }) => {
        const [{ value: existing }] = await deps.db
          .select({ value: count() })
          .from(shortlists)
          .where(eq(shortlists.accountId, ctx.session.accountId))

        if (existing >= MAX_SHORTLISTS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Maximum ${MAX_SHORTLISTS} shortlists per account`,
          })
        }

        const [created] = await deps.db
          .insert(shortlists)
          .values({
            accountId: ctx.session.accountId,
            name: input.name,
          })
          .returning()

        return {
          id: created.id,
          name: created.name,
          createdAt: created.createdAt.toISOString(),
        }
      }),

    // Rename shortlist with ownership check
    rename: protectedProcedure
      .input(renameShortlistInput)
      .mutation(async ({ ctx, input }) => {
        await verifyShortlistOwnership(deps.db, input.shortlistId, ctx.session.accountId)

        await deps.db
          .update(shortlists)
          .set({ name: input.name })
          .where(eq(shortlists.id, input.shortlistId))
      }),

    // AC-30: delete cascades items via FK
    delete: protectedProcedure
      .input(deleteShortlistInput)
      .mutation(async ({ ctx, input }) => {
        await verifyShortlistOwnership(deps.db, input.shortlistId, ctx.session.accountId)

        await deps.db
          .delete(shortlists)
          .where(eq(shortlists.id, input.shortlistId))
      }),

    // AC-29: add item, emit shortlist_added, reject duplicate + over-capacity
    addItem: protectedProcedure
      .input(addItemInput)
      .mutation(async ({ ctx, input }) => {
        await verifyShortlistOwnership(deps.db, input.shortlistId, ctx.session.accountId)

        // Capacity check
        const [{ value: activeCount }] = await deps.db
          .select({ value: count() })
          .from(shortlistItems)
          .where(
            and(
              eq(shortlistItems.shortlistId, input.shortlistId),
              eq(shortlistItems.status, "active"),
            ),
          )

        if (activeCount >= MAX_ITEMS_PER_SHORTLIST) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Maximum ${MAX_ITEMS_PER_SHORTLIST} items per shortlist`,
          })
        }

        // Insert — unique constraint catches duplicates
        try {
          await deps.db
            .insert(shortlistItems)
            .values({
              shortlistId: input.shortlistId,
              listingId: input.listingId,
              status: "active",
            })
        } catch (err: unknown) {
          // Drizzle wraps pg errors; check cause chain for 23505 (unique violation)
          if (isUniqueViolation(err)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Listing already in shortlist",
            })
          }
          throw err
        }

        // Emit shortlist_added [PP §1.5 — P1 compliant]
        await deps.bus.emit(
          "shortlist_added",
          {
            _brand: "ShortlistAddedEvent" as const,
            listingId: input.listingId,
            accountId: ctx.session.accountId,
            timestamp: new Date().toISOString(),
          },
          deps.waitUntilFn,
        )
      }),

    // AC-30: soft delete — set status to "removed"
    removeItem: protectedProcedure
      .input(removeItemInput)
      .mutation(async ({ ctx, input }) => {
        await verifyShortlistOwnership(deps.db, input.shortlistId, ctx.session.accountId)

        const result = await deps.db
          .update(shortlistItems)
          .set({ status: "removed" })
          .where(
            and(
              eq(shortlistItems.shortlistId, input.shortlistId),
              eq(shortlistItems.listingId, input.listingId),
              eq(shortlistItems.status, "active"),
            ),
          )
          .returning()

        if (result.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }
      }),
  })
}

function isUniqueViolation(err: unknown): boolean {
  // Postgres unique_violation is code 23505. Drizzle may wrap it in cause chain.
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>
    if (record.code === "23505") return true
    if (typeof record.message === "string" && record.message.includes("duplicate key")) return true
    if (record.cause) return isUniqueViolation(record.cause)
  }
  return false
}

async function verifyShortlistOwnership(db: Db, shortlistId: string, accountId: string) {
  const [shortlist] = await db
    .select({ id: shortlists.id, accountId: shortlists.accountId })
    .from(shortlists)
    .where(eq(shortlists.id, shortlistId))
    .limit(1)

  if (!shortlist || shortlist.accountId !== accountId) {
    throw new TRPCError({ code: "NOT_FOUND" })
  }
  return shortlist
}
