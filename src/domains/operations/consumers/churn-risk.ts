// churn_risk_detected → upsert churn_risk_registry — S7 §9.12

import { eq, and, inArray, notInArray } from "drizzle-orm"
import { churnRiskRegistry, supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

type Deps = { db: Db; decisionLogDb: DecisionLogDb }

export function churnRiskDetectedHandler(deps: Deps): EventHandler<"churn_risk_detected"> {
  return {
    domain: "operations",
    eventType: "churn_risk_detected",
    mode: "async",
    handler: async (payload) => {
      const riskLevel = payload.riskFactors.includes("payment_at_risk")
        ? "high_risk"
        : "at_risk"

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

      // Upsert churn risk registry
      await deps.db
        .insert(churnRiskRegistry)
        .values({
          listingId: payload.listingId,
          accountId: payload.accountId,
          riskLevel,
          detectedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: churnRiskRegistry.listingId,
          set: { riskLevel, detectedAt: now, expiresAt },
        })

      // Elevate priority of open tickets for the account
      await deps.db
        .update(supportTickets)
        .set({ priority: "high" })
        .where(and(
          eq(supportTickets.accountId, payload.accountId),
          inArray(supportTickets.status, ["open", "assigned"]),
          notInArray(supportTickets.priority, ["critical", "high"]),
        ))

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "support_triage",
        inputs: { listingId: payload.listingId, riskFactors: payload.riskFactors },
        output: { riskLevel, action: "churn_risk_upserted" },
        listingId: payload.listingId,
        // accountId is text (Better Auth), not uuid — pass in additionalContext
        additionalContext: { accountId: payload.accountId },
      })
    },
  }
}
