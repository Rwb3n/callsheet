// Singleton auth instance — shared between route handler and test endpoints.
// Separates auth config (auth.ts) from runtime instantiation.

import { createAuth } from "@/lib/auth"
import { getDb } from "@/db"
import { InMemoryEmailService } from "@/lib/email/transport"
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
let _testEmailService: InMemoryEmailService | null = null

export function getAuthInstance() {
  if (!_auth) {
    _testEmailService = new InMemoryEmailService()
    _auth = createAuth({
      db: getDb(),
      emailService: _testEmailService,
    })
  }
  return _auth
}

export function getTestEmailService(): InMemoryEmailService | null {
  return _testEmailService
}
