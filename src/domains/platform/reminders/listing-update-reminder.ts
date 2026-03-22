// listing_update_reminder handler — S5 §9.1, AC-37
// Self-perpetuating: sends reminder email, then schedules itself again at +90 days.

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { ActionHandlerRegistry, SchedulerDb } from "@/lib/scheduler"
import { scheduleDeferredAction } from "@/lib/scheduler"

export const REMINDER_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000

export function registerListingUpdateReminderHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; emailService: EmailService; schedulerDb: SchedulerDb },
): void {
  registry.register("listing_update_reminder", async (params) => {
    const { listingId } = params
    const { db, emailService, schedulerDb } = deps

    const [listing] = await db
      .select({ accountId: listings.accountId, name: listings.name, lifecycleStatus: listings.lifecycleStatus })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing?.accountId) return
    if (listing.lifecycleStatus !== "active") return

    const [account] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, listing.accountId))
      .limit(1)

    if (!account) return

    await emailService.send({
      to: account.email,
      template: "listing_update_reminder",
      data: { listingName: listing.name, listingId },
      category: "profile_nudge",
      accountId: listing.accountId,
      listingId,
    })

    // Self-perpetuating: schedule next reminder [S0 §3]
    await scheduleDeferredAction(schedulerDb, {
      action: "listing_update_reminder",
      params: { listingId },
      executeAt: new Date(Date.now() + REMINDER_INTERVAL_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "platform",
    })
  })
}
