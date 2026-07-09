// Graduation integration tests — CS-WORK-089
// AC-62, AC-63, AC-64

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq, and, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  makeAdminSession,
  ctx,
  createDecisionLogDb,
  createSchedulerDb,
} from "@/db/test-fixtures"
import { decisionLogs } from "@/db/schema/shared"
import { dispatchGraduatedDecision } from "../dispatch"
import type { Recommendation } from "../dispatch"
import { withinGovernanceBounds } from "../evaluate"
import { logDecision } from "@/lib/decisions/logger"
import { createAdminGraduationRouter } from "@/server/routers/admin/graduation"

const db = getTestDb()
const ACCOUNT_ID = makeUUID("grad000001")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-62: dispatchGraduatedDecision logs graduation_evaluation on every invocation ---

describe("AC-62: graduation_evaluation logged on every dispatch", () => {
  it("logs decision when graduated=false (insufficient data)", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    const rec: Recommendation = {
      type: "enrichment_cadence",
      subEntity: "data-and-listings",
    }

    const result = await dispatchGraduatedDecision(
      { db, decisionLogDb },
      "data-and-listings",
      "enrichment_cadence_adjustment",
      rec,
    )

    expect(result).toBe("escalated")

    // Verify graduation_evaluation was logged
    const logged = await db
      .select({
        decisionType: decisionLogs.decisionType,
        domain: decisionLogs.domain,
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "graduation_evaluation"))

    expect(logged).toHaveLength(1)
    expect(logged[0].domain).toBe("cross-domain")
    const inputs = logged[0].inputs as Record<string, unknown>
    const output = logged[0].output as Record<string, unknown>
    expect(inputs.subEntity).toBe("data-and-listings")
    expect(inputs.capability).toBe("enrichment_cadence_adjustment")
    expect(output.graduated).toBe(false)
    expect(output.reason).toBeDefined()
  })

  it("logs decision when graduated=true", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    // Seed 200 enrichment_cadence_adjustment decisions (all with qualityImproved: true)
    const sixMonthsAgo = new Date(Date.now() - 170 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 200; i++) {
      await logDecision(decisionLogDb, {
        domain: "data-and-listings",
        decisionType: "enrichment_cadence_adjustment",
        inputs: { index: i },
        output: { qualityImproved: true },
      })
    }

    const rec: Recommendation = {
      type: "enrichment_cadence",
      subEntity: "data-and-listings",
    }

    const result = await dispatchGraduatedDecision(
      { db, decisionLogDb },
      "data-and-listings",
      "enrichment_cadence_adjustment",
      rec,
    )

    expect(result).toBe("auto_applied")

    // Verify graduation_evaluation was logged (on top of the 200 seed entries)
    const logged = await db
      .select({
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "graduation_evaluation"))

    expect(logged).toHaveLength(1)
    const output = logged[0].output as Record<string, unknown>
    expect(output.graduated).toBe(true)
  })
})

// --- AC-63: withinGovernanceBounds returns false after 10 auto-applied ---

describe("AC-63: governance bounds enforcement", () => {
  it("returns false after 10 auto-applied enrichment adjustments in current month", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    // Seed 10 graduated evaluations in the current month
    for (let i = 0; i < 10; i++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "enrichment_cadence_adjustment",
        },
        output: { graduated: true, reason: "test" },
      })
    }

    // 10 auto-applied — bounds should be exhausted
    const withinBounds = await withinGovernanceBounds(
      db,
      "enrichment_cadence_adjustment",
    )
    expect(withinBounds).toBe(false)
  })

  it("returns true with fewer than 10 auto-applied in current month", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    // Seed 5 graduated evaluations
    for (let i = 0; i < 5; i++) {
      await logDecision(decisionLogDb, {
        domain: "cross-domain",
        decisionType: "graduation_evaluation",
        inputs: {
          subEntity: "data-and-listings",
          capability: "enrichment_cadence_adjustment",
        },
        output: { graduated: true, reason: "test" },
      })
    }

    const withinBounds = await withinGovernanceBounds(
      db,
      "enrichment_cadence_adjustment",
    )
    expect(withinBounds).toBe(true)
  })

  it("11th dispatch escalates due to governance bounds", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    // Seed 200 enrichment decisions so graduation evaluates to true
    for (let i = 0; i < 200; i++) {
      await logDecision(decisionLogDb, {
        domain: "data-and-listings",
        decisionType: "enrichment_cadence_adjustment",
        inputs: { index: i },
        output: { qualityImproved: true },
      })
    }

    // Dispatch 10 — all should auto-apply
    for (let i = 0; i < 10; i++) {
      const result = await dispatchGraduatedDecision(
        { db, decisionLogDb },
        "data-and-listings",
        "enrichment_cadence_adjustment",
        { type: "enrichment_cadence", subEntity: "data-and-listings" },
      )
      expect(result).toBe("auto_applied")
    }

    // 11th should escalate
    const result = await dispatchGraduatedDecision(
      { db, decisionLogDb },
      "data-and-listings",
      "enrichment_cadence_adjustment",
      { type: "enrichment_cadence", subEntity: "data-and-listings" },
    )
    expect(result).toBe("escalated")
  })
})

// --- AC-64: admin.graduation.override takes precedence ---

describe("AC-64: manual override takes precedence", () => {
  it("override with graduated=false causes subsequent evaluation to return false", async () => {
    const decisionLogDb = createDecisionLogDb(db)

    // Seed enough data for graduation to normally succeed
    for (let i = 0; i < 200; i++) {
      await logDecision(decisionLogDb, {
        domain: "data-and-listings",
        decisionType: "enrichment_cadence_adjustment",
        inputs: { index: i },
        output: { qualityImproved: true },
      })
    }

    // Verify it would normally graduate
    const beforeOverride = await dispatchGraduatedDecision(
      { db, decisionLogDb },
      "data-and-listings",
      "enrichment_cadence_adjustment",
      { type: "enrichment_cadence", subEntity: "data-and-listings" },
    )
    expect(beforeOverride).toBe("auto_applied")

    // Apply manual override via admin route
    const graduationRouter = createAdminGraduationRouter({
      db,
      decisionLogDb,
      schedulerDb: createSchedulerDb(db),
    })
    const caller = graduationRouter.createCaller(ctx(makeAdminSession(ACCOUNT_ID)))

    await caller.override({
      subEntity: "data-and-listings",
      capability: "enrichment_cadence_adjustment",
      graduated: false,
      reason: "Quality regression detected — reverting to manual review",
    })

    // Subsequent dispatch should escalate (override takes precedence)
    const afterOverride = await dispatchGraduatedDecision(
      { db, decisionLogDb },
      "data-and-listings",
      "enrichment_cadence_adjustment",
      { type: "enrichment_cadence", subEntity: "data-and-listings" },
    )
    expect(afterOverride).toBe("escalated")

    // Verify the override decision was logged
    const overrideLogs = await db
      .select({
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(
        and(
          eq(decisionLogs.decisionType, "graduation_evaluation"),
          sql`${decisionLogs.inputs}->>'reason' = 'manual_override'`,
        ),
      )

    expect(overrideLogs).toHaveLength(1)
    const output = overrideLogs[0].output as Record<string, unknown>
    expect(output.graduated).toBe(false)
  })
})
