// onboarding_day14_prompt handler — S2 §7.4, AC-34, AC-48
// Creates in-app notification only if profile strength < 80% and listing is active.

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { computeFallbackProfileStrength } from "@/lib/onboarding/profile-strength"
import { createNotification } from "@/lib/notifications"
import type { Db } from "@/db/types"
import type { NotificationDb } from "@/lib/notifications"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

const PROFILE_STRENGTH_THRESHOLD = 80

export function registerDay14PromptHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; notificationDb: NotificationDb },
): void {
  registry.register("onboarding_day14_prompt", async (params) => {
    const { listingId, accountId } = params

    const [listing] = await deps.db
      .select({
        lifecycleStatus: listings.lifecycleStatus,
        headline: listings.headline,
        bio: listings.bio,
        headshotUrl: listings.headshotUrl,
        logoUrl: listings.logoUrl,
        websiteUrl: listings.websiteUrl,
        contactEmail: listings.contactEmail,
        entityType: listings.entityType,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing) return

    // AC-48: skip if listing inactive
    if (listing.lifecycleStatus !== "active") return

    // AC-34/AC-48: skip if profile strength >= 80%
    const strength = computeFallbackProfileStrength(listing)
    if (strength.percentage >= PROFILE_STRENGTH_THRESHOLD) return

    const topAction = strength.nextActions[0]?.label ?? "Add more details"

    await createNotification(deps.notificationDb, {
      accountId,
      type: "onboarding_prompt",
      title: "Your listing could be performing better",
      body: `Your profile is ${strength.percentage}% complete. ${topAction} to improve your visibility.`,
      link: `/dashboard/listing/${listingId}/edit`,
    })
  })
}
