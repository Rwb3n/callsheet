// send_progressive_email handler — S2 §7, AC-32, AC-33, AC-35
// Sends profile nudge email if listing is active and target action is incomplete.
// Preference enforcement (AC-35) is handled by EmailService.send() — callers don't check.

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import { isProgressiveActionComplete } from "@/lib/onboarding/progressive-check"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

export function registerProgressiveEmailHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; emailService: EmailService },
): void {
  registry.register("send_progressive_email", async (params) => {
    const { listingId, template, accountId } = params

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
        name: listings.name,
        slug: listings.slug,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing) return

    // AC-33: skip if listing no longer active
    if (listing.lifecycleStatus !== "active") return

    // AC-32: skip if target action already complete
    if (isProgressiveActionComplete(listing, template)) return

    // Resolve account email for delivery
    const [account] = await deps.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, accountId))
      .limit(1)

    if (!account) return

    // AC-35: profile_nudge preference enforced by EmailService.send()
    await deps.emailService.send({
      to: account.email,
      template: template as "profile_day1" | "profile_day3" | "profile_day7",
      data: { name: listing.name, slug: listing.slug },
      category: "profile_nudge",
      accountId,
      listingId,
    })
  })
}
