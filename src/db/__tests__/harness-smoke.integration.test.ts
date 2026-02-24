// Smoke test — verifies the integration test harness connects, truncates, and closes.
import { describe, it, expect, afterAll, beforeEach } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { decisionLogs } from "@/db/schema/shared"
import { eq } from "drizzle-orm"

afterAll(async () => {
  await closeTestDb()
})

describe("integration test harness", () => {
  beforeEach(async () => {
    await resetDb()
  })

  it("connects to Postgres and executes a query", async () => {
    const db = getTestDb()
    const result = await db.select().from(decisionLogs)
    expect(result).toEqual([])
  })

  it("inserts and reads back a row", async () => {
    const db = getTestDb()
    const [row] = await db
      .insert(decisionLogs)
      .values({
        domain: "platform",
        decisionType: "test_decision",
        inputs: { foo: "bar" },
        output: { result: "ok" },
        confidence: 85,
      })
      .returning()

    expect(row.id).toBeDefined()
    expect(row.domain).toBe("platform")
    expect(row.confidence).toBe(85)

    const [fetched] = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.id, row.id))
    expect(fetched.decisionType).toBe("test_decision")
  })

  it("resetDb truncates all tables", async () => {
    const db = getTestDb()
    await db.insert(decisionLogs).values({
      domain: "operations",
      decisionType: "cleanup_test",
      inputs: {},
      output: {},
    })

    const before = await db.select().from(decisionLogs)
    expect(before).toHaveLength(1)

    await resetDb()

    const after = await db.select().from(decisionLogs)
    expect(after).toHaveLength(0)
  })
})
