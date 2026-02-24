// CS-WORK-027: Webhook signature verification — unit tests
import { describe, it, expect } from "vitest"
import { createHmac } from "crypto"
import { ResendWebhookVerifier, NoOpWebhookVerifier } from "../webhook-verifier"

describe("ResendWebhookVerifier", () => {
  const secret = "test-webhook-secret"
  const verifier = new ResendWebhookVerifier(secret)

  // AC-12: invalid signature returns false (route returns 401)
  it("AC-12: rejects invalid signature", () => {
    expect(verifier.verify('{"type":"email.delivered"}', "invalid-sig", "12345")).toBe(false)
  })

  it("AC-12: rejects empty signature", () => {
    expect(verifier.verify('{"type":"email.delivered"}', "", "12345")).toBe(false)
  })

  it("AC-12: rejects empty timestamp", () => {
    expect(verifier.verify('{"type":"email.delivered"}', "abc", "")).toBe(false)
  })

  it("accepts valid HMAC signature", () => {
    const body = '{"type":"email.delivered"}'
    const timestamp = "1234567890"
    const payload = `${timestamp}.${body}`
    const signature = createHmac("sha256", secret).update(payload).digest("hex")

    expect(verifier.verify(body, signature, timestamp)).toBe(true)
  })
})

describe("NoOpWebhookVerifier", () => {
  it("always returns true (for tests)", () => {
    const verifier = new NoOpWebhookVerifier()
    expect(verifier.verify("any", "any", "any")).toBe(true)
  })
})
