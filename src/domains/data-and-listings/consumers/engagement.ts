// Engagement increment consumers — D&L §3.2
// profile_viewed → +1 profileViews, enquiry_submitted → +1 enquiriesReceived + pending enquiry

import { eq, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import { engagements, listings, pendingEnquiries } from "@/db/schema/data-and-listings"
import type { EventHandler } from "@/lib/events/types"

export function profileViewedHandler(db: Db): EventHandler<"profile_viewed"> {
  return {
    domain: "data-and-listings",
    eventType: "profile_viewed",
    mode: "async",
    handler: async (payload) => {
      await db
        .update(engagements)
        .set({
          profileViews: sql`${engagements.profileViews} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(engagements.listingId, payload.listingId))
    },
  }
}

export function enquirySubmittedHandler(db: Db): EventHandler<"enquiry_submitted"> {
  return {
    domain: "data-and-listings",
    eventType: "enquiry_submitted",
    mode: "async",
    handler: async (payload) => {
      await db
        .update(engagements)
        .set({
          enquiriesReceived: sql`${engagements.enquiriesReceived} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(engagements.listingId, payload.listingId))

      const [listing] = await db
        .select({ claimStatus: listings.claimStatus })
        .from(listings)
        .where(eq(listings.id, payload.listingId))
        .limit(1)

      if (listing?.claimStatus === "unclaimed") {
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 30)
        await db.insert(pendingEnquiries).values({
          listingId: payload.listingId,
          enquiryId: payload.enquiryId,
          expiresAt,
        })
      }
    },
  }
}
