// winback_eligible → email delivery + result emission — S7 §9.13, §11.1
// AC-11.1 through AC-11.3, AC-11.9, AC-11.10

import { eq } from "drizzle-orm"
import { user } from "@/db/schema/auth"
import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import { logDecision } from "@/lib/decisions/logger"

type EmitFn = (
  eventType: "winback_delivery_result",
  payload: {
    readonly _brand: "WinbackDeliveryResultEvent"
    listingId: string
    accountId: string
    status: "delivered" | "failed"
    timestamp: string
  },
) => Promise<void>

type Deps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  emit: EmitFn
}

export function winbackDeliveryHandler(deps: Deps): EventHandler<"winback_eligible"> {
  return {
    domain: "operations",
    eventType: "winback_eligible",
    mode: "async",
    handler: async (payload) => {
      const emitResult = async (status: "delivered" | "failed") => {
        // AC-11.3: accountId carries through cancelledAccountId
        await deps.emit("winback_delivery_result", {
          _brand: "WinbackDeliveryResultEvent" as const,
          listingId: payload.listingId,
          accountId: payload.cancelledAccountId,
          status,
          timestamp: new Date().toISOString(),
        })
      }

      // AC-11.1: resolve account email
      const [account] = await deps.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, payload.cancelledAccountId))

      if (!account?.email) {
        await emitResult("failed")
        return
      }

      // AC-11.1, AC-11.9: send with category conversion_marketing
      let deliveryStatus: "delivered" | "failed" = "failed"
      try {
        const result = await deps.emailService.send({
          to: account.email,
          template: "winback",
          data: payload.mergeFields,
          category: "conversion_marketing",
          accountId: payload.cancelledAccountId,
        })

        deliveryStatus = result.status === "sent" || result.status === "queued"
          ? "delivered"
          : "failed" // AC-11.10: suppressed → failed
      } catch {
        // AC-11.8: email failures caught, do NOT propagate
        deliveryStatus = "failed"
      }

      // AC-11.2: emit result after every processing
      await emitResult(deliveryStatus)

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "winback_delivery",
        inputs: { listingId: payload.listingId, cancelledAccountId: payload.cancelledAccountId },
        output: { deliveryStatus },
        listingId: payload.listingId,
        // accountId is text (Better Auth), not uuid — pass in additionalContext
        additionalContext: { cancelledAccountId: payload.cancelledAccountId },
      })
    },
  }
}
