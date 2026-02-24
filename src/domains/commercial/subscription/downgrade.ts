// Downgrade data handling — CR §2.5, S4 §5.1
// Hides excess media/credits on tier downgrade. Never deletes.
// Note: spec pseudocode shows subscription_tier_changed emission here.
// In implementation, the webhook handler (CS-WORK-039) emits the event
// after calling applyDowngrade — this function is a side-effect, not an emitter.

import { eq, and, desc, sql, inArray } from "drizzle-orm"
import { listings, mediaItems, credits } from "@/db/schema/data-and-listings"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import { createNotification, type NotificationDb } from "@/lib/notifications"
import type { Db } from "@/db/types"
import type { SubscriptionTier } from "@/lib/events/types"

type ApplyDowngradeParams = {
  listingId: string
  previousTier: SubscriptionTier
  newTier: SubscriptionTier
  suppressNotification?: boolean // true when called from finaliseSubscriptionEnd [S4-ST-8]
}

export type ApplyDowngradeDeps = {
  db: Db
  notificationDb: NotificationDb
}

type DowngradeResult = {
  hiddenMediaCount: number
  hiddenCreditCount: number
}

export async function applyDowngrade(
  deps: ApplyDowngradeDeps,
  params: ApplyDowngradeParams,
): Promise<DowngradeResult> {
  const { db, notificationDb } = deps
  const { listingId, newTier } = params
  const newLimits = TIER_LIMITS[newTier]

  const [listing] = await db
    .select({ accountId: listings.accountId, name: listings.name })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)
  if (!listing) throw new Error(`Listing ${listingId} not found`)

  // Hide excess media — keep newest N visible, hide the rest [AC-20]
  const hiddenMediaCount = await hideExcess(db, mediaItems, listingId, newLimits.maxMedia)

  // Hide excess credits — keep newest N visible, hide the rest [AC-21]
  const hiddenCreditCount = await hideExcess(db, credits, listingId, newLimits.maxCredits)

  // Notification with hidden item counts [AC-25, S4-ST-8]
  if (!params.suppressNotification && listing.accountId) {
    let body = `Your listing ${listing.name} is now on the ${newTier} tier.`
    if (hiddenMediaCount > 0) body += ` ${hiddenMediaCount} media items are now hidden from search.`
    if (hiddenCreditCount > 0) body += ` ${hiddenCreditCount} credits are now hidden.`

    await createNotification(notificationDb, {
      accountId: listing.accountId,
      type: "subscription_ending",
      title: "Subscription changed",
      body,
      link: `/dashboard/listings/${listingId}/subscription`,
    })
  }

  return { hiddenMediaCount, hiddenCreditCount }
}

// Shared hiding logic for media_items and credits.
// Both tables have { id, listingId, visibility, createdAt } columns.
async function hideExcess(
  db: Db,
  table: typeof mediaItems | typeof credits,
  listingId: string,
  limit: number | "unlimited",
): Promise<number> {
  if (limit === "unlimited") return 0
  if (typeof limit !== "number") return 0

  // Fetch all visible items, newest first
  const visible = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.listingId, listingId), eq(table.visibility, "visible")))
    .orderBy(desc(table.createdAt))

  if (visible.length <= limit) return 0

  // Items beyond the limit get hidden [AC-22: NOT deleted]
  const excessIds = visible.slice(limit).map((r) => r.id)
  await db
    .update(table)
    .set({ visibility: "hidden" })
    .where(inArray(table.id, excessIds))

  return excessIds.length
}
