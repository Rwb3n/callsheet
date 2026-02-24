// Dev-only DB reset endpoint — CS-WORK-034 AC-03
// POST /api/test/reset — truncates all application tables.
// Guarded by E2E_TEST_MODE env var. Returns 200 on success.

import { NextResponse } from "next/server"
import { getDb } from "@/db"
import { TRUNCATE_ALL_TABLES_SQL } from "@/db/test-utils"

export async function POST(): Promise<NextResponse> {
  if (process.env.E2E_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 })
  }

  const db = getDb()
  await db.execute(TRUNCATE_ALL_TABLES_SQL)

  return NextResponse.json({ reset: true }, { status: 200 })
}
