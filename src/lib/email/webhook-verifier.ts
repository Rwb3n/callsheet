// Resend webhook signature verification — Communications Phase 1
// Inject-don't-patch: production uses ResendWebhookVerifier, tests use NoOpWebhookVerifier.

import { createHmac, timingSafeEqual } from "crypto"

export interface WebhookVerifier {
  verify(body: string, signature: string, timestamp: string): boolean
}

export class ResendWebhookVerifier implements WebhookVerifier {
  constructor(private secret: string) {}

  verify(body: string, signature: string, timestamp: string): boolean {
    if (!signature || !timestamp) return false

    const payload = `${timestamp}.${body}`
    const expected = createHmac("sha256", this.secret)
      .update(payload)
      .digest("hex")

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected),
      )
    } catch {
      return false
    }
  }
}

// Tests use this — always returns true
export class NoOpWebhookVerifier implements WebhookVerifier {
  verify(_body: string, _signature: string, _timestamp: string): boolean {
    return true
  }
}
