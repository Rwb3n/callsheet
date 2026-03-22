// CR listing_archived consumer — S8 §10.4, AC-72
// Logs churn for paid listings with a known account only.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"
import { PRICING } from "../pricing-config"

export type ListingArchivedDeps = {
  db: Db
}

export function listingArchivedChurnHandler(
  deps: ListingArchivedDeps,
): EventHandler<"listing_archived"> {
  return {
    domain: "commercial",
    eventType: "listing_archived",
    mode: "async",
    handler: async (payload) => {
      const { listingId, accountId, subscriptionTier } = payload
      const { db } = deps

      // AC-72: Guard — only paid listings with a known account
      if (subscriptionTier === "free" || accountId === null) return

      const annualRevenue = -(PRICING[subscriptionTier].annual)

      await db.insert(churnAnalysisLog).values({
        listingId,
        accountId,
        eventType: "churn",
        reason: "listing_archived",
        subscriptionTier,
        annualRevenue,
        metadata: { origin: "archival" },
        createdAt: new Date(),
      })

      // Upsert commercial_state churn metadata
      await db.insert(commercialState)
        .values({
          listingId,
          lastChurnEventAt: new Date(),
          lastChurnReason: "listing_archived",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: commercialState.listingId,
          set: {
            lastChurnEventAt: new Date(),
            lastChurnReason: "listing_archived",
            updatedAt: new Date(),
          },
        })
    },
  }
}
