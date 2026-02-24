// retry_bounced_email handler — Comms P1, AC-15
// Re-sends a soft-bounced email after 24h delay.
// Skips if correspondence_log row no longer in "bounced" status (e.g. already retried).

import { eq } from "drizzle-orm"
import { correspondenceLog } from "@/db/schema/correspondence"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { EmailSendParams } from "@/lib/email/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

export function registerBounceRetryHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; emailService: EmailService },
): void {
  registry.register("retry_bounced_email", async (params) => {
    const { correspondenceLogId, originalParams } = params as {
      correspondenceLogId: string
      originalParams: EmailSendParams
    }

    // Verify the row still exists and is bounced
    const [row] = await deps.db
      .select({ status: correspondenceLog.status })
      .from(correspondenceLog)
      .where(eq(correspondenceLog.id, correspondenceLogId))
      .limit(1)

    if (!row || row.status !== "bounced") return

    await deps.emailService.send(originalParams)
  })
}
