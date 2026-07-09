// Sitemap — CS-WORK-120 AC-1
// Dynamic sitemap from active listings + static pages.

import type { MetadataRoute } from "next"
import { getDb } from "@/db"
import { listings } from "@/db/schema/data-and-listings"
import { eq } from "drizzle-orm"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://callsheet.co.uk"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/quality-methodology`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ]

  // Dynamic listing profile pages
  const activeListings = await db
    .select({ slug: listings.slug, updatedAt: listings.updatedAt })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))

  const listingPages: MetadataRoute.Sitemap = activeListings.map((l) => ({
    url: `${BASE_URL}/providers/${l.slug}`,
    lastModified: l.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [...staticPages, ...listingPages]
}
