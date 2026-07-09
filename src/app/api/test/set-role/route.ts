// Dev-only role assignment — E2E test helper
// POST /api/test/set-role — sets user.role for a given email.
// Guarded by E2E_TEST_MODE env var.

import { NextResponse } from "next/server"
import { getDb } from "@/db"
import { user } from "@/db/schema/auth"
import { eq } from "drizzle-orm"

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.E2E_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 })
  }

  const body = await request.json() as { email: string; role: string }
  if (!body.email || !body.role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 })
  }

  const db = getDb()
  await db.update(user).set({ role: body.role }).where(eq(user.email, body.email))

  return NextResponse.json({ email: body.email, role: body.role }, { status: 200 })
}
