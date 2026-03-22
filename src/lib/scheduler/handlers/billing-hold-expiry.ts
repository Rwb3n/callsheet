// billing_hold_expiry handler — S7 §4.3, CS-WORK-059 AC-4.7
// Fires 48h after hold creation. Deletes the hold row. Does NOT emit subscription_ended.
// The daily reconciliation handler owns emission decisions.

import { eq } from "drizzle-orm"
import { billingHolds } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"

export function registerBillingHoldExpiryHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; decisionLogDb: DecisionLogDb },
): void {
  registry.register("billing_hold_expiry", async (params) => {
    const { holdId, listingId } = params

    const [hold] = await deps.db
      .select({ id: billingHolds.id })
      .from(billingHolds)
      .where(eq(billingHolds.id, holdId))
      .limit(1)

    // Hold already released (manually or by daily reconciliation) — no-op
    if (!hold) return

    await deps.db.delete(billingHolds).where(eq(billingHolds.id, holdId))

    await logDecision(deps.decisionLogDb, {
      domain: "operations",
      decisionType: "billing_reconciliation",
      inputs: { holdId, listingId },
      output: { action: "hold_auto_expired", reason: "48h_elapsed_no_manual_release" },
    })
  })
}
