// Article 14 on-page notice lifecycle — S2 §11, AC-43
// Rendering flag check + claim-approval removal.
// AC-43: banner removed on claim approval (S3 handler), NOT on submission.

import { eq, and } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"

/** Check if listing should display the Article 14 on-page notice. */
export function shouldDisplayArticle14Notice(listing: {
  article14NoticeDisplayed: boolean
  source: string | null
  claimStatus: string
}): boolean {
  return (
    listing.article14NoticeDisplayed === true &&
    listing.source === "4rfv_import" &&
    listing.claimStatus !== "claimed" // persists during pending_review [S2-ST-6]
  )
}

/**
 * Remove Article 14 on-page notice on claim approval — AC-43.
 * Called by S3's claim_approved handler, not on claim submission.
 * Idempotent: no-op if already false.
 */
export async function removeArticle14Notice(
  db: Db,
  listingId: string,
): Promise<void> {
  await db
    .update(listings)
    .set({ article14NoticeDisplayed: false })
    .where(
      and(
        eq(listings.id, listingId),
        eq(listings.article14NoticeDisplayed, true),
      ),
    )
}
