// CR account_closed consumer — S8 §10.6, AC-74, AC-75
// Cancels win-back schedules, logs churn for paid listings, skips free-tier.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { EventHandler, SubscriptionTier } from "@/lib/events/types"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"
import { listings } from "@/db/schema/data-and-listings"
import { PRICING } from "../pricing-config"

export type AccountClosedDeps = {
  db: Db
  schedulerDb: SchedulerDb
}

export function accountClosedHandler(
  deps: AccountClosedDeps,
): EventHandler<"account_closed"> {
  return {
    domain: "commercial",
    eventType: "account_closed",
    mode: "async",
    handler: async (payload) => {
      const { accountId, listingsArchived } = payload
      const { db } = deps

      if (listingsArchived.length === 0) return

      // AC-74: Cancel all pending win-back schedules for affected listings
      for (const lid of listingsArchived) {
        await cancelDeferredAction(deps.schedulerDb, {
          action: "win_back_evaluation",
          filterParams: { listingId: lid },
          cancelledBy: "commercial",
        })
      }

      // AC-74/75: Log churn per listing, skip free-tier
      for (const lid of listingsArchived) {
        const [listing] = await db.select({
          subscriptionTier: listings.subscriptionTier,
        })
          .from(listings)
          .where(eq(listings.id, lid))
          .limit(1)

        const tier = (listing?.subscriptionTier ?? "free") as SubscriptionTier
        if (tier === "free") continue // AC-75: skip free-tier

        const annualRevenue = -(PRICING[tier].annual)

        await db.insert(churnAnalysisLog).values({
          listingId: lid,
          accountId,
          eventType: "churn",
          reason: "account_closed",
          subscriptionTier: tier,
          annualRevenue,
          metadata: { origin: "closure" },
          createdAt: new Date(),
        })

        // Update commercial_state churn metadata
        await db.insert(commercialState)
          .values({
            listingId: lid,
            lastChurnEventAt: new Date(),
            lastChurnReason: "account_closed",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: commercialState.listingId,
            set: {
              lastChurnEventAt: new Date(),
              lastChurnReason: "account_closed",
              updatedAt: new Date(),
            },
          })
      }
    },
  }
}
