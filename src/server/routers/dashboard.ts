// Dashboard router — S5 §1–§4, CS-WORK-043 AC-1–AC-5, CS-WORK-044 AC-6–AC-15
// Read-only queries for provider dashboard overview, listing analytics, and quality score.
// No events emitted — surfaces S1–S4 data only.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { and, eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
} from "@/db/schema/data-and-listings"
import { notifications } from "@/db/schema/shared"
import type { NotificationDb } from "@/lib/notifications"
import { getUnreadCount } from "@/lib/notifications"
import { computeFallbackProfileStrength } from "@/lib/onboarding/profile-strength"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"
import { asSubscriptionTier } from "@/domains/commercial/subscription/as-subscription-tier"
import type { SubscriptionTier } from "@/lib/events/types"
import {
  mapAnalyticsToUI,
  comparePeriods,
  type EngagementCounters,
} from "@/domains/platform/dashboard/map-analytics"

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
          asSubscriptionTier(row.subscriptionTier),
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

    // AC-6–AC-11: Tier-gated listing dashboard with analytics + quality + decay
    getListingDashboard: protectedProcedure
      .input(z.object({
        listingId: z.string().uuid(),
        analyticsPeriod: z.enum(["7d", "30d", "90d"]).default("30d"),
      }))
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
            // Engagement counters
            profileViews: engagements.profileViews,
            searchAppearances: engagements.searchAppearances,
            enquiriesReceived: engagements.enquiriesReceived,
            enquiryResponseRate: engagements.enquiryResponseRate,
            enquiryResponseTime: engagements.enquiryResponseTime,
            // Quality
            qualityComposite: qualityScores.composite,
            // Profile strength fields
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
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!row || row.accountId !== accountId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        const tier = asSubscriptionTier(row.subscriptionTier)
        const featureAccess = computeFeatureAccess(tier)

        const counters: EngagementCounters = {
          profileViews: row.profileViews ?? 0,
          searchAppearances: row.searchAppearances ?? 0,
          enquiriesReceived: row.enquiriesReceived ?? 0,
          enquiryResponseRate: row.enquiryResponseRate,
          enquiryResponseTime: row.enquiryResponseTime,
        }

        // AC-9: Clamp period to tier max. Free tier gets no time-series.
        let effectivePeriod = input.analyticsPeriod
        if (featureAccess.trendAnalytics !== "none") {
          effectivePeriod = comparePeriods(
            input.analyticsPeriod,
            featureAccess.trendAnalytics,
          )
        }

        // Time-series analytics: null until S9 populates data
        const analytics = null

        // AC-12, AC-13: Quality score explanation
        const [explanation] = await deps.db
          .select()
          .from(qualityScoreExplanations)
          .where(eq(qualityScoreExplanations.listingId, input.listingId))
          .limit(1)

        // AC-14: Decay warning — check notifications for active decay_warning
        const [decayWarning] = await deps.db
          .select({
            id: notifications.id,
            body: notifications.body,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .where(and(
            eq(notifications.accountId, accountId),
            eq(notifications.type, "decay_warning"),
            eq(notifications.dismissed, false),
          ))
          .limit(1)

        const profileStrength = computeFallbackProfileStrength({
          headline: row.headline,
          bio: row.bio,
          headshotUrl: row.headshotUrl,
          logoUrl: row.logoUrl,
          websiteUrl: row.websiteUrl,
          contactEmail: row.contactEmail,
          entityType: row.entityType,
        }).percentage

        return {
          listing: {
            listingId: row.listingId,
            name: row.name,
            entityType: row.entityType,
            lifecycleStatus: row.lifecycleStatus,
            subscriptionTier: row.subscriptionTier,
            verificationTier: row.verificationTier ?? "unclaimed",
          },
          analytics: mapAnalyticsToUI(counters, analytics, featureAccess),
          quality: {
            composite: row.qualityComposite ?? 0,
            explanation: explanation?.explanation ?? null,
          },
          profileStrength,
          featureAccess,
          decayWarning: decayWarning
            ? { id: decayWarning.id, body: decayWarning.body, detectedAt: decayWarning.createdAt }
            : null,
        }
      }),

    // AC-12, AC-13: Quality score explanation standalone route
    getQualityExplanation: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const accountId = ctx.session.accountId

        const [listing] = await deps.db
          .select({ id: listings.id, accountId: listings.accountId })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing || listing.accountId !== accountId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        const [row] = await deps.db
          .select({
            composite: qualityScores.composite,
            completeness: qualityScores.completeness,
            freshness: qualityScores.freshness,
            accuracy: qualityScores.accuracy,
            richness: qualityScores.richness,
            verification: qualityScores.verification,
          })
          .from(qualityScores)
          .where(eq(qualityScores.listingId, input.listingId))
          .limit(1)

        const [explanation] = await deps.db
          .select()
          .from(qualityScoreExplanations)
          .where(eq(qualityScoreExplanations.listingId, input.listingId))
          .limit(1)

        if (!row) return null

        return {
          composite: row.composite,
          dimensions: {
            completeness: { score: row.completeness, maxScore: 25 },
            freshness: { score: row.freshness, maxScore: 25 },
            accuracy: { score: row.accuracy, maxScore: 20 },
            richness: { score: row.richness, maxScore: 15 },
            verification: { score: row.verification, maxScore: 15 },
          },
          explanation: explanation?.explanation ?? null,
        }
      }),
  })
}
