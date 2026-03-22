// Paddle webhook endpoint — S4 §2.2
// POST /api/paddle/webhook
// Returns 200 immediately after signature + dedup, processes asynchronously.

import { NextResponse } from "next/server"
import { getDb } from "@/db"
import {
  verifyPaddleSignature,
  isEventProcessed,
  markEventProcessed,
  processPaddleWebhook,
} from "@/domains/operations/paddle/webhook-handler"
import type { PaddleWebhookEvent } from "@/domains/operations/paddle/types"
import { InProcessEventBus } from "@/lib/events/bus"
import { logEventConsumerError } from "@/lib/events/errors"
import { createSchedulerDb, createDecisionLogDb, createNotificationDb } from "@/db/adapters"

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get("paddle-signature")

  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    return new NextResponse("Server configuration error", { status: 500 })
  }

  // AC-01/AC-02: Signature verification
  if (!verifyPaddleSignature(rawBody, signature, secret)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const paddleEvent: PaddleWebhookEvent = JSON.parse(rawBody)
  const db = getDb()

  // AC-03: Idempotency check
  if (await isEventProcessed(db, paddleEvent.event_id)) {
    return new NextResponse("OK", { status: 200 })
  }

  await markEventProcessed(db, paddleEvent.event_id)

  // Wire handler dependencies
  const eventBus = new InProcessEventBus({ logError: logEventConsumerError })
  const deps = {
    db,
    webhookSecret: secret,
    eventBus,
    waitUntilFn: (p: Promise<void>) => { p.catch(() => {}) },
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    notificationDb: createNotificationDb(db),
  }

  // Async dispatch — handler runs after response
  processPaddleWebhook(deps, paddleEvent).catch((err) => {
    console.error("[paddle-webhook] Processing error:", err)
  })

  return new NextResponse("OK", { status: 200 })
}
