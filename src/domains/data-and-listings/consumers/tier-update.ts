// Subscription tier sync — D&L §2.4, S4 §10
// subscription_tier_changed → update listings.subscriptionTier + restore hidden items on upgrade [AC-41]

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"
import { restoreHiddenItems } from "@/domains/commercial/subscription/restore-hidden"
import { TIER_RANK } from "@/domains/commercial/subscription/types"
import type { EventHandler } from "@/lib/events/types"

export function subscriptionTierChangedHandler(db: Db): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "data-and-listings",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (payload) => {
      await db
        .update(listings)
        .set({
          subscriptionTier: payload.newTier,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, payload.listingId))

      // S4: restore hidden media/credits on upgrade [AC-41]
      if (TIER_RANK[payload.newTier] > TIER_RANK[payload.previousTier]) {
        await restoreHiddenItems(db, payload.listingId, payload.newTier)
      }
    },
  }
}
