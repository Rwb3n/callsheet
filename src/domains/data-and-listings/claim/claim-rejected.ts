// Rejection pipeline — S3 §4, AC-21 through AC-25
// Branches on current claimStatus:
//   disputed → "claimed" (existing claimant upheld, new claimant rejected) [AC-25]
//   pending_review → "unclaimed" (releases for future claims) [AC-21]
// Snapshot deleted, edits discarded [AC-22]

import { eq } from "drizzle-orm"
import { listings, preClaimSnapshots } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions"
import { logDecision } from "@/lib/decisions"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"

export type ClaimRejectedDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  notificationDb: NotificationDb
}

export async function onClaimRejected(
  deps: ClaimRejectedDeps,
  listingId: string,
  claimantAccountId: string,
  reasons: string[],
  currentClaimStatus: string,
): Promise<void> {

  // 1. Reset claimStatus — branch on current state [AC-21, AC-25]
  const newClaimStatus = currentClaimStatus === "disputed" ? "claimed" : "unclaimed"
  await deps.db.update(listings).set({
    claimStatus: newClaimStatus as "claimed" | "unclaimed",
    updatedAt: new Date(),
  }).where(eq(listings.id, listingId))

  // 2. Delete snapshot — edits discarded [AC-22]
  await deps.db
    .delete(preClaimSnapshots)
    .where(eq(preClaimSnapshots.listingId, listingId))

  // 3. Send rejection email [AC-24]
  const [listing] = await deps.db
    .select({ name: listings.name })
    .from(listings)
    .where(eq(listings.id, listingId))

  const reason = reasons.join("; ")

  await deps.emailService.send({
    to: `${claimantAccountId}@lookup`,
    template: "claim_rejected",
    data: { listingName: listing?.name ?? "the listing", reason },
    category: "transactional",
    accountId: claimantAccountId,
    listingId,
  })

  await createNotification(deps.notificationDb, {
    accountId: claimantAccountId,
    type: "claim_rejected",
    title: "Claim not approved",
    body: `Your claim was not approved: ${reason}`,
    link: `/dashboard`,
  })

  // 4. Log decision
  await logDecision(deps.decisionLogDb, {
    domain: "data-and-listings",
    decisionType: "claim_post_processing",
    inputs: { listingId, claimantAccountId, previousClaimStatus: currentClaimStatus },
    output: { action: "rejected", newClaimStatus, reasons },
    listingId,
    accountId: claimantAccountId,
  })
}
