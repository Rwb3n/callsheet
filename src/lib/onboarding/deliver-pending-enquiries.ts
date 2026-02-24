// Pending enquiry delivery — S3 §3.2, AC-13, AC-20, AC-48
// Delivers held enquiries to claimant after claim approval.
// Batches of 5 enquiry_forwarded emails. Single listing fetch (AC-48).

import { eq, inArray, isNull, gt } from "drizzle-orm"
import { pendingEnquiries } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"

const BATCH_SIZE = 5

export type DeliverPendingEnquiriesDeps = {
  db: Db
  emailService: EmailService
  notificationDb: NotificationDb
}

export async function deliverPendingEnquiries(
  deps: DeliverPendingEnquiriesDeps,
  listingId: string,
  accountId: string,
  listingName: string,
): Promise<number> {
  const now = new Date()

  // Fetch non-forwarded, non-expired enquiries for this listing [AC-20]
  const pending = await deps.db
    .select()
    .from(pendingEnquiries)
    .where(
      eq(pendingEnquiries.listingId, listingId),
    )

  const eligible = pending.filter(
    (e) => e.forwardedAt === null && e.expiresAt > now,
  )

  if (eligible.length === 0) return 0

  let delivered = 0
  const batches = chunk(eligible, BATCH_SIZE)

  for (const batch of batches) {
    // Notification per enquiry
    for (const enquiry of batch) {
      await createNotification(deps.notificationDb, {
        accountId,
        type: "enquiry_received",
        title: "New enquiry",
        body: "You have a new enquiry for your listing",
        link: `/dashboard/enquiries/${enquiry.enquiryId}`,
      })
    }

    // Batched email [S2 §5.3]
    await deps.emailService.send({
      to: `${accountId}@lookup`, // resolved by LoggingEmailService via accountId
      template: "enquiry_forwarded",
      data: { listingName, enquiryCount: batch.length },
      category: "enquiry_notification",
      accountId,
      listingId,
    })

    // Mark as forwarded
    const batchIds = batch.map((e) => e.id)
    await deps.db
      .update(pendingEnquiries)
      .set({ forwardedAt: now })
      .where(inArray(pendingEnquiries.id, batchIds))

    delivered += batch.length
  }

  return delivered
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
