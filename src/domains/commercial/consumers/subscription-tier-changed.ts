// CR subscription_tier_changed consumer — S8 §10.1, AC-64, AC-65, AC-66
// Upserts commercial_state, logs conversion/upgrade/downgrade, emits conversion_milestone.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { EventHandler, SubscriptionTier } from "@/lib/events/types"
import { logDecision } from "@/lib/decisions/logger"
import { commercialState, churnAnalysisLog } from "@/db/schema/commercial"
import { PRICING } from "../pricing-config"
import { TIER_RANK } from "../subscription/types"

export type TierChangedDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function subscriptionTierChangedHandler(
  deps: TierChangedDeps,
): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "commercial",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (payload) => {
      const { listingId, accountId, previousTier, newTier } = payload
      const { db } = deps

      // Determine transition direction
      const direction = TIER_RANK[newTier] > TIER_RANK[previousTier]
        ? "upgrade"
        : TIER_RANK[newTier] < TIER_RANK[previousTier]
          ? "downgrade"
          : "lateral"

      // AC-66: effectivePriceAtSubscription only on free→paid
      const isFreeToConverted = previousTier === "free"

      // AC-64: Upsert commercial_state
      const [existing] = await db.select()
        .from(commercialState)
        .where(eq(commercialState.listingId, listingId))
        .limit(1)

      if (!existing) {
        await db.insert(commercialState).values({
          listingId,
          ...(isFreeToConverted ? { effectivePriceAtSubscription: PRICING[newTier].annual } : {}),
          updatedAt: new Date(),
        })
      } else if (isFreeToConverted) {
        // AC-66: only set on free→paid, never overwrite on upgrade/downgrade
        await db.update(commercialState)
          .set({
            effectivePriceAtSubscription: PRICING[newTier].annual,
            updatedAt: new Date(),
          })
          .where(eq(commercialState.listingId, listingId))
      }

      // AC-64: Determine eventType and revenue delta
      let eventType: string
      const newPrice = PRICING[newTier].annual
      const oldPrice = PRICING[previousTier].annual

      if (isFreeToConverted) {
        eventType = "conversion"
      } else if (direction === "upgrade") {
        eventType = "upgrade"
      } else {
        eventType = "downgrade"
      }
      const annualRevenue = newPrice - oldPrice

      // AC-64: Append to churn_analysis_log
      await db.insert(churnAnalysisLog).values({
        listingId,
        accountId,
        eventType,
        subscriptionTier: newTier,
        annualRevenue,
        metadata: { fromTier: previousTier, toTier: newTier },
        createdAt: new Date(),
      })

      // AC-65: Emit conversion_milestone on free→paid
      if (isFreeToConverted) {
        await deps.bus.emit(
          "conversion_milestone",
          {
            _brand: "ConversionMilestoneEvent" as const,
            listingId,
            accountId,
            milestone: "first_subscription",
            milestoneLabel: `Welcome to ${capitalize(newTier)}!`,
            timestamp: new Date().toISOString(),
          },
          deps.waitUntilFn,
        )
      }

      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "conversion_trigger_evaluation",
        inputs: { previousTier, newTier, direction },
        output: { eventType, milestoneEmitted: isFreeToConverted },
        listingId,
        accountId,
      })
    },
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
