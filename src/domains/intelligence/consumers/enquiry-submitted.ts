// Intelligence consumer: enquiry_submitted — AC-100
// Analytics aggregation + quality calibration signal + outreach prioritisation.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import {
  recordQualityCalibrationSignal,
  updateProviderOutreachPrioritisation,
} from "./helpers"

export type EnquirySubmittedDeps = { db: Db }

export function enquirySubmittedHandler(deps: EnquirySubmittedDeps): EventHandler<"enquiry_submitted"> {
  return {
    domain: "intelligence",
    eventType: "enquiry_submitted",
    mode: "async",
    handler: async (event) => {
      // Quality calibration signal — enquiries validate quality score accuracy
      await recordQualityCalibrationSignal(deps.db, event.listingId, "enquiry")

      // Outreach prioritisation — enquiry volume indicates demand for unclaimed listings
      await updateProviderOutreachPrioritisation(deps.db, event.listingId)
    },
  }
}
