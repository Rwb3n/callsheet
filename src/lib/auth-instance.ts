// Singleton auth instance — shared between route handler and test endpoints.
// Separates auth config (auth.ts) from runtime instantiation.
// CS-WORK-101 AC-2: uses production email service when RESEND_API_KEY is set.

import { createAuth } from "@/lib/auth"
import { getDb } from "@/db"
import { InMemoryEmailService, ResendEmailService } from "@/lib/email/transport"
import type { EmailService } from "@/lib/email/types"
import { registerTemplate, hasTemplate } from "@/lib/email/templates"

// Register auth-related templates on module load
if (!hasTemplate("email_verification")) {
  registerTemplate("email_verification", (data) => ({
    subject: "Verify your email — CALLSHEET",
    html: `<p>Click the link to verify your email: <a href="${data.verificationUrl}">${data.verificationUrl}</a></p>`,
  }))
}

if (!hasTemplate("password_reset")) {
  registerTemplate("password_reset", (data) => ({
    subject: "Reset your password — CALLSHEET",
    html: `<p>Click the link to reset your password: <a href="${data.resetUrl}">${data.resetUrl}</a></p>`,
  }))
}

let _auth: ReturnType<typeof createAuth> | null = null
let _emailService: EmailService | null = null

function createAuthEmailService(): EmailService {
  if (process.env.RESEND_API_KEY) {
    return new ResendEmailService({
      apiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.RESEND_FROM_ADDRESS ?? "noreply@callsheet.co.uk",
      getPreferences: async () => null,
    })
  }
  return new InMemoryEmailService()
}

export function getAuthInstance() {
  if (!_auth) {
    _emailService = createAuthEmailService()
    _auth = createAuth({
      db: getDb(),
      emailService: _emailService,
    })
  }
  return _auth
}

// Test helper — only returns InMemoryEmailService when that's what was created
export function getTestEmailService(): InMemoryEmailService | null {
  return _emailService instanceof InMemoryEmailService ? _emailService : null
}
