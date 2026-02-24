// Competing claim handling — S3 §6, §10
// dispute_escalation_check deferred action handler [AC-33, AC-34, AC-44, AC-47]

import { eq } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
// --- Dispute escalation handler [AC-33, AC-34, AC-44, AC-47] ---

export type DisputeEscalationDeps = {
  db: Db
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function registerDisputeEscalationHandler(
  registry: ActionHandlerRegistry,
  deps: DisputeEscalationDeps,
): void {
  registry.register("dispute_escalation_check", async (params) => {
    const { listingId } = params

    const [listing] = await deps.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))

    if (!listing) return

    // AC-33: no-op if dispute already resolved
    if (listing.claimStatus !== "disputed") return

    // AC-47: read actual lifecycleStatus (not hardcoded "active")
    const previousStatus = listing.lifecycleStatus

    // AC-34: suspend listing
    await deps.db.update(listings).set({
      lifecycleStatus: "suspended" as const,
      updatedAt: new Date(),
    }).where(eq(listings.id, listingId))

    // Emit listing_suspended with real previousStatus [AC-47]
    await deps.eventBus.emit("listing_suspended", {
      _brand: "ListingSuspendedEvent" as const,
      listingId,
      reason: "unresolved competing claim — escalated to principal",
      previousStatus,
    }, deps.waitUntilFn)
  })
}
