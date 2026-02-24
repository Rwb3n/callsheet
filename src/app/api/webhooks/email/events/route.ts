// Resend outbound event webhook — Communications Phase 1
// POST /api/webhooks/email/events
// Receives delivery, open, click, bounce, complaint events from Resend.

import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { handleResendEvent } from "@/lib/email/webhook-handler"
import { handleBounce } from "@/lib/email/bounce-handler"
import type { BounceHandlerDeps } from "@/lib/email/bounce-handler"
import { createSchedulerDb, createDecisionLogDb } from "@/db/adapters"
import { NoOpNotificationDb } from "@/lib/notifications/no-op"
import { ResendWebhookVerifier, NoOpWebhookVerifier } from "@/lib/email/webhook-verifier"
import type { WebhookVerifier } from "@/lib/email/webhook-verifier"
import type { ResendWebhookEvent } from "@/lib/email/webhook-types"

function getVerifier(): WebhookVerifier {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return new NoOpWebhookVerifier()
  return new ResendWebhookVerifier(secret)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get("resend-signature") ?? ""
  const timestamp = request.headers.get("resend-timestamp") ?? ""

  const verifier = getVerifier()
  if (!verifier.verify(body, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event: ResendWebhookEvent = JSON.parse(body)
  const db = getDb()

  const bounceDeps: BounceHandlerDeps = {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionDb: createDecisionLogDb(db),
    notificationDb: new NoOpNotificationDb(),
  }

  // Always return 200 — Resend retries on non-2xx
  await handleResendEvent(db, event, (params) => handleBounce(bounceDeps, params))

  return NextResponse.json({ received: true }, { status: 200 })
}
