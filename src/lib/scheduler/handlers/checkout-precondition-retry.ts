// checkout_precondition_retry handler — S4 §8.3
// Retries checkout for listings not yet claimed at webhook time.
// Refunds after maxAttempts (12 × 5min = 1 hour).

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { scheduleDeferredAction, type SchedulerDb } from "@/lib/scheduler/api"
import { logDecision, type DecisionLogDb } from "@/lib/decisions/logger"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

const RETRY_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export type CheckoutRetryDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  onCheckoutCompleted: (paddleEvent: Record<string, unknown>) => Promise<void>
  refundTransaction: (subscriptionId: string) => Promise<void>
}

export function registerCheckoutPreconditionRetryHandler(
  registry: ActionHandlerRegistry,
  deps: CheckoutRetryDeps,
): void {
  registry.register("checkout_precondition_retry", async (params) => {
    const { paddleEvent, attemptCount, maxAttempts } = params as {
      paddleEvent: Record<string, unknown>
      attemptCount: number
      maxAttempts: number
    }

    const listingId = (paddleEvent as { listingId?: string }).listingId
    if (!listingId) return

    const [listing] = await deps.db
      .select({
        claimStatus: listings.claimStatus,
        accountId: listings.accountId,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing) return

    // Precondition met — process checkout
    if (listing.claimStatus === "claimed" && listing.accountId) {
      await deps.onCheckoutCompleted(paddleEvent)
      return
    }

    // Max attempts reached — refund and log anomaly
    if (attemptCount >= maxAttempts) {
      const subscriptionId = (paddleEvent as { paddleSubscriptionId?: string }).paddleSubscriptionId
      if (subscriptionId) {
        await deps.refundTransaction(subscriptionId)
      }

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "checkout_precondition_failure",
        inputs: { listingId, attempts: attemptCount },
        output: { action: "refunded" },
        listingId,
      })
      return
    }

    // Retry in 5 minutes
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "checkout_precondition_retry",
      params: { paddleEvent, attemptCount: attemptCount + 1, maxAttempts },
      executeAt: new Date(Date.now() + RETRY_INTERVAL_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "operations",
    })
  })
}
