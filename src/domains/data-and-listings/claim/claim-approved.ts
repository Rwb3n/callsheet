// Post-approval pipeline — S3 §3, AC-11 through AC-20, AC-48
// Called after auto-approve (submitClaim) and manual approve (resolveManualReview CS-WORK-032).
// Steps: apply snapshot edits → update listing ownership → update verification →
//   deliver pending enquiries → schedule progressive disclosure → delete snapshot

import { eq } from "drizzle-orm"
import {
  listings,
  verifications,
  preClaimSnapshots,
  listingTaxonomyTags,
} from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler"
import type { DecisionLogDb } from "@/lib/decisions"
import { logDecision } from "@/lib/decisions"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"
import { removeArticle14Notice } from "@/lib/compliance/article14-notice"
import { scheduleClaimProgressiveDisclosure } from "@/lib/onboarding/schedule-claim-progressive-disclosure"
import { deliverPendingEnquiries } from "@/lib/onboarding/deliver-pending-enquiries"

export type ClaimApprovedDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  notificationDb: NotificationDb
}

type SnapshotData = {
  claimantAccountId: string
  originalListing: Record<string, unknown>
  pendingEdits: Record<string, unknown> | null
}

export async function onClaimApproved(
  deps: ClaimApprovedDeps,
  listingId: string,
  accountId: string,
  method: "auto" | "manual" | "disputed_resolved",
): Promise<{ pendingEnquiriesDelivered: number }> {

  // 1. Fetch snapshot and apply edits [AC-12]
  const [snapshot] = await deps.db
    .select()
    .from(preClaimSnapshots)
    .where(eq(preClaimSnapshots.listingId, listingId))

  if (snapshot) {
    const data = snapshot.snapshot as SnapshotData
    if (data.pendingEdits) {
      await applySnapshotEdits(deps.db, listingId, data.pendingEdits)
    }
  }

  // 2. Update listing: ownership + claim status + Article 14 [AC-11, AC-15]
  await deps.db.update(listings).set({
    accountId,
    claimStatus: "claimed" as const,
    updatedAt: new Date(),
  }).where(eq(listings.id, listingId))

  // Clear Article 14 banner [AC-15] — idempotent
  await removeArticle14Notice(deps.db, listingId)

  // 3. Update verification tier [AC-11]
  await deps.db.update(verifications).set({
    tier: "claimed" as const,
    claimedAt: new Date(),
  }).where(eq(verifications.listingId, listingId))

  // 4. Deliver pending enquiries [AC-13, AC-20, AC-48]
  const [listing] = await deps.db
    .select({ name: listings.name })
    .from(listings)
    .where(eq(listings.id, listingId))

  const pendingEnquiriesDelivered = await deliverPendingEnquiries(
    { db: deps.db, emailService: deps.emailService, notificationDb: deps.notificationDb },
    listingId,
    accountId,
    listing?.name ?? "Your listing",
  )

  // 5. Schedule claim-path progressive disclosure [AC-14]
  await scheduleClaimProgressiveDisclosure(deps.schedulerDb, {
    listingId,
    accountId,
  })

  // 6. Quality score recalculation [AC-16] — S9 provides real implementation.
  // At pre-S9, quality score recalculation is a no-op since the scoring dimensions
  // (verification, completeness) aren't wired yet. The verification tier change
  // will be picked up when S9's quality score system reads the verification table.

  // 7. Delete snapshot [AC-17]
  await deps.db
    .delete(preClaimSnapshots)
    .where(eq(preClaimSnapshots.listingId, listingId))

  // 8. Send approval email + notification [AC-19]
  await deps.emailService.send({
    to: `${accountId}@lookup`,
    template: "claim_approved",
    data: { listingName: listing?.name ?? "Your listing", listingId },
    category: "transactional",
    accountId,
    listingId,
  })

  await createNotification(deps.notificationDb, {
    accountId,
    type: "claim_approved",
    title: "Claim approved",
    body: `Your claim for ${listing?.name ?? "this listing"} has been approved. You can now manage your listing.`,
    link: `/dashboard/listings/${listingId}`,
  })

  // 9. Log post-processing decision [SI §9, S3-ST-10]
  await logDecision(deps.decisionLogDb, {
    domain: "data-and-listings",
    decisionType: "claim_post_processing",
    inputs: { listingId, method },
    output: { action: "approved", pendingEnquiriesDelivered },
    listingId,
    accountId,
  })

  return { pendingEnquiriesDelivered }
}

// Apply snapshot edits to listing — S3 §3.1 [AC-12]
// Edits validated at S2 submission time; S3 applies without re-validation.
// Taxonomy tag edits handled separately (array field, not listing column).
async function applySnapshotEdits(
  db: Db,
  listingId: string,
  edits: Record<string, unknown>,
): Promise<void> {
  const { taxonomyTags, ...columnEdits } = edits

  if (Object.keys(columnEdits).length > 0) {
    await db.update(listings).set({
      ...columnEdits,
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId))
  }

  if (Array.isArray(taxonomyTags) && taxonomyTags.length > 0) {
    // Replace tags: delete existing, insert new
    await db.delete(listingTaxonomyTags).where(
      eq(listingTaxonomyTags.listingId, listingId),
    )
    await db.insert(listingTaxonomyTags).values(
      taxonomyTags.map((tag: { sectorId: number; serviceAreaId: number; specialisationId?: number | null }) => ({
        listingId,
        sectorId: tag.sectorId,
        serviceAreaId: tag.serviceAreaId,
        specialisationId: tag.specialisationId ?? null,
      })),
    )
  }
}
