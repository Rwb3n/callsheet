// Listing slug generation — S2 §3
// URL-safe, unique slug from listing name + random suffix.

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

export async function generateUniqueSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name)
  const candidate = `${base}-${randomSuffix()}`

  const [existing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.slug, candidate))
    .limit(1)

  // Collision astronomically unlikely with 6-char random suffix, but retry once if it happens
  if (existing) {
    return `${base}-${randomSuffix()}`
  }

  return candidate
}
