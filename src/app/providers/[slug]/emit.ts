// Profile view event emission — S6 §2.10, AC-18
// Isolated module so the event bus is not pulled into static builds.
// Called dynamically from page.tsx only during request-time rendering.
// Uses createProductionAppServices() to guarantee bus has all consumers registered.

import type { ProfileViewSource } from "@/domains/platform/buyer/infer-source"
import type { ProfileViewedEvent } from "@/lib/events/types"
import { createProductionAppServices } from "@/lib/services"

export async function emitProfileViewed(
  listingId: string,
  source: ProfileViewSource,
  viewerAccountId: string | null,
): Promise<void> {
  const { bus, waitUntilFn } = createProductionAppServices()
  const payload: ProfileViewedEvent = {
    _brand: "ProfileViewedEvent" as const,
    listingId,
    viewerAccountId,
    source,
    timestamp: new Date().toISOString(),
  }
  await bus.emit("profile_viewed", payload, waitUntilFn)
}
