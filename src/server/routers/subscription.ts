// Subscription checkout + status routes — S4 §3, AC-11 through AC-15
// createCheckout: initiate Paddle checkout for claimed listing at free tier
// upgrade: Paddle subscription update to higher tier
// getSubscriptionStatus: current tier, billing cadence, grace period, feature access

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import type { PaymentService } from "@/lib/services/types"
import { TIER_RANK } from "@/domains/commercial/subscription/types"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"
import { findActiveGracePeriod } from "@/domains/commercial/subscription/grace-period"

export type SubscriptionRouterDeps = {
  db: Db
  payment: PaymentService
}

export function createSubscriptionRouter(deps: SubscriptionRouterDeps) {
  return router({
    createCheckout: protectedProcedure
      .input(z.object({
        listingId: z.string().uuid(),
        tier: z.enum(["standard", "premium", "partner"]),
        billingCadence: z.enum(["annual", "monthly"]).default("annual"),
        couponCode: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "you do not own this listing" })
        }

        // AC-12: listing must be claimed [CR-X-1]
        if (listing.claimStatus !== "claimed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "listing must be claimed before subscribing" })
        }

        // AC-13: listing must not have an active subscription
        if (listing.subscriptionTier !== "free") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "listing already has an active subscription — use upgrade instead" })
        }

        // Resolve Paddle customer ID (reuse existing)
        const [profile] = await deps.db
          .select({ paddleCustomerId: accountProfiles.paddleCustomerId })
          .from(accountProfiles)
          .where(eq(accountProfiles.accountId, ctx.session.accountId))
          .limit(1)

        const result = await deps.payment.createCheckoutSession({
          accountId: ctx.session.accountId,
          listingId: input.listingId,
          tier: input.tier,
          billingCadence: input.billingCadence,
          couponCode: input.couponCode,
          paddleCustomerId: profile?.paddleCustomerId ?? undefined,
          successUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/listings/${input.listingId}?checkout=success`,
          cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/pricing?checkout=cancelled`,
        })

        return { checkoutUrl: result.checkoutUrl }
      }),

    upgrade: protectedProcedure
      .input(z.object({
        listingId: z.string().uuid(),
        newTier: z.enum(["standard", "premium", "partner"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "you do not own this listing" })
        }

        // AC-14: must have active subscription
        if (listing.subscriptionTier === "free" || !listing.paddleSubscriptionId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "no active subscription to upgrade" })
        }

        // AC-15: new tier must be higher than current
        if (TIER_RANK[input.newTier] <= TIER_RANK[listing.subscriptionTier]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "target tier must be higher than current tier" })
        }

        const result = await deps.payment.createCheckoutSession({
          accountId: ctx.session.accountId,
          listingId: input.listingId,
          tier: input.newTier,
          existingSubscriptionId: listing.paddleSubscriptionId,
          successUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/listings/${input.listingId}?upgrade=success`,
          cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/listings/${input.listingId}/subscription`,
        })

        return { checkoutUrl: result.checkoutUrl }
      }),

    getSubscriptionStatus: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "you do not own this listing" })
        }

        const featureAccess = computeFeatureAccess(listing.subscriptionTier)
        const grace = await findActiveGracePeriod(deps.db, input.listingId)

        return {
          tier: listing.subscriptionTier,
          billingCadence: listing.billingCadence,
          subscriptionStartDate: listing.subscriptionStartDate,
          subscriptionEndDate: listing.subscriptionEndDate,
          featureAccess,
          gracePeriod: grace
            ? { expiresAt: grace.expiresAt, previousTier: grace.previousTier }
            : null,
        }
      }),
  })
}
