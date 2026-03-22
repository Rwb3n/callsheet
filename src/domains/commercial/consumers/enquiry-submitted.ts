// CR enquiry_submitted consumer — S8 §10.7, AC-76
// Fires first_enquiry conversion trigger via getEngagementCounters query-in-handler.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { EventHandler } from "@/lib/events/types"
import { listings } from "@/db/schema/data-and-listings"
import { getEngagementCounters } from "@/domains/data-and-listings/queries/engagement-counters"
import { commercialState } from "@/db/schema/commercial"
import { evaluateConversionTrigger, type ConversionTriggerDeps } from "../conversion-triggers"

export type EnquirySubmittedDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function enquirySubmittedHandler(
  deps: EnquirySubmittedDeps,
): EventHandler<"enquiry_submitted"> {
  return {
    domain: "commercial",
    eventType: "enquiry_submitted",
    mode: "async",
    handler: async (payload) => {
      const { listingId } = payload
      const { db } = deps

      // Read listing to check tier and accountId
      const [listing] = await db.select({
        subscriptionTier: listings.subscriptionTier,
        accountId: listings.accountId,
      })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1)

      if (!listing) return

      // AC-76: first_enquiry targets free-tier only
      if (listing.subscriptionTier !== "free") return
      if (listing.accountId === null) return // unclaimed listings cannot receive triggers

      // AC-76: Check if trigger already fired (maxFirings = 1)
      const [state] = await db.select()
        .from(commercialState)
        .where(eq(commercialState.listingId, listingId))
        .limit(1)

      if (state?.firstEnquiryTriggerFired) return

      // AC-76: Query-in-handler — D&L getEngagementCounters [CR-ST-20]
      const counters = await getEngagementCounters(db, listingId)

      if (counters.enquiriesReceived !== 1) return

      // Delegate to §1 evaluateConversionTrigger
      const triggerDeps: ConversionTriggerDeps = {
        db: deps.db,
        decisionLogDb: deps.decisionLogDb,
        emailService: deps.emailService,
        bus: deps.bus,
        waitUntilFn: deps.waitUntilFn,
      }

      const { result } = await evaluateConversionTrigger(
        "first_enquiry",
        listingId,
        listing.subscriptionTier,
        counters,
        triggerDeps,
      )

      // State update handled by evaluateConversionTrigger for fired triggers
      // If it didn't fire (e.g. already fired at state level), mark explicitly
      if (result.fired) {
        await db.insert(commercialState)
          .values({
            listingId,
            firstEnquiryTriggerFired: true,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: commercialState.listingId,
            set: {
              firstEnquiryTriggerFired: true,
              updatedAt: new Date(),
            },
          })
      }
    },
  }
}
