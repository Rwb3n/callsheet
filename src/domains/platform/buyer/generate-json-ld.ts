// JSON-LD structured data — S6 §2.8, AC-17
// LocalBusiness for companies, Person for freelancers. [SI §7.3]

type ListingForJsonLd = {
  slug: string
  name: string
  entityType: string
  headline: string | null
  bio: string | null
  logoUrl: string | null
  headshotUrl: string | null
  websiteUrl: string | null
  contactPhone: string | null
  baseRegion: string | null
  foundedYear: number | null
  socialProfiles: { platform: string; url: string }[]
  taxonomyTags: string[]
}

type JsonLdObject = Record<string, unknown>

const CANONICAL_BASE = "https://callsheet.co.uk"

export function generateJsonLd(listing: ListingForJsonLd): JsonLdObject {
  const canonical = `${CANONICAL_BASE}/providers/${listing.slug}`
  const image = listing.logoUrl ?? listing.headshotUrl ?? null
  const sameAs = listing.socialProfiles.map((sp) => sp.url)
  if (listing.websiteUrl) sameAs.unshift(listing.websiteUrl)

  if (listing.entityType === "freelancer") {
    return buildPerson(listing, canonical, image, sameAs)
  }

  return buildLocalBusiness(listing, canonical, image, sameAs)
}

function buildLocalBusiness(
  listing: ListingForJsonLd,
  canonical: string,
  image: string | null,
  sameAs: string[],
): JsonLdObject {
  const ld: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    url: canonical,
  }

  if (listing.bio) ld.description = listing.bio
  if (image) ld.image = image
  if (listing.contactPhone) ld.telephone = listing.contactPhone
  if (listing.baseRegion) ld.address = { "@type": "PostalAddress", addressRegion: listing.baseRegion }
  if (listing.foundedYear) ld.foundingDate = String(listing.foundedYear)
  if (sameAs.length > 0) ld.sameAs = sameAs

  return ld
}

function buildPerson(
  listing: ListingForJsonLd,
  canonical: string,
  image: string | null,
  sameAs: string[],
): JsonLdObject {
  const ld: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: listing.name,
    url: canonical,
  }

  if (listing.bio) ld.description = listing.bio
  if (image) ld.image = image
  if (listing.headline) ld.jobTitle = listing.headline
  if (listing.contactPhone) ld.telephone = listing.contactPhone
  if (listing.taxonomyTags.length > 0) ld.knowsAbout = listing.taxonomyTags
  if (sameAs.length > 0) ld.sameAs = sameAs

  return ld
}
