// Resend webhook event payload types — Communications Phase 1

type ResendWebhookEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"

export type ResendBounceType = "hard" | "soft"

export type ResendWebhookEvent = {
  type: ResendWebhookEventType
  created_at: string
  data: {
    email_id: string
    to: string[]
    from: string
    subject: string
    bounce?: {
      type: ResendBounceType
      message: string
    }
  }
}
