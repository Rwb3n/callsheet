// Feature gate friction summary — Ops §3.4, S7 §12, CS-WORK-064
// Aggregates support_tickets WHERE category = 'feature_gating_confusion'
// grouped by details->>'gate'.

import { eq, and, gt, count, sql } from "drizzle-orm"
import { supportTickets } from "@/db/schema/operations"
import type { Db } from "@/db/types"

export type FeatureGateFrictionSummary = {
  period: string
  gates: {
    gateName: string
    ticketCount: number
    totalTickets: number
    frictionRatio: number
  }[]
}

const PERIOD_DAYS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
}

export async function getFeatureGateFrictionSummary(
  db: Db,
  period: "30d" | "90d" | "365d",
): Promise<FeatureGateFrictionSummary> {
  const days = PERIOD_DAYS[period]
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // AC-12.2: aggregate by details->>'gate'
  const gateRows = await db
    .select({
      gateName: sql<string>`${supportTickets.details}->>'gate'`,
      ticketCount: count(),
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.category, "feature_gating_confusion"),
        sql`${supportTickets.details}->>'gate' IS NOT NULL`,
        gt(supportTickets.createdAt, periodStart),
      ),
    )
    .groupBy(sql`${supportTickets.details}->>'gate'`)

  // Total tickets in the period (all categories)
  const [totalRow] = await db
    .select({ total: count() })
    .from(supportTickets)
    .where(gt(supportTickets.createdAt, periodStart))

  const totalTickets = totalRow?.total ?? 0

  return {
    period,
    gates: gateRows.map((row) => ({
      gateName: row.gateName,
      ticketCount: row.ticketCount,
      totalTickets,
      frictionRatio: totalTickets > 0 ? row.ticketCount / totalTickets : 0,
    })),
  }
}
