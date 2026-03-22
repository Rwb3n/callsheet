// enquiry_response_reminder handler — S5 §5.3, AC-20, AC-21
// Marks enquiry as stale after 7 days unresponded. Sends reminder email to listing owner.

import { eq } from "drizzle-orm"
import { enquiryRecords } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

export function registerEnquiryResponseReminderHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; emailService: EmailService },
): void {
  registry.register("enquiry_response_reminder", async (params) => {
    const { enquiryId, listingId } = params

    const [enquiry] = await deps.db
      .select({ status: enquiryRecords.status })
      .from(enquiryRecords)
      .where(eq(enquiryRecords.id, enquiryId))
      .limit(1)

    if (!enquiry) return

    // AC-21: no-op if already responded
    if (enquiry.status === "responded") return

    // AC-20: mark as stale
    await deps.db
      .update(enquiryRecords)
      .set({ status: "stale" })
      .where(eq(enquiryRecords.id, enquiryId))

    // Send reminder email to listing owner
    const [listing] = await deps.db
      .select({ accountId: listings.accountId, name: listings.name })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing?.accountId) return

    const [account] = await deps.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, listing.accountId))
      .limit(1)

    if (!account) return

    await deps.emailService.send({
      to: account.email,
      template: "enquiry_reminder",
      data: { listingName: listing.name, daysSinceEnquiry: 7 },
      category: "enquiry_notification",
      accountId: listing.accountId,
      listingId,
    })
  })
}
