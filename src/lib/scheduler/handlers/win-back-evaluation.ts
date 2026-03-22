// win_back_evaluation deferred action handler — S8 §3, AC-22, AC-25, AC-28
// Fires 60 days after subscription_ended (paddle origin only).
// Reads listing state + engagement, calls evaluateWinBack, emits winback_eligible or no-ops.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import { listings } from "@/db/schema/data-and-listings"
import {
  evaluateWinBack,
  getEngagementCountersForWinBack,
  logWinBackDecision,
  type WinBackInput,
} from "@/domains/commercial/winback-evaluation"

export type WinBackHandlerDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function registerWinBackEvaluationHandler(
  registry: ActionHandlerRegistry,
  deps: WinBackHandlerDeps,
): void {
  registry.register("win_back_evaluation", async (params) => {
    const { listingId, accountId } = params

    // Read listing current state
    const [listing] = await deps.db
      .select({
        lifecycleStatus: listings.lifecycleStatus,
        accountId: listings.accountId,
        name: listings.name,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    // Listing deleted — no action, no decision log
    if (!listing) return

    const engagement = await getEngagementCountersForWinBack(deps.db, listingId)

    const input: WinBackInput = {
      listingId,
      cancelledAccountId: accountId,
      listing: {
        lifecycleStatus: listing.lifecycleStatus,
        accountId: listing.accountId,
        name: listing.name,
      },
      engagement,
    }

    const result = evaluateWinBack(input)

    // AC-28: decision log for every invocation
    await logWinBackDecision(deps.decisionLogDb, input, result)

    // AC-25: emit winback_eligible on send_email
    if (result.action === "send_email") {
      deps.waitUntilFn(
        deps.bus.emit("winback_eligible", {
          _brand: "WinbackEligibleEvent" as const,
          listingId,
          cancelledAccountId: accountId,
          mergeFields: result.mergeFields,
          timestamp: new Date().toISOString(),
        }, deps.waitUntilFn),
      )
    }
  })
}
