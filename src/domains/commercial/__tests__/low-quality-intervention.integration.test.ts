// Integration tests for low-quality intervention — AC-50 through AC-54

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  seedTestUser,
  createTestListing,
  emptyConsumerMatrix,
  createDecisionLogDb,
  setQuality,
} from "@/db/test-fixtures"
import { InProcessEventBus } from "@/lib/events/bus"
import { InMemoryNotificationDb } from "@/db/test-fixtures"
import { createSchedulerDb } from "@/db/test-fixtures"
import { listings } from "@/db/schema/data-and-listings"
import { deferredActions } from "@/db/schema/shared"
import {
  triggerLowQualityIntervention,
  type LowQualityInterventionInput,
  type LowQualityInterventionDeps,
} from "@/domains/commercial/low-quality-intervention"
import {
  registerCheckQualityImprovementHandler,
  type CheckQualityImprovementDeps,
} from "@/lib/scheduler/handlers/check-quality-improvement"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "@/lib/scheduler/handlers/__tests__/invoke-handler"

const db = getTestDb()
const OWNER = makeUUID("lqi")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER)
})

afterAll(async () => {
  await closeTestDb()
})

function makeInterventionDeps(): LowQualityInterventionDeps {
  return {
    notificationDb: new InMemoryNotificationDb(),
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
  }
}

describe("triggerLowQualityIntervention", () => {
  it("creates a quality_score_changed notification with composite score and quality link (AC-50)", async () => {
    const l = await createTestListing(db, OWNER)
    const notificationDb = new InMemoryNotificationDb()
    const deps: LowQualityInterventionDeps = {
      notificationDb,
      schedulerDb: createSchedulerDb(db),
      decisionLogDb: createDecisionLogDb(db),
    }

    const input: LowQualityInterventionInput = {
      listingId: l.id,
      accountId: OWNER,
      currentComposite: 25,
      subscriptionTier: "standard",
    }

    await triggerLowQualityIntervention(input, deps)

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("quality_score_changed")
    expect(notifications[0].body).toContain("25")
    expect(notifications[0].link).toContain(`/dashboard/listings/${l.id}/quality`)
  })

  it("schedules check_quality_improvement deferred action at 30 days with baselineScore (AC-51)", async () => {
    const l = await createTestListing(db, OWNER)
    const deps = makeInterventionDeps()

    await triggerLowQualityIntervention(
      { listingId: l.id, accountId: OWNER, currentComposite: 30, subscriptionTier: "premium" },
      deps,
    )

    const [action] = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "check_quality_improvement"))
      .limit(1)

    expect(action).toBeDefined()
    expect(action.params).toMatchObject({ listingId: l.id, baselineScore: 30 })

    // executeAt should be ~30 days from now (within 1 minute tolerance)
    const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000
    const actualMs = new Date(action.executeAt).getTime()
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(60_000)
  })
})

describe("handleCheckQualityImprovement", () => {
  function makeHandlerDeps() {
    const emitted: unknown[] = []
    const bus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    })
    bus.on({
      domain: "commercial",
      eventType: "churn_risk_detected",
      mode: "async",
      handler: async (payload) => { emitted.push(payload) },
    })
    const handlerDeps: CheckQualityImprovementDeps = {
      db,
      decisionLogDb: createDecisionLogDb(db),
      bus,
      waitUntilFn: (p) => { p.catch(() => {}) },
    }
    return { handlerDeps, emitted }
  }

  it("emits churn_risk_detected with low_quality_paid when score still below 40 (AC-52)", async () => {
    const l = await createTestListing(db, OWNER)
    await db.update(listings).set({ subscriptionTier: "standard" }).where(eq(listings.id, l.id))
    await setQuality(db, l.id, 25)

    const { handlerDeps, emitted } = makeHandlerDeps()
    const registry = new ActionHandlerRegistry()
    registerCheckQualityImprovementHandler(registry, handlerDeps)

    await invokeHandler(registry, "check_quality_improvement", {
      listingId: l.id,
      baselineScore: 20,
    })

    expect(emitted).toHaveLength(1)
    const event = emitted[0] as { riskFactors: string[] }
    expect(event.riskFactors).toEqual(["low_quality_paid"])
  })

  it("takes no action when quality score improved to 40 or above (AC-53)", async () => {
    const l = await createTestListing(db, OWNER)
    await db.update(listings).set({ subscriptionTier: "premium" }).where(eq(listings.id, l.id))
    await setQuality(db, l.id, 55)

    const { handlerDeps, emitted } = makeHandlerDeps()
    const registry = new ActionHandlerRegistry()
    registerCheckQualityImprovementHandler(registry, handlerDeps)

    await invokeHandler(registry, "check_quality_improvement", {
      listingId: l.id,
      baselineScore: 20,
    })

    expect(emitted).toHaveLength(0)
  })

  it("takes no action when listing does not exist (AC-54)", async () => {
    const { handlerDeps, emitted } = makeHandlerDeps()
    const registry = new ActionHandlerRegistry()
    registerCheckQualityImprovementHandler(registry, handlerDeps)

    await invokeHandler(registry, "check_quality_improvement", {
      listingId: makeUUID("gone"),
      baselineScore: 20,
    })

    expect(emitted).toHaveLength(0)
  })

  it("takes no action when listing downgraded to free tier (AC-54)", async () => {
    const l = await createTestListing(db, OWNER)
    // Leave as free tier (default)
    await setQuality(db, l.id, 25)

    const { handlerDeps, emitted } = makeHandlerDeps()
    const registry = new ActionHandlerRegistry()
    registerCheckQualityImprovementHandler(registry, handlerDeps)

    await invokeHandler(registry, "check_quality_improvement", {
      listingId: l.id,
      baselineScore: 20,
    })

    expect(emitted).toHaveLength(0)
  })
})
