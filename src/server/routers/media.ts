// Media upload/delete/reorder routes — S1 §5, AC-23 through AC-26
// S2 §4.3: post-upload variant generation (AC-39/40/41/50)
// Platform owns these routes; uploads go to R2 via ObjectStorageService.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, sql, asc } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings, mediaItems } from "@/db/schema/data-and-listings"
import type { ObjectStorageService } from "@/lib/storage/types"
import { MAX_UPLOAD_SIZE_BYTES, ALLOWED_CONTENT_TYPES } from "@/lib/storage/types"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import type { ListingSubscriptionTier } from "@/domains/commercial/tier-limits"
import type { ImageProcessor } from "@/lib/image-processing/variants"

const MEDIA_TYPE_VALUES = ["logo", "headshot", "portfolio", "gallery"] as const

export const uploadImageInput = z.object({
  listingId: z.string().uuid(),
  type: z.enum(MEDIA_TYPE_VALUES),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  data: z.instanceof(Buffer),
})

export const deleteImageInput = z.object({
  mediaItemId: z.string().uuid(),
})

export const reorderImagesInput = z.object({
  listingId: z.string().uuid(),
  mediaItemIds: z.array(z.string().uuid()),
})

export type MediaRouterDeps = {
  db: Db
  storage: ObjectStorageService
  processImage?: ImageProcessor
}

function assertOwnership(listing: { accountId: string | null }, accountId: string) {
  if (listing.accountId !== accountId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
  }
}

export function createMediaRouter(deps: MediaRouterDeps) {
  return router({
    // AC-23: verifies ownership, checks tier limit, uploads to R2, returns public URL
    // AC-24: rejects >10MB, rejects non-JPEG/PNG/WebP (enforced by Zod + storage service)
    uploadImage: protectedProcedure
      .input(uploadImageInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db

        const [listing] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        assertOwnership(listing, ctx.session.accountId)

        // Check tier media limit — CR §4.1, AC-24: count only visible items
        const tier = listing.subscriptionTier as ListingSubscriptionTier
        const limit = TIER_LIMITS[tier].maxMedia
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(mediaItems)
          .where(and(eq(mediaItems.listingId, input.listingId), eq(mediaItems.visibility, "visible")))
        if (count >= limit) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Media limit reached (${limit} for ${tier} tier)`,
          })
        }

        // Determine sort order for new item
        const [last] = await db
          .select({ sortOrder: mediaItems.sortOrder })
          .from(mediaItems)
          .where(eq(mediaItems.listingId, input.listingId))
          .orderBy(sql`${mediaItems.sortOrder} DESC`)
          .limit(1)
        const nextSort = (last?.sortOrder ?? -1) + 1

        // Generate a stable image ID for the R2 key
        const imageId = crypto.randomUUID()
        const ext = input.contentType.split("/")[1]
        const key = `listings/${input.listingId}/images/${imageId}.${ext}`

        const { url } = await deps.storage.upload({
          key,
          data: input.data,
          contentType: input.contentType,
          maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
          access: "public",
        })

        const publicUrl = url!

        // Insert media row + update listing logo/headshot if applicable.
        // Cleanup R2 on DB failure to prevent orphaned objects.
        let created: typeof mediaItems.$inferSelect
        try {
          const [row] = await db.transaction(async (tx) => {
            const [r] = await tx.insert(mediaItems).values({
              id: imageId,
              listingId: input.listingId,
              type: input.type,
              url: publicUrl,
              sortOrder: nextSort,
            }).returning()

            // AC-26: logo/headshot upload updates listing field
            if (input.type === "logo") {
              await tx.update(listings).set({ logoUrl: publicUrl, updatedAt: new Date() }).where(eq(listings.id, input.listingId))
            } else if (input.type === "headshot") {
              await tx.update(listings).set({ headshotUrl: publicUrl, updatedAt: new Date() }).where(eq(listings.id, input.listingId))
            }

            return [r]
          })
          created = row
        } catch (err) {
          await deps.storage.delete(key)
          throw err
        }

        // S2 §4.3: best-effort variant generation — AC-39/AC-50
        // processListingImage returns null on failure (catches internally)
        if (deps.processImage) {
          const variants = await deps.processImage(key, deps.storage)
          if (variants) {
            await db
              .update(mediaItems)
              .set({ url: variants.cardUrl })
              .where(eq(mediaItems.id, imageId))

            if (input.type === "logo") {
              await db.update(listings).set({ logoUrl: variants.cardUrl, updatedAt: new Date() }).where(eq(listings.id, input.listingId))
            } else if (input.type === "headshot") {
              await db.update(listings).set({ headshotUrl: variants.cardUrl, updatedAt: new Date() }).where(eq(listings.id, input.listingId))
            }

            return { mediaItem: { ...created, url: variants.cardUrl }, url: variants.cardUrl }
          }
        }

        return { mediaItem: created, url: publicUrl }
      }),

    // AC-25: removes from R2 and mediaItems table
    deleteImage: protectedProcedure
      .input(deleteImageInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db

        const [item] = await db
          .select()
          .from(mediaItems)
          .where(eq(mediaItems.id, input.mediaItemId))
          .limit(1)
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" })

        const [listing] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, item.listingId))
          .limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        assertOwnership(listing, ctx.session.accountId)

        // R2 delete is external — fine outside transaction
        const urlPath = new URL(item.url).pathname.slice(1)
        await deps.storage.delete(urlPath)

        // DB row delete + listing field null must be atomic
        await db.transaction(async (tx) => {
          await tx.delete(mediaItems).where(eq(mediaItems.id, input.mediaItemId))

          if (item.type === "logo" && listing.logoUrl === item.url) {
            await tx.update(listings).set({ logoUrl: null, updatedAt: new Date() }).where(eq(listings.id, item.listingId))
          } else if (item.type === "headshot" && listing.headshotUrl === item.url) {
            await tx.update(listings).set({ headshotUrl: null, updatedAt: new Date() }).where(eq(listings.id, item.listingId))
          }
        })

        return { deleted: true }
      }),

    reorderImages: protectedProcedure
      .input(reorderImagesInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db

        const [listing] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        assertOwnership(listing, ctx.session.accountId)

        await db.transaction(async (tx) => {
          for (let i = 0; i < input.mediaItemIds.length; i++) {
            await tx
              .update(mediaItems)
              .set({ sortOrder: i })
              .where(and(eq(mediaItems.id, input.mediaItemIds[i]), eq(mediaItems.listingId, input.listingId)))
          }
        })

        const reordered = await db
          .select()
          .from(mediaItems)
          .where(eq(mediaItems.listingId, input.listingId))
          .orderBy(asc(mediaItems.sortOrder))

        return reordered
      }),
  })
}
