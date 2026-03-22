// check_quality_improvement deferred action handler — S8 §7, AC-52, AC-53, AC-54
// Fires 30 days after low-quality intervention. Emits churn_risk_detected if score still <40.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import { logDecision } from "@/lib/decisions/logger"
import { qualityScores, listings } from "@/db/schema/data-and-listings"

export type CheckQualityImprovementDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function registerCheckQualityImprovementHandler(
  registry: ActionHandlerRegistry,
  deps: CheckQualityImprovementDeps,
): void {
  registry.register("check_quality_improvement", async (params) => {
    const { listingId, baselineScore } = params

    // Read current quality score
    const [scoreRow] = await deps.db
      .select({ composite: qualityScores.composite })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listingId))
      .limit(1)

    // AC-54: listing deleted or no quality score — no action
    if (!scoreRow) return

    const currentScore = scoreRow.composite

    // AC-53: improved above threshold — no action
    if (currentScore >= 40) {
      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "churn_intervention",
        inputs: { subType: "quality_improvement_check", listingId, baselineScore, currentScore },
        output: { action: "no_action", reason: "quality_improved" },
        listingId,
      })
      return
    }

    // Read listing to check tier and get accountId
    const [listing] = await deps.db
      .select({
        accountId: listings.accountId,
        subscriptionTier: listings.subscriptionTier,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    // AC-54: listing gone or downgraded to free — no action
    if (!listing || listing.subscriptionTier === "free") return

    // AC-52: still below 40 — emit churn_risk_detected
    deps.waitUntilFn(
      deps.bus.emit("churn_risk_detected", {
        _brand: "ChurnRiskDetectedEvent" as const,
        listingId,
        accountId: listing.accountId!,
        riskFactors: ["low_quality_paid"] as const,
        timestamp: new Date().toISOString(),
      }, deps.waitUntilFn),
    )

    await logDecision(deps.decisionLogDb, {
      domain: "commercial",
      decisionType: "churn_intervention",
      inputs: { subType: "quality_improvement_check", listingId, baselineScore, currentScore },
      output: { action: "churn_risk_emitted", riskFactors: ["low_quality_paid"] },
      listingId,
      accountId: listing.accountId ?? undefined,
    })
  })
}
