// Profile view deduplication — S9 §1.4, AC-11
// Same viewer + same listing within 1 hour = single engagement count.

import { eq, and, gte, sql } from "drizzle-orm"
import { engagements } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"

export async function deduplicateProfileView(
  db: Db,
  listingId: string,
  viewerAccountId: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  // Anonymous viewers (null viewerAccountId) are always counted — no dedup possible
  if (!viewerAccountId) {
    await db
      .update(engagements)
      .set({
        profileViews: sql`${engagements.profileViews} + 1`,
        lastProfileViewAt: now,
        updatedAt: now,
      })
      .where(eq(engagements.listingId, listingId))
    return true
  }

  // Check for duplicate within 1-hour window
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const [existing] = await db
    .select({ listingId: engagements.listingId })
    .from(engagements)
    .where(
      and(
        eq(engagements.listingId, listingId),
        eq(engagements.lastViewerAccountId, viewerAccountId),
        gte(engagements.lastProfileViewAt, oneHourAgo),
      ),
    )
    .limit(1)

  if (existing) {
    return false // duplicate — skip increment
  }

  // Not a duplicate — increment counter and record viewer
  await db
    .update(engagements)
    .set({
      profileViews: sql`${engagements.profileViews} + 1`,
      lastProfileViewAt: now,
      lastViewerAccountId: viewerAccountId,
      updatedAt: now,
    })
    .where(eq(engagements.listingId, listingId))

  return true
}
