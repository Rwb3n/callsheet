// Ops pending_cancellation_created consumer — Ops §5, S4 §10
// Stores pending cancellation record for Paddle webhook attribution,
// then calls PaymentService.cancelSubscription.

import { storePendingCancellation } from "./pending-cancellations"
import type { Db } from "@/db/types"
import type { PaymentService } from "@/lib/services/types"
import type { EventHandler } from "@/lib/events/types"

export type OpsConsumerDeps = {
  db: Db
  payment: PaymentService
}

export function pendingCancellationCreatedHandler(
  deps: OpsConsumerDeps,
): EventHandler<"pending_cancellation_created"> {
  return {
    domain: "operations",
    eventType: "pending_cancellation_created",
    mode: "async",
    handler: async (payload) => {
      await storePendingCancellation(deps.db, {
        paddleSubscriptionId: payload.paddleSubscriptionId,
        listingId: payload.listingId,
        reason: payload.reason,
      })

      await deps.payment.cancelSubscription({
        paddleSubscriptionId: payload.paddleSubscriptionId,
        reason: payload.reason,
        effectiveFrom: "immediately",
      })
    },
  }
}
