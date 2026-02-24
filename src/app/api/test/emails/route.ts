// Dev-only email capture endpoint — CS-WORK-034 AC-04
// GET /api/test/emails — returns captured emails from InMemoryEmailService.
// Used by E2E tests to extract verification URLs.

import { NextResponse } from "next/server"
import { getTestEmailService } from "@/lib/auth-instance"

export async function GET(): Promise<NextResponse> {
  if (process.env.E2E_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 })
  }

  const emailService = getTestEmailService()
  if (!emailService) {
    return NextResponse.json({ error: "No test email service" }, { status: 500 })
  }

  return NextResponse.json({ emails: emailService.getCalls() }, { status: 200 })
}

export async function DELETE(): Promise<NextResponse> {
  if (process.env.E2E_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 })
  }

  const emailService = getTestEmailService()
  if (!emailService) {
    return NextResponse.json({ error: "No test email service" }, { status: 500 })
  }

  emailService.clear()
  return NextResponse.json({ cleared: true }, { status: 200 })
}
