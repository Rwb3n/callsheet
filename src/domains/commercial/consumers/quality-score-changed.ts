// CR quality_score_changed consumer — S8 §10.5, AC-73
// Triggers low-quality intervention for paid listings below composite 40 with >14 days subscription.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { NotificationDb } from "@/lib/notifications"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EventHandler } from "@/lib/events/types"
import { listings } from "@/db/schema/data-and-listings"
import { triggerLowQualityIntervention } from "../low-quality-intervention"

export type QualityScoreChangedDeps = {
  db: Db
  notificationDb: NotificationDb
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function qualityScoreChangedHandler(
  deps: QualityScoreChangedDeps,
): EventHandler<"quality_score_changed"> {
  return {
    domain: "commercial",
    eventType: "quality_score_changed",
    mode: "async",
    handler: async (payload) => {
      const { listingId, newComposite } = payload
      const { db } = deps

      // AC-73 condition (a): only interested in scores below 40
      if (newComposite >= 40) return

      // Read listing subscription state (D1 join — CR's own stored data)
      const [listing] = await db.select({
        subscriptionTier: listings.subscriptionTier,
        subscriptionStartDate: listings.subscriptionStartDate,
        accountId: listings.accountId,
      })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1)

      if (!listing) return

      // AC-73 condition (b): only paid listings
      if (listing.subscriptionTier === "free") return

      // AC-73 condition (c): subscription age >14 days
      if (!listing.subscriptionStartDate) return
      const subscriptionAgeDays = (Date.now() - listing.subscriptionStartDate.getTime()) / (1000 * 60 * 60 * 24)
      if (subscriptionAgeDays <= 14) return

      if (!listing.accountId) return

      // Delegate to §7 decision architecture
      await triggerLowQualityIntervention(
        {
          listingId,
          accountId: listing.accountId,
          currentComposite: newComposite,
          subscriptionTier: listing.subscriptionTier,
        },
        {
          notificationDb: deps.notificationDb,
          schedulerDb: deps.schedulerDb,
          decisionLogDb: deps.decisionLogDb,
        },
      )
    },
  }
}
