// Intelligence consumer: shortlist_added — AC-97
// Records quality calibration perception signal.

import type { Db } from "@/db/types"
import type { EventHandler } from "@/lib/events/types"
import { recordQualityCalibrationSignal } from "./helpers"

export type ShortlistAddedDeps = { db: Db }

export function shortlistAddedHandler(deps: ShortlistAddedDeps): EventHandler<"shortlist_added"> {
  return {
    domain: "intelligence",
    eventType: "shortlist_added",
    mode: "async",
    handler: async (event) => {
      await recordQualityCalibrationSignal(deps.db, event.listingId, "shortlist")
    },
  }
}
