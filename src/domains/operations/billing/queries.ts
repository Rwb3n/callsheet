// Billing reconciliation queries — S7 §4.4, Ops §3.5
// getBillingReconciliationStatus(): single-row table read, <100ms p95

import { sql } from "drizzle-orm"
import { billingReconciliationStatus, billingHolds } from "@/db/schema/operations"
import type { Db } from "@/db/types"

export type BillingReconciliationStatusResult = {
  lastRunAt: string | null
  status: "healthy" | "anomaly_detected" | "failed"
  activeHolds: number
  lastAnomalyAt: string | null
  lastAnomalyDescription: string | null
}

export async function getBillingReconciliationStatus(
  db: Db,
): Promise<BillingReconciliationStatusResult> {
  const [row] = await db
    .select()
    .from(billingReconciliationStatus)
    .limit(1)

  if (!row) {
    return {
      lastRunAt: null,
      status: "healthy",
      activeHolds: 0,
      lastAnomalyAt: null,
      lastAnomalyDescription: null,
    }
  }

  return {
    lastRunAt: row.lastRunAt.toISOString(),
    status: row.status as "healthy" | "anomaly_detected" | "failed",
    activeHolds: row.activeHolds,
    lastAnomalyAt: row.lastAnomalyAt?.toISOString() ?? null,
    lastAnomalyDescription: row.lastAnomalyDescription,
  }
}

export async function countActiveHolds(db: Db): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(billingHolds)
    .where(sql`${billingHolds.expiresAt} > now()`)
  return result?.count ?? 0
}
