// Profile page data loading — S6 §2.3
// Single-file data layer for the listing profile page.
// Uses direct DB queries (not tRPC) since this runs in a server component.

import { eq, asc, desc } from "drizzle-orm"
import { getDb } from "@/db"
import {
  listings,
  verifications,
  qualityScores,
  engagements,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
  credits,
  mediaItems,
  socialProfiles,
  accreditations,
} from "@/db/schema/data-and-listings"

export type ListingProfileResult = {
  listing: typeof listings.$inferSelect
  verification: typeof verifications.$inferSelect | null
  qualityScore: typeof qualityScores.$inferSelect | null
  engagement: typeof engagements.$inferSelect | null
  tags: { id: number; name: string }[]
  credits: typeof credits.$inferSelect[]
  media: typeof mediaItems.$inferSelect[]
  socialProfiles: { platform: string; url: string }[]
  accreditations: typeof accreditations.$inferSelect[]
}

export async function getProfileData(slug: string): Promise<ListingProfileResult | null> {
  const db = getDb()

  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1)

  if (!listing) return null

  const [verification] = await db
    .select()
    .from(verifications)
    .where(eq(verifications.listingId, listing.id))

  const [quality] = await db
    .select()
    .from(qualityScores)
    .where(eq(qualityScores.listingId, listing.id))

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.listingId, listing.id))

  // Taxonomy tags with resolved names
  const rawTags = await db
    .select({
      id: listingTaxonomyTags.id,
      specialisationName: taxonomySpecialisations.name,
      serviceAreaName: taxonomyServiceAreas.name,
    })
    .from(listingTaxonomyTags)
    .innerJoin(taxonomyServiceAreas, eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id))
    .leftJoin(taxonomySpecialisations, eq(listingTaxonomyTags.specialisationId, taxonomySpecialisations.id))
    .where(eq(listingTaxonomyTags.listingId, listing.id))

  const tags = rawTags.map((t) => ({
    id: t.id,
    name: t.specialisationName ?? t.serviceAreaName,
  }))

  // Portfolio media only, ordered by sortOrder
  const media = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.listingId, listing.id))
    .orderBy(asc(mediaItems.sortOrder))

  const listingCredits = await db
    .select()
    .from(credits)
    .where(eq(credits.listingId, listing.id))
    .orderBy(desc(credits.year))

  const socials = await db
    .select({ platform: socialProfiles.platform, url: socialProfiles.url })
    .from(socialProfiles)
    .where(eq(socialProfiles.listingId, listing.id))

  const accs = await db
    .select()
    .from(accreditations)
    .where(eq(accreditations.listingId, listing.id))

  return {
    listing,
    verification: verification ?? null,
    qualityScore: quality ?? null,
    engagement: engagement ?? null,
    tags,
    credits: listingCredits,
    media,
    socialProfiles: socials,
    accreditations: accs,
  }
}
