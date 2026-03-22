// Shared listing ownership helpers for tRPC routers.

import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import type { Db } from "@/db/types"
import { listings } from "@/db/schema/data-and-listings"

/**
 * Fetch a listing by ID and verify the caller owns it.
 * Throws NOT_FOUND if missing, FORBIDDEN if not owned.
 */
export async function loadOwnedListing(db: Db, listingId: string, accountId: string) {
  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
  if (listing.accountId !== accountId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
  }
  return listing
}
