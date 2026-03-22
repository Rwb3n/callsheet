// proactive_churn_detection handler — S9 §5.2, AC-75/76/77
// Weekly. Scans for proactive churn signals (engagement drops, billing cadence changes),
// logs decisions, emits churn_risk_detected events for medium/high risk.
// Standalone handler — not ceremony infrastructure (no CeremonyType entry).

import { sql, and, gte, eq } from "drizzle-orm"
import { perceptionAggregates } from "@/db/schema/intelligence"
import { churnAnalysisLog } from "@/db/schema/commercial"
import { churnRiskRegistry } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { ChurnRiskFactor } from "@/lib/events/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { emitChurnRiskDetected } from "@/domains/commercial/churn-intervention"
import {
  computeOverallRisk,
  computeRecommendedAction,
  PROACTIVE_CHURN_SPEC,
  type DetectedChurnSignal,
} from "@/domains/intelligence/learning/proactive-churn"

const DAY_MS = 24 * 60 * 60 * 1000

export type ProactiveChurnDetectionDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function registerProactiveChurnDetectionHandler(
  registry: ActionHandlerRegistry,
  deps: ProactiveChurnDetectionDeps,
): void {
  registry.register("proactive_churn_detection", async (_params) => {
    const signals: DetectedChurnSignal[] = []
    const now = new Date()

    // 1. Scan for engagement_dropping: compare current vs previous perception aggregates
    //    Look for viewer_demographics aggregates where view counts dropped > 30%
    const recentAggregates = await deps.db
      .select({
        listingId: perceptionAggregates.listingId,
        data: perceptionAggregates.data,
        periodStart: perceptionAggregates.periodStart,
        sampleSize: perceptionAggregates.sampleSize,
      })
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.aggregateType, "viewer_demographics"),
          gte(perceptionAggregates.computedAt, new Date(now.getTime() - 60 * DAY_MS)),
        ),
      )

    // Group by listing, find pairs for comparison
    const byListing = new Map<string, Array<{ data: Record<string, unknown>; periodStart: string; sampleSize: number }>>()
    for (const row of recentAggregates) {
      const existing = byListing.get(row.listingId) ?? []
      existing.push({ data: row.data, periodStart: row.periodStart, sampleSize: row.sampleSize })
      byListing.set(row.listingId, existing)
    }

    for (const [listingId, periods] of Array.from(byListing.entries())) {
      if (periods.length < 2) continue

      // Sort by periodStart descending to get current and previous
      periods.sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      const current = periods[0]
      const previous = periods[1]

      if (previous.sampleSize === 0) continue

      const dropRate = (previous.sampleSize - current.sampleSize) / previous.sampleSize
      if (dropRate < PROACTIVE_CHURN_SPEC.ENGAGEMENT_DROP_THRESHOLD) continue

      // Engagement is dropping — look up listing's accountId
      const [listing] = await deps.db
        .select({ accountId: listings.accountId })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1)

      if (!listing?.accountId) continue

      // Get existing churn risk factors from registry
      const existingRisk = await deps.db
        .select({ riskLevel: churnRiskRegistry.riskLevel })
        .from(churnRiskRegistry)
        .where(eq(churnRiskRegistry.listingId, listingId))
        .limit(1)

      // Infer existing factors from churn_analysis_log
      const existingFactors = await inferExistingFactors(deps.db, listingId)
      const allFactors: ChurnRiskFactor[] = [...existingFactors, "engagement_dropping"]
      const overallRisk = computeOverallRisk(allFactors)
      const recommendedAction = computeRecommendedAction(overallRisk)

      signals.push({
        listingId,
        accountId: listing.accountId,
        factor: "engagement_dropping",
        overallRisk,
        recommendedAction,
        existingFactors,
      })
    }

    // 2. Scan for billing_cadence_switch_to_monthly
    const cadenceWindowStart = new Date(now.getTime() - PROACTIVE_CHURN_SPEC.CADENCE_SWITCH_WINDOW_DAYS * DAY_MS)
    const cadenceChanges = await deps.db
      .select({
        listingId: churnAnalysisLog.listingId,
        accountId: churnAnalysisLog.accountId,
      })
      .from(churnAnalysisLog)
      .where(
        and(
          eq(churnAnalysisLog.eventType, "cadence_change"),
          gte(churnAnalysisLog.createdAt, cadenceWindowStart),
        ),
      )

    for (const row of cadenceChanges) {
      if (!row.accountId) continue

      // Skip if already detected as engagement_dropping for this listing
      if (signals.some((s) => s.listingId === row.listingId)) continue

      const existingFactors = await inferExistingFactors(deps.db, row.listingId)
      const allFactors: ChurnRiskFactor[] = [...existingFactors, "billing_cadence_switch_to_monthly"]
      const overallRisk = computeOverallRisk(allFactors)
      const recommendedAction = computeRecommendedAction(overallRisk)

      signals.push({
        listingId: row.listingId,
        accountId: row.accountId,
        factor: "billing_cadence_switch_to_monthly",
        overallRisk,
        recommendedAction,
        existingFactors,
      })
    }

    // 3. Process signals — log decisions and emit events
    for (const signal of signals) {
      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "proactive_churn_detection",
        inputs: {
          factor: signal.factor,
          existingFactors: signal.existingFactors,
        },
        output: {
          overallRisk: signal.overallRisk,
          recommendedAction: signal.recommendedAction,
        },
        confidence: 0.7,
        listingId: signal.listingId,
        additionalContext: { accountId: signal.accountId },
      })

      // Emit churn_risk_detected for medium or high risk
      if (signal.overallRisk === "medium" || signal.overallRisk === "high") {
        const allFactors: ChurnRiskFactor[] = [...signal.existingFactors, signal.factor]
        emitChurnRiskDetected(
          deps.bus,
          deps.waitUntilFn,
          signal.listingId,
          signal.accountId,
          allFactors,
        )
      }
    }

    // 4. If no signals, log clean scan
    if (signals.length === 0) {
      await logDecision(deps.decisionLogDb, {
        domain: "commercial",
        decisionType: "proactive_churn_detection",
        inputs: { scanType: "weekly_proactive" },
        output: { result: "clean", signalsDetected: 0 },
        confidence: 0.9,
      })
    }

    // 5. Schedule next weekly run
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "proactive_churn_detection",
      params: {} as Record<string, never>,
      executeAt: new Date(now.getTime() + 7 * DAY_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "proactive_churn_detection",
    })
  })
}

// Infer existing churn risk factors from churn_analysis_log entries
async function inferExistingFactors(db: Db, listingId: string): Promise<ChurnRiskFactor[]> {
  const recentLogs = await db
    .select({ reason: churnAnalysisLog.reason })
    .from(churnAnalysisLog)
    .where(
      and(
        eq(churnAnalysisLog.listingId, listingId),
        gte(churnAnalysisLog.createdAt, new Date(Date.now() - 90 * DAY_MS)),
      ),
    )

  const factors: ChurnRiskFactor[] = []
  for (const log of recentLogs) {
    if (log.reason === "payment_failure" && !factors.includes("payment_at_risk")) {
      factors.push("payment_at_risk")
    }
    if (log.reason === "low_quality_paid" && !factors.includes("low_quality_paid")) {
      factors.push("low_quality_paid")
    }
    if (log.reason === "quality_declining" && !factors.includes("quality_declining")) {
      factors.push("quality_declining")
    }
  }

  return factors
}
