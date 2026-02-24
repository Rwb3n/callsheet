// Pre-claim snapshot cleanup handler — S2 §12, AC-45
// Deletes pre_claim_snapshots row after 90-day TTL. Idempotent.

import { eq } from "drizzle-orm"
import { preClaimSnapshots } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"

export function registerPreClaimSnapshotCleanup(
  registry: ActionHandlerRegistry,
  db: Db,
): void {
  registry.register("pre_claim_snapshot_cleanup", async (params) => {
    const { listingId } = params
    await db.delete(preClaimSnapshots).where(eq(preClaimSnapshots.listingId, listingId))
  })
}
