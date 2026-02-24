// Pending cancellation registry CRUD — Ops §5, S4 §1.3
// Stores cancellation reason attribution for Paddle webhook lookup.

import { eq, lt } from "drizzle-orm"
import { pendingCancellations } from "@/db/schema/operations"
import type { Db } from "@/db/types"

const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function storePendingCancellation(
  db: Db,
  params: { paddleSubscriptionId: string; listingId: string; reason: string },
): Promise<void> {
  await db.insert(pendingCancellations).values(params)
}

export async function lookupPendingCancellation(
  db: Db,
  paddleSubscriptionId: string,
): Promise<{ listingId: string; reason: string } | null> {
  const rows = await db
    .select({ listingId: pendingCancellations.listingId, reason: pendingCancellations.reason })
    .from(pendingCancellations)
    .where(eq(pendingCancellations.paddleSubscriptionId, paddleSubscriptionId))
    .limit(1)
  return rows[0] ?? null
}

export async function cleanupStalePendingCancellations(db: Db): Promise<void> {
  await db
    .delete(pendingCancellations)
    .where(lt(pendingCancellations.createdAt, new Date(Date.now() - CLEANUP_AGE_MS)))
}
