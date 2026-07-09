// compliance_hold_recheck handler — S10 §4.3, AC-36, AC-37, AC-38
// Re-checks compliance hold status for deferred buyer data deletion in closure flow.
// If hold cleared: execute deletion + update flow context.
// If hold active: reschedule for 7 days (repeating cycle).

import { eq, and } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "../registry"
import type { SchedulerDb } from "../api"
import { scheduleDeferredAction } from "../api"
import type { FlowDb } from "@/lib/flows/engine"
import { checkComplianceHold } from "@/domains/operations/compliance/queries"
import { executeBuyerDataDeletion } from "@/lib/flows/closure"

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type ComplianceHoldRecheckDeps = {
  db: Db
  flowDb: FlowDb
  schedulerDb: SchedulerDb
}

export function registerComplianceHoldRecheckHandler(
  registry: ActionHandlerRegistry,
  deps: ComplianceHoldRecheckDeps,
): void {
  registry.register("compliance_hold_recheck", async (params) => {
    const { accountId, flowId } = params

    // AC-36/AC-37: re-check compliance hold
    const holdResult = await checkComplianceHold(deps.db, accountId)

    if (holdResult.holdExists) {
      // AC-37: hold still active — reschedule for another 7 days
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "compliance_hold_recheck",
        params: { accountId, flowId },
        executeAt: new Date(Date.now() + SEVEN_DAYS_MS),
        retryPolicy: "retry_3",
        onFailure: "alert_principal",
        createdBy: "compliance_hold_recheck.reschedule",
      })
      return
    }

    // AC-36: hold cleared — execute buyer data deletion
    await executeBuyerDataDeletion(deps.db, accountId)

    // AC-38: update flow context to reflect buyer data deletion
    const flowRow = await deps.flowDb.findById(flowId)
    if (flowRow) {
      const updatedContext = {
        ...flowRow.context,
        buyerDataDeleted: true,
        buyerDataDeferred: false,
      }
      await deps.flowDb.update(flowId, {
        context: updatedContext,
        updatedAt: new Date(),
      })
    }
  })
}
