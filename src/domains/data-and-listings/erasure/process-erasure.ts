// processErasure — S10 §2, D&L CD §6
// GDPR right-to-erasure data operation. Single PostgreSQL transaction covers:
// Phase A: dispute resolution, Phase B: listing processing, Phase C: account data deletion.
// R2 cleanup and quality recalculation run post-transaction.

import { eq, and, inArray, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { ObjectStorageService } from "@/lib/storage/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import {
  listings,
  verifications,
  preClaimSnapshots,
} from "@/db/schema/data-and-listings"
import {
  enrichmentSchedules,
  decaySignals,
  perceptionAggregates,
} from "@/db/schema/intelligence"
import { accountProfiles, enquiryRecords, shortlists, shortlistItems, savedSearches, searchHistory } from "@/db/schema/accounts"
import { session } from "@/db/schema/auth"

// --- Types ---

export type ProcessErasureResult = {
  listingIdsDeleted: string[]
  listingIdsAnonymised: string[]
  freelancerListingsDeleted: number
  companyListingsAnonymised: number
  r2ObjectsDeleted: number
  qualityRecalcScheduled: number
}

// --- Pre-transaction query (AC-22) ---

export async function getClaimIdsForAccount(
  db: Db,
  accountId: string,
): Promise<string[]> {
  // Capture claim IDs BEFORE the transaction deletes snapshots.
  // These are pre_claim_snapshots where the erasing account is the claimant.
  const rows = await db
    .select({ listingId: preClaimSnapshots.listingId })
    .from(preClaimSnapshots)
    .where(
      sql`${preClaimSnapshots.snapshot}->>'claimantAccountId' = ${accountId}`,
    )
  return rows.map((r) => r.listingId)
}

// --- Phase A: Dispute Resolution (AC-11, AC-12, AC-13) ---

async function resolveDisputes(
  tx: Db,
  accountId: string,
): Promise<void> {
  // A1: Listings owned by erasing account that are currently disputed.
  // Someone is challenging the erasing account's ownership.
  const disputedOwned = await tx
    .select({
      id: listings.id,
    })
    .from(listings)
    .where(
      and(
        eq(listings.accountId, accountId),
        eq(listings.claimStatus, "disputed"),
      ),
    )

  if (disputedOwned.length > 0) {
    const disputedListingIds = disputedOwned.map((l) => l.id)

    // Batch-fetch competing claimant snapshots
    const snapshots = await tx
      .select({
        listingId: preClaimSnapshots.listingId,
        snapshot: preClaimSnapshots.snapshot,
      })
      .from(preClaimSnapshots)
      .where(inArray(preClaimSnapshots.listingId, disputedListingIds))

    const snapshotMap = new Map(snapshots.map((s) => [s.listingId, s.snapshot]))

    for (const listing of disputedOwned) {
      const snapshot = snapshotMap.get(listing.id) as
        | { claimantAccountId: string }
        | undefined
      if (!snapshot) continue // safety — should not occur

      const competingClaimantId = snapshot.claimantAccountId

      // Auto-resolve in favour of competing claimant (AC-11).
      // Chain termination (AC-13): resolve only the immediate dispute.
      // If the competing claimant's own claim is also disputed, that continues independently.
      await tx
        .update(listings)
        .set({ claimStatus: "claimed", accountId: competingClaimantId })
        .where(eq(listings.id, listing.id))
    }
  }

  // A2: Listings where erasing account is the competing claimant.
  // Erasing account filed a dispute against someone else's listing.
  const competingSnapshots = await tx
    .select({
      listingId: preClaimSnapshots.listingId,
    })
    .from(preClaimSnapshots)
    .where(
      sql`${preClaimSnapshots.snapshot}->>'claimantAccountId' = ${accountId}`,
    )

  for (const snapshot of competingSnapshots) {
    // Withdraw the competing claim — restore listing to "claimed" for existing owner (AC-12)
    await tx
      .update(listings)
      .set({ claimStatus: "claimed" })
      .where(eq(listings.id, snapshot.listingId))

    // Delete the pre_claim_snapshot for this withdrawn claim
    await tx
      .delete(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, snapshot.listingId))
  }
}

// --- Phase B: Process Owned Listings (AC-14, AC-15, AC-16) ---

async function anonymiseCompanyListing(
  tx: Db,
  listingId: string,
): Promise<void> {
  // Anonymise listing — remove personal data, revert ownership (AC-15)
  await tx
    .update(listings)
    .set({
      accountId: null,
      claimStatus: "unclaimed",
      contactEmail: null,
      contactPhone: null,
    })
    .where(eq(listings.id, listingId))

  // Revert verification tier to unclaimed
  await tx
    .update(verifications)
    .set({
      tier: "unclaimed",
      verifiedAt: null,
      verificationMethods: null,
    })
    .where(eq(verifications.listingId, listingId))

  // Delete intelligence data tied to previous owner's engagement (AC-16)
  // These tables have onDelete: "cascade" from listings, but listing is NOT deleted
  await tx
    .delete(preClaimSnapshots)
    .where(eq(preClaimSnapshots.listingId, listingId))

  await tx
    .delete(enrichmentSchedules)
    .where(eq(enrichmentSchedules.listingId, listingId))

  await tx
    .delete(decaySignals)
    .where(eq(decaySignals.listingId, listingId))

  await tx
    .delete(perceptionAggregates)
    .where(eq(perceptionAggregates.listingId, listingId))
}

async function processListings(
  tx: Db,
  accountId: string,
): Promise<{ deleted: string[]; anonymised: string[] }> {
  // Query all listings still owned by erasing account (after dispute resolution)
  const ownedListings = await tx
    .select({
      id: listings.id,
      entityType: listings.entityType,
    })
    .from(listings)
    .where(eq(listings.accountId, accountId))

  const freelancerIds = ownedListings
    .filter((l) => l.entityType === "freelancer")
    .map((l) => l.id)

  const companyListings = ownedListings.filter(
    (l) => l.entityType !== "freelancer",
  )

  // B1: Freelancer listings — full delete (AC-14)
  // FK cascades handle all child tables (16+ with onDelete: "cascade")
  if (freelancerIds.length > 0) {
    await tx.delete(listings).where(inArray(listings.id, freelancerIds))
  }

  // B2: Company listings — anonymise individually (AC-15, AC-16)
  for (const listing of companyListings) {
    await anonymiseCompanyListing(tx, listing.id)
  }

  return {
    deleted: freelancerIds,
    anonymised: companyListings.map((l) => l.id),
  }
}

// --- Phase C: Account Personal Data Deletion (AC-17) ---

async function deleteAccountData(
  tx: Db,
  accountId: string,
): Promise<void> {
  // C1: Anonymise account profile (preserve row for FK integrity)
  await tx
    .update(accountProfiles)
    .set({
      fullName: "Deleted User",
      emailPreferences: {
        enquiry_notification: false,
        listing_status: false,
        profile_nudge: false,
        conversion_marketing: false,
      },
    })
    .where(eq(accountProfiles.accountId, accountId))

  // C2: Delete buyer-side enquiry records
  // senderAccountId has onDelete: "set null" (not cascade) — explicit delete
  await tx
    .delete(enquiryRecords)
    .where(eq(enquiryRecords.senderAccountId, accountId))

  // C3: Delete shortlists + shortlist_items
  // Not deleting user row, so onDelete: "cascade" from user doesn't fire
  const accountShortlists = await tx
    .select({ id: shortlists.id })
    .from(shortlists)
    .where(eq(shortlists.accountId, accountId))

  const shortlistIds = accountShortlists.map((s) => s.id)
  if (shortlistIds.length > 0) {
    await tx
      .delete(shortlistItems)
      .where(inArray(shortlistItems.shortlistId, shortlistIds))
  }
  await tx.delete(shortlists).where(eq(shortlists.accountId, accountId))

  // C4: Delete saved searches
  await tx.delete(savedSearches).where(eq(savedSearches.accountId, accountId))

  // C5: Delete search history
  await tx.delete(searchHistory).where(eq(searchHistory.accountId, accountId))

  // C6: Delete auth sessions (Better Auth — same PG database)
  await tx.delete(session).where(eq(session.userId, accountId))
}

// --- Transaction wrapper (AC-18) ---

export async function processErasureTransaction(
  db: Db,
  accountId: string,
): Promise<{
  listingIdsDeleted: string[]
  listingIdsAnonymised: string[]
  freelancerListingsDeleted: number
  companyListingsAnonymised: number
}> {
  return db.transaction(async (tx) => {
    // Phase A: Resolve active disputes
    await resolveDisputes(tx, accountId)

    // Phase B: Process owned listings
    const listingResults = await processListings(tx, accountId)

    // Phase C: Delete account personal data
    await deleteAccountData(tx, accountId)

    return {
      listingIdsDeleted: listingResults.deleted,
      listingIdsAnonymised: listingResults.anonymised,
      freelancerListingsDeleted: listingResults.deleted.length,
      companyListingsAnonymised: listingResults.anonymised.length,
    }
  })
}

// --- R2 Cleanup (AC-19) ---

export async function processErasureR2Cleanup(
  storage: ObjectStorageService,
  listingIdsDeleted: string[],
  claimIdsForR2Cleanup: string[],
): Promise<{ objectsDeleted: number }> {
  let totalDeleted = 0

  // R2-1: Delete images for freelancer listings
  for (const listingId of listingIdsDeleted) {
    const result = await storage.deleteByPrefix(
      `listings/${listingId}/images/`,
    )
    totalDeleted += result.deleted
  }

  // R2-2: Delete claim evidence for claims filed by this account
  for (const claimId of claimIdsForR2Cleanup) {
    const result = await storage.deleteByPrefix(
      `claims/${claimId}/evidence/`,
    )
    totalDeleted += result.deleted
  }

  return { objectsDeleted: totalDeleted }
}

// --- Quality Score Recalculation Scheduling (AC-21) ---

export async function scheduleQualityRecalculations(
  schedulerDb: SchedulerDb,
  listingIdsAnonymised: string[],
): Promise<number> {
  for (const listingId of listingIdsAnonymised) {
    await scheduleDeferredAction(schedulerDb, {
      action: "quality_score_recalculation",
      params: { listingId },
      executeAt: new Date(),
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      createdBy: "process_erasure.quality_recalc",
    })
  }
  return listingIdsAnonymised.length
}
