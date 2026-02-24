// Listing CRUD routes — S1 §4.2, AC-16 through AC-20
// Platform emits listing events from route handlers after D&L domain logic completes [S1-ST-1]

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, sql, desc, asc } from "drizzle-orm"
import { router, publicProcedure, protectedProcedure, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
  listingTaxonomyTags,
  credits,
  mediaItems,
  socialProfiles,
  accreditations,
} from "@/db/schema/data-and-listings"
import { runIntegrityChecks } from "@/domains/data-and-listings/integrity"
import { executeSearch } from "@/lib/search"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { CompaniesHouseService } from "@/lib/services/types"

// --- Zod schemas (exported for tests) ---

const taxonomyTagSchema = z.object({
  sectorId: z.number().int(),
  serviceAreaId: z.number().int(),
  specialisationId: z.number().int().nullable().optional(),
})

export const listingCreateInput = z.object({
  entityType: z.enum(["freelancer", "company", "education", "industry_body", "public_sector", "non_profit"]),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  companiesHouseNumber: z.string().nullable().optional(),
  headline: z.string().max(200).optional(),
  bio: z.string().max(5000).optional(),
  baseRegion: z.string().optional(),
  tags: z.array(taxonomyTagSchema).optional(),
})

export const listingUpdateInput = z.object({
  listingId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  headline: z.string().max(200).optional(),
  bio: z.string().max(5000).optional(),
  baseRegion: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  websiteUrl: z.string().url().optional(),
})

const searchFiltersSchema = z.object({
  sectorId: z.number().int().optional(),
  serviceAreaId: z.number().int().optional(),
  specialisationId: z.number().int().optional(),
  entityType: z.array(z.string()).optional(),
  subscriptionTier: z.array(z.string()).optional(),
}).optional()

export const searchInput = z.object({
  query: z.string().optional(),
  filters: searchFiltersSchema,
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
})

export type ListingRouterDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  companiesHouse: CompaniesHouseService
}

export function createListingRouter(deps: ListingRouterDeps) {
  return router({
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const db = deps.db
        const [listing] = await db
          .select()
          .from(listings)
          .where(and(eq(listings.slug, input.slug), eq(listings.lifecycleStatus, "active")))
          .limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })

        const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
        const [quality] = await db.select().from(qualityScores).where(eq(qualityScores.listingId, listing.id))
        const tags = await db.select().from(listingTaxonomyTags).where(eq(listingTaxonomyTags.listingId, listing.id))
        const listingCredits = await db.select().from(credits).where(eq(credits.listingId, listing.id)).orderBy(desc(credits.year))
        const media = await db.select().from(mediaItems).where(eq(mediaItems.listingId, listing.id)).orderBy(asc(mediaItems.sortOrder))
        const socials = await db.select().from(socialProfiles).where(eq(socialProfiles.listingId, listing.id))
        const accs = await db.select().from(accreditations).where(eq(accreditations.listingId, listing.id))

        return { listing, verification, qualityScore: quality, tags, credits: listingCredits, media, socialProfiles: socials, accreditations: accs }
      }),

    search: publicProcedure
      .input(searchInput)
      .query(async ({ input }) => {
        const result = await executeSearch(deps.db, {
          query: input.query,
          filters: input.filters ?? {},
          page: input.page,
          limit: input.limit,
        })

        // Emit search_performed (async, fire-and-forget)
        deps.bus.emit(
          "search_performed",
          {
            _brand: "SearchPerformedEvent" as const,
            query: input.query ?? "",
            filters: (input.filters ?? {}) as Record<string, unknown>,
            resultCount: result.total,
          },
          deps.waitUntilFn,
        )

        return result
      }),

    create: protectedProcedure
      .input(listingCreateInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const accountId = ctx.session.accountId

        // AC-16: integrity checks before creation
        const integrityResult = await runIntegrityChecks(
          {
            accountId,
            accountHolderName: ctx.session.email,
            companiesHouseNumber: input.companiesHouseNumber ?? null,
            tags: input.tags ?? [],
          },
          db,
          deps.companiesHouse,
        )
        if (integrityResult.action !== "allow") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Listing flagged: ${integrityResult.reasons.join(", ")}`,
            cause: integrityResult,
          })
        }

        // Create listing + 1:1 companion rows in a transaction
        const result = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(listings)
            .values({
              accountId,
              entityType: input.entityType,
              name: input.name,
              slug: input.slug,
              companiesHouseNumber: input.companiesHouseNumber ?? null,
              headline: input.headline,
              bio: input.bio,
              baseRegion: input.baseRegion,
            })
            .returning()

          // Zero-init companion tables
          await tx.insert(verifications).values({ listingId: created.id })
          await tx.insert(qualityScores).values({ listingId: created.id })
          await tx.insert(qualityScoreExplanations).values({
            listingId: created.id,
            explanation: { dimensions: {}, suggestions: [] },
          })
          await tx.insert(engagements).values({ listingId: created.id })

          // Insert taxonomy tags if provided
          if (input.tags && input.tags.length > 0) {
            await tx.insert(listingTaxonomyTags).values(
              input.tags.map((t) => ({
                listingId: created.id,
                sectorId: t.sectorId,
                serviceAreaId: t.serviceAreaId,
                specialisationId: t.specialisationId ?? null,
              })),
            )
          }

          return created
        })

        // Emit listing_created — Platform owns this event [S1-ST-1]
        await deps.bus.emit(
          "listing_created",
          {
            _brand: "ListingCreatedEvent" as const,
            listingId: result.id,
            accountId,
            entityType: input.entityType,
            slug: input.slug,
          },
          deps.waitUntilFn,
        )

        return result
      }),

    update: protectedProcedure
      .input(listingUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const { listingId, ...fields } = input

        // AC-17: ownership check
        const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
        }

        const changedFields = Object.keys(fields).filter(
          (k) => fields[k as keyof typeof fields] !== undefined,
        )
        if (changedFields.length === 0) return listing

        const [updated] = await db
          .update(listings)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(listings.id, listingId))
          .returning()

        // AC-18: emit profile_edited
        await deps.bus.emit(
          "profile_edited",
          {
            _brand: "ProfileEditedEvent" as const,
            listingId,
            accountId: ctx.session.accountId,
            changedFields,
          },
          deps.waitUntilFn,
        )

        return updated
      }),

    archive: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const [listing] = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
        }
        // Cannot archive already-archived [S1-ST-2, S1-ST-19]
        if (listing.lifecycleStatus === "archived") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Listing already archived" })
        }

        // AC-19: set archived + emit
        const [updated] = await db
          .update(listings)
          .set({ lifecycleStatus: "archived", updatedAt: new Date() })
          .where(eq(listings.id, input.listingId))
          .returning()

        await deps.bus.emit(
          "listing_archived",
          {
            _brand: "ListingArchivedEvent" as const,
            listingId: input.listingId,
            accountId: ctx.session.accountId,
            entityType: listing.entityType,
            slug: listing.slug,
          },
          deps.waitUntilFn,
        )

        // S4 §7.1: paid listing archival → emit pending_cancellation_created [AC-31, AC-32]
        // D&L does NOT emit subscription_ended directly — Ops emits after Paddle webhook [S4-ST-7]
        if (listing.subscriptionTier !== "free" && listing.paddleSubscriptionId) {
          await deps.bus.emit(
            "pending_cancellation_created",
            {
              _brand: "PendingCancellationCreatedEvent" as const,
              paddleSubscriptionId: listing.paddleSubscriptionId,
              listingId: input.listingId,
              reason: "listing_archived",
              timestamp: new Date().toISOString(),
            },
            deps.waitUntilFn,
          )
        }

        return updated
      }),

    reactivate: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const [listing] = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
        }
        // AC-42: admin-suspended listings cannot be self-reactivated [S1-ST-19]
        if (listing.lifecycleStatus === "suspended") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin-suspended listings require admin action" })
        }
        if (listing.lifecycleStatus !== "archived") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Listing is not archived" })
        }

        // AC-20: set active + emit
        const [updated] = await db
          .update(listings)
          .set({ lifecycleStatus: "active", updatedAt: new Date() })
          .where(eq(listings.id, input.listingId))
          .returning()

        await deps.bus.emit(
          "listing_reactivated",
          {
            _brand: "ListingReactivatedEvent" as const,
            listingId: input.listingId,
            accountId: ctx.session.accountId,
            entityType: listing.entityType,
            slug: listing.slug,
          },
          deps.waitUntilFn,
        )

        return updated
      }),

    listAll: adminProcedure
      .input(z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const db = deps.db
        const offset = (input.page - 1) * input.limit
        const items = await db
          .select()
          .from(listings)
          .orderBy(desc(listings.createdAt))
          .limit(input.limit)
          .offset(offset)

        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)

        return { items, total: count, page: input.page, limit: input.limit }
      }),
  })
}
