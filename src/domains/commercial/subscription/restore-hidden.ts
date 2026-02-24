// Re-upgrade visibility restoration — CR §2.5, S4 §5.2
// Restores hidden media/credits up to new tier limit. [AC-23]

import { eq, and, asc, inArray } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { mediaItems, credits } from "@/db/schema/data-and-listings"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import type { Db } from "@/db/types"
import type { SubscriptionTier } from "@/lib/events/types"

type RestoreHiddenResult = {
  restoredMediaCount: number
  restoredCreditCount: number
}

export async function restoreHiddenItems(
  db: Db,
  listingId: string,
  newTier: SubscriptionTier,
): Promise<RestoreHiddenResult> {
  const newLimits = TIER_LIMITS[newTier]

  const restoredMediaCount = await restoreForTable(db, mediaItems, listingId, newLimits.maxMedia)
  const restoredCreditCount = await restoreForTable(db, credits, listingId, newLimits.maxCredits)

  return { restoredMediaCount, restoredCreditCount }
}

async function restoreForTable(
  db: Db,
  table: typeof mediaItems | typeof credits,
  listingId: string,
  limit: number | "unlimited",
): Promise<number> {
  if (limit === "unlimited") {
    // Restore all hidden items
    const result = await db
      .update(table)
      .set({ visibility: "visible" })
      .where(and(eq(table.listingId, listingId), eq(table.visibility, "hidden")))
      .returning({ id: table.id })
    return result.length
  }

  // Count currently visible
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.listingId, listingId), eq(table.visibility, "visible")))

  const canRestore = limit - count
  if (canRestore <= 0) return 0

  // Restore oldest hidden items first (FIFO)
  const hidden = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.listingId, listingId), eq(table.visibility, "hidden")))
    .orderBy(asc(table.createdAt))
    .limit(canRestore)

  if (hidden.length === 0) return 0

  await db
    .update(table)
    .set({ visibility: "visible" })
    .where(inArray(table.id, hidden.map((r) => r.id)))

  return hidden.length
}
