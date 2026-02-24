// grace_period_expiry handler — S4 §8.2, AC-28, AC-29
// Checks if payment was recovered during grace period. If not, finalises cancellation.

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import {
  findActiveGracePeriod,
  resolveGracePeriod,
  finaliseSubscriptionEnd,
  type FinaliseSubscriptionEndDeps,
} from "@/domains/commercial/subscription/grace-period"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

export type GracePeriodExpiryDeps = FinaliseSubscriptionEndDeps & {
  db: Db
}

export function registerGracePeriodExpiryHandler(
  registry: ActionHandlerRegistry,
  deps: GracePeriodExpiryDeps,
): void {
  registry.register("grace_period_expiry", async (params) => {
    const { listingId } = params
    const { db } = deps

    // Find active grace period
    const grace = await findActiveGracePeriod(db, listingId)
    if (!grace) return // already resolved (payment recovered or refund)

    // Look up current listing state
    const [listing] = await db
      .select({
        subscriptionTier: listings.subscriptionTier,
        paddleSubscriptionId: listings.paddleSubscriptionId,
        accountId: listings.accountId,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing) return

    // AC-29: payment recovered — listing still has active subscription
    if (listing.subscriptionTier !== "free" && listing.paddleSubscriptionId) {
      await resolveGracePeriod(db, grace.id, "payment_recovered")
      return
    }

    // AC-28: grace period expired — finalise cancellation
    await resolveGracePeriod(db, grace.id, "downgraded")

    if (!listing.accountId) return

    await finaliseSubscriptionEnd(deps, {
      listingId,
      accountId: listing.accountId,
      previousTier: grace.previousTier as "free" | "standard" | "premium" | "partner",
      reason: "payment_failure",
      origin: "paddle",
    })
  })
}
