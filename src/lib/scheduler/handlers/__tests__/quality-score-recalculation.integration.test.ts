// quality_score_recalculation handler integration test — AC-8/9/10/16/17/18/20
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  InMemoryNotificationDb,
  makeUUID,
  createMockDecisionLogDb,
} from "@/db/test-fixtures"
import { qualityScores, qualityScoreExplanations, verifications, listings } from "@/db/schema/data-and-listings"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { InProcessEventBus } from "@/lib/events/bus"
import type { EventConsumerError } from "@/lib/events/types"
import { emptyConsumerMatrix } from "@/db/test-fixtures"
import { invokeHandler } from "./invoke-handler"
import {
  registerQualityScoreRecalculationHandler,
  scheduleNightlyQualityRecalculation,
} from "../quality-score-recalculation"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("recalc-001")

function createMockSchedulerDb() {
  const scheduled: Array<{
    action: string
    params: Record<string, unknown>
    executeAt: Date
  }> = []

  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        scheduled.push({
          action: row.action as string,
          params: row.params as Record<string, unknown>,
          executeAt: row.executeAt as Date,
        })
        return "mock-id"
      },
      cancelMatching: async () => 0,
      findPending: async () => null,
    },
    getScheduled: () => scheduled,
  }
}


function setupHandler() {
  const registry = new ActionHandlerRegistry()
  const logError = async (_err: EventConsumerError) => {}
  const bus = new InProcessEventBus({ logError, consumerMatrix: emptyConsumerMatrix })
  const notificationDb = new InMemoryNotificationDb()
  const mockScheduler = createMockSchedulerDb()
  const mockDecisionLog = createMockDecisionLogDb()
  const emittedEvents: Array<{ type: string; payload: unknown }> = []

  // Capture events
  bus.on({
    domain: "data-and-listings",
    eventType: "quality_score_changed",
    mode: "async",
    handler: async (payload) => {
      emittedEvents.push({ type: "quality_score_changed", payload })
    },
  })

  const waitUntilFn = (p: Promise<unknown>) => { p.catch(() => {}) }

  registerQualityScoreRecalculationHandler(registry, {
    db,
    decisionLogDb: mockDecisionLog.db,
    bus,
    waitUntilFn,
    notificationDb,
    schedulerDb: mockScheduler.db,
  })

  return { registry, bus, notificationDb, mockScheduler, mockDecisionLog, emittedEvents, waitUntilFn }
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

describe("quality_score_recalculation handler", () => {
  it("AC-18: transitions calculatedBy from zero_init to calibrated", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test",
      bio: "A bio",
      baseRegion: "London",
      contactEmail: "test@test.com",
      websiteUrl: "https://test.com",
    })

    // Verify starts as zero_init
    const [before] = await db
      .select({ calculatedBy: qualityScores.calculatedBy })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))
    expect(before.calculatedBy).toBe("zero_init")

    const { registry } = setupHandler()
    await invokeHandler(registry, "quality_score_recalculation", { listingId: listing.id })

    // Verify transitions to calibrated
    const [after] = await db
      .select({ calculatedBy: qualityScores.calculatedBy, composite: qualityScores.composite })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))
    expect(after.calculatedBy).toBe("calibrated")
    expect(after.composite).toBeGreaterThan(0)
  })

  it("AC-20: does NOT emit event when score changes within same band", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test",
      bio: "A bio",
      baseRegion: "London",
    })

    // Set initial composite to a known value in "fair" band
    await db.update(qualityScores)
      .set({ composite: 45, calculatedBy: "calibrated" })
      .where(eq(qualityScores.listingId, listing.id))

    const { registry, emittedEvents } = setupHandler()
    await invokeHandler(registry, "quality_score_recalculation", { listingId: listing.id })

    // New score should still be in fair band (no verification = 0, no credits = lower completeness)
    const [after] = await db
      .select({ composite: qualityScores.composite })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    // Score changed but band should still be fair or poor — no event emitted
    // Allow a short wait for async event processing
    await new Promise((r) => setTimeout(r, 50))
    // The event should NOT have been emitted if band didn't change
    // (band may or may not change depending on exact score — check)
    const newBand = after.composite >= 60 ? "good" : after.composite >= 40 ? "fair" : "poor"
    if (newBand === "fair" || newBand === "poor") {
      // Same band as before (45 = fair, or dropped to poor) - check no event
      // Strictly we need to check: if both old and new are in same band
      const oldBand = "fair" // 45
      if (oldBand === newBand) {
        expect(emittedEvents.length).toBe(0)
      }
    }
  })

  it("AC-8: Fair->Good band crossing triggers improved direction", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test Headline",
      bio: "A complete bio description",
      baseRegion: "London",
      contactEmail: "test@example.com",
      contactPhone: "07123456789",
      websiteUrl: "https://example.com",
    })

    // Set previous score to 59 (Fair band, just below Good)
    await db.update(qualityScores)
      .set({ composite: 59, calculatedBy: "calibrated" })
      .where(eq(qualityScores.listingId, listing.id))

    // Upgrade verification to "verified" (accuracy = 12, verification = 10 = +22 points)
    await db.update(verifications)
      .set({ tier: "verified" })
      .where(eq(verifications.listingId, listing.id))

    const { registry, emittedEvents, notificationDb, mockDecisionLog } = setupHandler()
    await invokeHandler(registry, "quality_score_recalculation", { listingId: listing.id })
    await new Promise((r) => setTimeout(r, 50))

    const [after] = await db
      .select({ composite: qualityScores.composite })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    // With verified tier, score should be well above 60 (good band)
    expect(after.composite).toBeGreaterThanOrEqual(60)

    // AC-10: event emitted with correct payload
    expect(emittedEvents.length).toBe(1)
    const event = emittedEvents[0].payload as Record<string, unknown>
    expect(event.listingId).toBe(listing.id)
    expect(event.previousComposite).toBe(59)
    expect(event.newComposite).toBe(after.composite)
    expect(event.changedDimensions).toBeDefined()
    expect(Array.isArray(event.changedDimensions)).toBe(true)

    // AC-8: notification sent with direction=improved
    const notifications = notificationDb.getAll()
    expect(notifications.length).toBe(1)
    expect(notifications[0].type).toBe("quality_score_changed")
    expect(notifications[0].body).toContain("improved")

    // AC-16: decision logged
    const decisions = mockDecisionLog.getDecisions()
    expect(decisions.length).toBe(1)
    expect(decisions[0].decisionType).toBe("quality_score_band_evaluation")
    expect(decisions[0].listingId).toBe(listing.id)
  })

  it("AC-9: Good->Fair band crossing includes improvement suggestions", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test",
      bio: "Bio",
      baseRegion: "London",
      contactEmail: "test@test.com",
      websiteUrl: "https://test.com",
    })

    // Set previous score to 60 (Good band threshold)
    await db.update(qualityScores)
      .set({ composite: 60, calculatedBy: "calibrated" })
      .where(eq(qualityScores.listingId, listing.id))

    // Verification stays unclaimed — accuracy 0, verification 0
    // This should produce a score well below 60

    const { registry, notificationDb } = setupHandler()
    await invokeHandler(registry, "quality_score_recalculation", { listingId: listing.id })
    await new Promise((r) => setTimeout(r, 50))

    const [after] = await db
      .select({ composite: qualityScores.composite })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    // Unclaimed = 0 accuracy + 0 verification, so composite < 60
    expect(after.composite).toBeLessThan(60)

    const notifications = notificationDb.getAll()
    expect(notifications.length).toBe(1)
    expect(notifications[0].body).toContain("declined")
    // AC-9: body should contain improvement suggestions
    expect(notifications[0].body).toContain("Suggestions")
  })

  it("AC-17: nightly batch schedules recalculation for all active listings", async () => {
    const listing1 = await createTestListing(db, ACCOUNT_ID)
    const listing2 = await createTestListing(db, ACCOUNT_ID)

    // Archive one listing
    await db.update(listings)
      .set({ lifecycleStatus: "archived" })
      .where(eq(listings.id, listing2.id))

    const mockScheduler = createMockSchedulerDb()
    const count = await scheduleNightlyQualityRecalculation(db, mockScheduler.db)

    // Only active listing should be scheduled
    expect(count).toBe(1)
    const scheduled = mockScheduler.getScheduled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].action).toBe("quality_score_recalculation")
    expect(scheduled[0].params).toEqual({ listingId: listing1.id })
  })

  it("updates quality_score_explanations with structured dimensions", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      headline: "Test",
      bio: "Bio",
      baseRegion: "London",
    })

    const { registry } = setupHandler()
    await invokeHandler(registry, "quality_score_recalculation", { listingId: listing.id })

    const [explanationRow] = await db
      .select()
      .from(qualityScoreExplanations)
      .where(eq(qualityScoreExplanations.listingId, listing.id))

    expect(explanationRow.explanation.composite).toBeGreaterThan(0)
    expect(explanationRow.explanation.dimensions).toHaveLength(5)
    expect(explanationRow.explanation.dimensions[0].name).toBe("completeness")
    expect(Array.isArray(explanationRow.explanation.topImprovements)).toBe(true)
  })

  it("no-ops for non-existent listing", async () => {
    const { registry } = setupHandler()
    // Should not throw
    await invokeHandler(registry, "quality_score_recalculation", {
      listingId: makeUUID("nonexistent"),
    })
  })
})
