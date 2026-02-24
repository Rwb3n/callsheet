// AC-32, AC-33: JSON-LD generation unit tests

import { describe, it, expect } from "vitest"
import { generateListingJsonLd } from "../listing"
import type { ListingForJsonLd } from "../listing"

function baseListing(overrides: Partial<ListingForJsonLd> = {}): ListingForJsonLd {
  return {
    entityType: "company",
    name: "Alpha Productions Ltd",
    slug: "alpha-productions",
    headline: "Award-winning production company",
    bio: "We make films.",
    logoUrl: "https://cdn.example.com/logo.png",
    headshotUrl: null,
    baseRegion: "London",
    foundedYear: 2015,
    socialProfiles: [{ url: "https://linkedin.com/company/alpha" }],
    ...overrides,
  }
}

describe("generateListingJsonLd", () => {
  // AC-32: Freelancer → Person
  it("generates valid Person JSON-LD for freelancer", () => {
    const result = generateListingJsonLd(baseListing({
      entityType: "freelancer",
      name: "Jane Doe",
      slug: "jane-doe",
      headline: "Cinematographer",
      bio: "15 years experience.",
      headshotUrl: "https://cdn.example.com/headshot.jpg",
      logoUrl: "https://cdn.example.com/logo.png",
      baseRegion: "Manchester",
      foundedYear: null,
      socialProfiles: [{ url: "https://imdb.com/name/nm0001" }],
    }))

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("Person")
    expect(result.name).toBe("Jane Doe")
    expect((result as { jobTitle?: string }).jobTitle).toBe("Cinematographer")
    expect(result.description).toBe("15 years experience.")
    expect(result.url).toContain("/listing/jane-doe")
    // Prefers headshot over logo for freelancers
    expect(result.image).toBe("https://cdn.example.com/headshot.jpg")
    expect(result.address).toEqual({
      "@type": "PostalAddress",
      addressRegion: "Manchester",
      addressCountry: "GB",
    })
    expect(result.sameAs).toEqual(["https://imdb.com/name/nm0001"])
  })

  // AC-33: Company → LocalBusiness
  it("generates valid LocalBusiness JSON-LD for company", () => {
    const result = generateListingJsonLd(baseListing())

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("LocalBusiness")
    expect(result.name).toBe("Alpha Productions Ltd")
    expect(result.url).toContain("/listing/alpha-productions")
    expect(result.image).toBe("https://cdn.example.com/logo.png")
    expect((result as { foundingDate?: string }).foundingDate).toBe("2015")
    expect(result.address).toEqual({
      "@type": "PostalAddress",
      addressRegion: "London",
      addressCountry: "GB",
    })
    expect(result.sameAs).toEqual(["https://linkedin.com/company/alpha"])
  })

  it("omits address when baseRegion is null", () => {
    const result = generateListingJsonLd(baseListing({ baseRegion: null }))
    expect(result.address).toBeUndefined()
  })

  it("omits sameAs when no social profiles", () => {
    const result = generateListingJsonLd(baseListing({ socialProfiles: [] }))
    expect(result.sameAs).toBeUndefined()
  })

  it("treats non-freelancer entity types as LocalBusiness", () => {
    for (const type of ["education", "industry_body", "public_sector", "non_profit"]) {
      const result = generateListingJsonLd(baseListing({ entityType: type }))
      expect(result["@type"]).toBe("LocalBusiness")
    }
  })

  it("freelancer falls back to logoUrl when headshotUrl is null", () => {
    const result = generateListingJsonLd(baseListing({
      entityType: "freelancer",
      headshotUrl: null,
      logoUrl: "https://cdn.example.com/logo.png",
    }))
    expect(result.image).toBe("https://cdn.example.com/logo.png")
  })
})
