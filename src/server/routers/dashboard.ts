// Dashboard router — S5 §1, §2, CS-WORK-043 AC-1 through AC-5
// Read-only queries for provider dashboard overview and listing context.
// No events emitted — surfaces S1–S4 data only.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings, verifications, qualityScores, engagements } from "@/db/schema/data-and-listings"
import type { NotificationDb } from "@/lib/notifications"
import { getUnreadCount } from "@/lib/notifications"
import { computeFallbackProfileStrength } from "@/lib/onboarding/profile-strength"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"

// --- Types ---

type ListingCardData = {
  listingId: string
  name: string
  entityType: string
  lifecycleStatus: string
  subscriptionTier: string
  verificationTier: string
  profileViews: number
  enquiriesReceived: number
  profileStrength: number
  qualityComposite: number
}

// --- Deps ---

export type DashboardRouterDeps = {
  db: Db
  notificationDb: NotificationDb
}

// --- Router ---

export function createDashboardRouter(deps: DashboardRouterDeps) {
  return router({
    // AC-2, AC-3, AC-5: overview with all owned listings as cards
    getOverview: protectedProcedure
      .query(async ({ ctx }) => {
        const accountId = ctx.session.accountId

        // Single join query — <500ms for up to 50 listings [AC-5, S5-ST-16]
        const rows = await deps.db
          .select({
            listingId: listings.id,
            name: listings.name,
            entityType: listings.entityType,
            lifecycleStatus: listings.lifecycleStatus,
            subscriptionTier: listings.subscriptionTier,
            verificationTier: verifications.tier,
            profileViews: engagements.profileViews,
            enquiriesReceived: engagements.enquiriesReceived,
            qualityComposite: qualityScores.composite,
            // Fields for profile strength computation
            headline: listings.headline,
            bio: listings.bio,
            headshotUrl: listings.headshotUrl,
            logoUrl: listings.logoUrl,
            websiteUrl: listings.websiteUrl,
            contactEmail: listings.contactEmail,
          })
          .from(listings)
          .leftJoin(verifications, eq(verifications.listingId, listings.id))
          .leftJoin(engagements, eq(engagements.listingId, listings.id))
          .leftJoin(qualityScores, eq(qualityScores.listingId, listings.id))
          .where(eq(listings.accountId, accountId))

        const cards: ListingCardData[] = rows.map((row) => ({
          listingId: row.listingId,
          name: row.name,
          entityType: row.entityType,
          lifecycleStatus: row.lifecycleStatus,
          subscriptionTier: row.subscriptionTier,
          verificationTier: row.verificationTier ?? "unclaimed",
          profileViews: row.profileViews ?? 0,
          enquiriesReceived: row.enquiriesReceived ?? 0,
          profileStrength: computeFallbackProfileStrength({
            headline: row.headline,
            bio: row.bio,
            headshotUrl: row.headshotUrl,
            logoUrl: row.logoUrl,
            websiteUrl: row.websiteUrl,
            contactEmail: row.contactEmail,
            entityType: row.entityType,
          }).percentage,
          qualityComposite: row.qualityComposite ?? 0,
        }))

        const unreadCount = await getUnreadCount(deps.notificationDb, accountId)

        return { cards, unreadCount }
      }),

    // AC-4: listing context with ownership verification
    getListingContext: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const accountId = ctx.session.accountId

        const [row] = await deps.db
          .select({
            listingId: listings.id,
            accountId: listings.accountId,
            name: listings.name,
            entityType: listings.entityType,
            lifecycleStatus: listings.lifecycleStatus,
            subscriptionTier: listings.subscriptionTier,
            verificationTier: verifications.tier,
          })
          .from(listings)
          .leftJoin(verifications, eq(verifications.listingId, listings.id))
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!row || row.accountId !== accountId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        const featureAccess = computeFeatureAccess(
          row.subscriptionTier as Parameters<typeof computeFeatureAccess>[0],
        )

        return {
          listing: {
            listingId: row.listingId,
            name: row.name,
            entityType: row.entityType,
            lifecycleStatus: row.lifecycleStatus,
            subscriptionTier: row.subscriptionTier,
            verificationTier: row.verificationTier ?? "unclaimed",
          },
          featureAccess,
        }
      }),
  })
}
