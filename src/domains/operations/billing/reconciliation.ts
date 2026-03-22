// billing_reconciliation handler — S7 §4.1, CS-WORK-059
// Self-perpetuating daily deferred action: fetches Paddle subscriptions,
// compares with local DB, creates 48h holds for mismatches, emits
// subscription_ended for expired holds with no pending_cancellation.

import { eq, and, ne, isNotNull, sql } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { billingHolds, billingReconciliationStatus, pendingCancellations } from "@/db/schema/operations"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import type { PaymentService } from "@/lib/services/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications"
import { countActiveHolds } from "./queries"

const ANOMALY_THRESHOLD = 0.10
const HOLD_DURATION_MS = 48 * 60 * 60 * 1000
const SELF_PERPETUATE_MS = 24 * 60 * 60 * 1000

export type ReconciliationDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  notificationDb: NotificationDb
  payment: PaymentService
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  adminAccountId: string
}

export async function handleBillingReconciliation(deps: ReconciliationDeps): Promise<void> {
  const now = new Date()

  // Step 0+1: Fetch Paddle active subscriptions and local active subscriptions
  const paddleSubscriptions = await deps.payment.listAllActiveSubscriptions()

  const localActive = await deps.db
    .select({
      id: listings.id,
      accountId: listings.accountId,
      subscriptionTier: listings.subscriptionTier,
      paddleSubscriptionId: listings.paddleSubscriptionId,
    })
    .from(listings)
    .where(
      and(
        ne(listings.subscriptionTier, "free"),
        isNotNull(listings.paddleSubscriptionId),
      ),
    )

  // Step 2: Identify mismatches — local active but not in Paddle
  const paddleIds = new Set(paddleSubscriptions.map((s) => s.id))
  const localMissing = localActive.filter((ls) => !paddleIds.has(ls.paddleSubscriptionId!))

  // Step 3: Anomaly detection — halt if >= 10%
  if (localActive.length > 0 && localMissing.length / localActive.length >= ANOMALY_THRESHOLD) {
    await handleAnomaly(deps, now, localMissing.length, localActive.length, paddleSubscriptions.length)
    return
  }

  // Step 4: Process each mismatch
  let holdsCreated = 0
  let holdsExpired = 0

  for (const ls of localMissing) {
    const [existingHold] = await deps.db
      .select()
      .from(billingHolds)
      .where(eq(billingHolds.listingId, ls.id))
      .limit(1)

    if (!existingHold) {
      await createHold(deps, ls, now)
      holdsCreated++
    } else if (existingHold.expiresAt <= now) {
      const emitted = await processExpiredHold(deps, ls, existingHold, now)
      if (emitted) holdsExpired++
      // Clean up expired hold
      await deps.db.delete(billingHolds).where(eq(billingHolds.id, existingHold.id))
      holdsExpired++
    }
    // else: hold still active — skip
  }

  // Step 5: Reverse mismatches — Paddle active, no local record
  for (const ps of paddleSubscriptions) {
    const hasLocal = localActive.some((l) => l.paddleSubscriptionId === ps.id)
    if (!hasLocal) {
      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "billing_anomaly",
        title: "Paddle-only subscription",
        body: `Paddle subscription ${ps.id} has no matching local record`,
        link: "/admin/billing",
      })
    }
  }

  // Step 6: Upsert reconciliation status
  const activeHoldCount = await countActiveHolds(deps.db)
  await upsertStatus(deps.db, {
    lastRunAt: now,
    status: holdsCreated > 0 ? "anomaly_detected" : "healthy",
    activeHolds: activeHoldCount,
    lastAnomalyAt: holdsCreated > 0 ? now : undefined,
    lastAnomalyDescription: holdsCreated > 0
      ? `${holdsCreated} new holds created, ${holdsExpired} holds expired`
      : undefined,
  })

  // Step 7: Decision log
  await logDecision(deps.decisionLogDb, {
    domain: "operations",
    decisionType: "billing_reconciliation",
    inputs: { totalLocal: localActive.length, totalPaddle: paddleSubscriptions.length },
    output: { action: "completed", holdsCreated, holdsExpired, mismatches: localMissing.length },
  })

  // Step 8: Self-perpetuate
  await scheduleDeferredAction(deps.schedulerDb, {
    action: "billing_reconciliation",
    params: {},
    executeAt: new Date(now.getTime() + SELF_PERPETUATE_MS),
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "billing_reconciliation",
  })
}

async function handleAnomaly(
  deps: ReconciliationDeps,
  now: Date,
  missingCount: number,
  totalLocal: number,
  totalPaddle: number,
): Promise<void> {
  const pct = ((missingCount / totalLocal) * 100).toFixed(1)
  const description = `Reconciliation halted: ${missingCount} of ${totalLocal} subscriptions (${pct}%) missing from Paddle.`

  const activeHoldCount = await countActiveHolds(deps.db)
  await upsertStatus(deps.db, {
    lastRunAt: now,
    status: "failed",
    activeHolds: activeHoldCount,
    lastAnomalyAt: now,
    lastAnomalyDescription: description,
  })

  await createNotification(deps.notificationDb, {
    accountId: deps.adminAccountId,
    type: "billing_anomaly",
    title: "Billing reconciliation anomaly",
    body: description,
    link: "/admin/billing",
  })

  await logDecision(deps.decisionLogDb, {
    domain: "operations",
    decisionType: "billing_reconciliation",
    inputs: { totalLocal, totalPaddle, missingCount },
    output: { action: "halted", reason: "anomaly_threshold_exceeded" },
  })

  // Self-perpetuate despite halt
  await scheduleDeferredAction(deps.schedulerDb, {
    action: "billing_reconciliation",
    params: {},
    executeAt: new Date(now.getTime() + SELF_PERPETUATE_MS),
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "billing_reconciliation",
  })
}

async function createHold(
  deps: ReconciliationDeps,
  ls: { id: string; paddleSubscriptionId: string | null },
  now: Date,
): Promise<void> {
  const [hold] = await deps.db
    .insert(billingHolds)
    .values({
      listingId: ls.id,
      reason: `Paddle subscription ${ls.paddleSubscriptionId} not found in active subscriptions`,
      expiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
    })
    .returning({ id: billingHolds.id })

  await scheduleDeferredAction(deps.schedulerDb, {
    action: "billing_hold_expiry",
    params: { listingId: ls.id, holdId: hold.id },
    executeAt: new Date(now.getTime() + HOLD_DURATION_MS),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "billing_reconciliation",
  })

  await createNotification(deps.notificationDb, {
    accountId: deps.adminAccountId,
    type: "billing_anomaly",
    title: "Billing hold created",
    body: `Hold created for listing — Paddle subscription ${ls.paddleSubscriptionId} not found`,
    link: "/admin/billing",
  })

  await logDecision(deps.decisionLogDb, {
    domain: "operations",
    decisionType: "billing_reconciliation",
    inputs: { listingId: ls.id, paddleSubscriptionId: ls.paddleSubscriptionId },
    output: { action: "hold_created", holdId: hold.id },
  })
}

async function processExpiredHold(
  deps: ReconciliationDeps,
  ls: { id: string; accountId: string | null; subscriptionTier: string | null; paddleSubscriptionId: string | null },
  _hold: { id: string },
  now: Date,
): Promise<boolean> {
  // Check pending_cancellations — if exists, the webhook path handles it
  const [pending] = await deps.db
    .select()
    .from(pendingCancellations)
    .where(eq(pendingCancellations.paddleSubscriptionId, ls.paddleSubscriptionId!))
    .limit(1)

  if (pending) return false

  // Reconciliation-discovered cancellation — emit subscription_ended
  deps.eventBus.emit("subscription_ended", {
    _brand: "SubscriptionEndedEvent" as const,
    listingId: ls.id,
    accountId: ls.accountId!,
    previousTier: ls.subscriptionTier as "standard" | "premium" | "partner",
    reason: "paddle_reconciliation",
    origin: "paddle",
    timestamp: now.toISOString(),
  }, deps.waitUntilFn)

  return true
}

type UpsertStatusParams = {
  lastRunAt: Date
  status: "healthy" | "anomaly_detected" | "failed"
  activeHolds: number
  lastAnomalyAt?: Date
  lastAnomalyDescription?: string
}

async function upsertStatus(db: Db, params: UpsertStatusParams): Promise<void> {
  const [existing] = await db.select({ id: billingReconciliationStatus.id }).from(billingReconciliationStatus).limit(1)

  if (existing) {
    const updates: Record<string, unknown> = {
      lastRunAt: params.lastRunAt,
      status: params.status,
      activeHolds: params.activeHolds,
      updatedAt: new Date(),
    }
    if (params.lastAnomalyAt) updates.lastAnomalyAt = params.lastAnomalyAt
    if (params.lastAnomalyDescription) updates.lastAnomalyDescription = params.lastAnomalyDescription

    await db
      .update(billingReconciliationStatus)
      .set(updates)
      .where(eq(billingReconciliationStatus.id, existing.id))
  } else {
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: params.lastRunAt,
      status: params.status,
      activeHolds: params.activeHolds,
      lastAnomalyAt: params.lastAnomalyAt ?? null,
      lastAnomalyDescription: params.lastAnomalyDescription ?? null,
    })
  }
}
