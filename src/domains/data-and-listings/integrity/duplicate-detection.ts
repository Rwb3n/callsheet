// Rule 1: Duplicate detection — S1 §6, AC-27
// >80% taxonomy overlap to same-account listing → flag_duplicate

import { eq, and, ne } from "drizzle-orm"
import type { Db } from "@/db/types"
import { listings, listingTaxonomyTags } from "@/db/schema/data-and-listings"
import { computeTaxonomyOverlap } from "../taxonomy/overlap"
import type { IntegrityResult, TaxonomyTag } from "./types"

const OVERLAP_THRESHOLD = 0.8

export async function checkDuplicate(
  input: { accountId: string; tags: TaxonomyTag[]; excludeListingId?: string },
  db: Db,
): Promise<IntegrityResult> {
  if (input.tags.length === 0) return { action: "allow" }

  const conditions = [eq(listings.accountId, input.accountId)]
  if (input.excludeListingId) {
    conditions.push(ne(listings.id, input.excludeListingId))
  }

  const accountListings = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(...conditions))

  for (const existing of accountListings) {
    const existingTags = await db
      .select({
        sectorId: listingTaxonomyTags.sectorId,
        serviceAreaId: listingTaxonomyTags.serviceAreaId,
        specialisationId: listingTaxonomyTags.specialisationId,
      })
      .from(listingTaxonomyTags)
      .where(eq(listingTaxonomyTags.listingId, existing.id))

    const overlap = computeTaxonomyOverlap(input.tags, existingTags)
    if (overlap > OVERLAP_THRESHOLD) {
      return {
        action: "flag_duplicate",
        reasons: [`>${OVERLAP_THRESHOLD * 100}% taxonomy overlap with listing ${existing.id} (${(overlap * 100).toFixed(0)}%)`],
        existingListingId: existing.id,
      }
    }
  }

  return { action: "allow" }
}
