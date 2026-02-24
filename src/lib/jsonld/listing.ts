// JSON-LD structured data — S1 §7, AC-32 (Person), AC-33 (LocalBusiness)
// No aggregateRating at V1 (no reviews). [S0-14]

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export type ListingForJsonLd = {
  entityType: string
  name: string
  slug: string
  headline: string | null
  bio: string | null
  logoUrl: string | null
  headshotUrl: string | null
  baseRegion: string | null
  foundedYear: number | null
  socialProfiles: Array<{ url: string }>
}

type PostalAddress = {
  "@type": "PostalAddress"
  addressRegion: string
  addressCountry: "GB"
}

type PersonJsonLd = {
  "@context": "https://schema.org"
  "@type": "Person"
  name: string
  jobTitle?: string
  description?: string
  url: string
  image?: string
  address?: PostalAddress
  sameAs?: string[]
}

type LocalBusinessJsonLd = {
  "@context": "https://schema.org"
  "@type": "LocalBusiness"
  name: string
  description?: string
  url: string
  image?: string
  address?: PostalAddress
  foundingDate?: string
  sameAs?: string[]
}

type JsonLd = PersonJsonLd | LocalBusinessJsonLd

export function generateListingJsonLd(listing: ListingForJsonLd): JsonLd {
  const url = `${BASE_URL}/listing/${listing.slug}`
  const address: PostalAddress | undefined = listing.baseRegion
    ? { "@type": "PostalAddress", addressRegion: listing.baseRegion, addressCountry: "GB" }
    : undefined
  const sameAs = listing.socialProfiles.length > 0
    ? listing.socialProfiles.map((sp) => sp.url)
    : undefined

  if (listing.entityType === "freelancer") {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      name: listing.name,
      jobTitle: listing.headline ?? undefined,
      description: listing.bio ?? undefined,
      url,
      image: listing.headshotUrl ?? listing.logoUrl ?? undefined,
      address,
      sameAs,
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    description: listing.bio ?? undefined,
    url,
    image: listing.logoUrl ?? undefined,
    address,
    foundingDate: listing.foundedYear?.toString(),
    sameAs,
  }
}
