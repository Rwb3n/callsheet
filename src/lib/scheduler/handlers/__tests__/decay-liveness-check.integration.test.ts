// decay_liveness_check handler integration test — AC-22 through AC-26, AC-31
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, and } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID, createMockDecisionLogDb } from "@/db/test-fixtures"
import { enrichmentSchedules, decaySignals } from "@/db/schema/intelligence"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "./invoke-handler"
import { registerDecayLivenessCheckHandler } from "../decay-liveness-check"
import type { LivenessServices } from "@/domains/data-and-listings/decay/liveness-services"
import type { SchedulerDb } from "@/lib/scheduler/api"

import type { InProcessEventBus } from "@/lib/events/bus"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("decay-chk-01")

function createMockSchedulerDb() {
  const scheduled: Array<{ action: string; params: Record<string, unknown>; executeAt: Date }> = []
  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        scheduled.push({ action: row.action as string, params: row.params as Record<string, unknown>, executeAt: row.executeAt as Date })
        return "mock-id"
      },
      cancelMatching: async () => 0,
      findPending: async () => null,
    } satisfies SchedulerDb,
    getScheduled: () => scheduled,
  }
}


function createMockBus() {
  const emitted: Array<{ event: string; payload: unknown }> = []
  return {
    bus: {
      emit: async (event: string, payload: unknown) => { emitted.push({ event, payload }) },
      on: () => {},
    } as unknown as InProcessEventBus,
    getEmitted: () => emitted,
  }
}

function createStubLivenessServices(overrides: Partial<LivenessServices> = {}): LivenessServices {
  return {
    website: { checkUrl: async () => ({ ok: true as const, status: 200 }) },
    email: {
      checkMx: async () => ({ records: ["mx.example.com"] }),
      probeMailbox: async () => ({ status: "valid" as const }),
    },
    companiesHouse: { getCompany: async () => ({ status: "active", name: "Test Co" }) },
    social: { checkUrl: async () => ({ status: 200 }) },
    postcode: { validate: async () => ({ status: "valid" as const }) },
    ...overrides,
  }
}

beforeAll(() => { db = getTestDb() })
beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})
afterAll(async () => { await closeTestDb() })

describe("decay_liveness_check handler", () => {
  it("AC-22: detects website_dead on 4xx/5xx", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { websiteUrl: "https://dead.example.com" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        website: { checkUrl: async () => ({ ok: true as const, status: 500 }) },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "website" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("website_dead")
  })

  it("AC-22: detects domain_expired on DNS failure", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { websiteUrl: "https://expired.example.com" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        website: { checkUrl: async () => ({ ok: false as const, error: "DNS_RESOLUTION_FAILED" }) },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "website" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("domain_expired")
  })

  it("AC-23: detects email_bounced on zero MX records", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { contactEmail: "test@dead-domain.com" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "email", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        email: {
          checkMx: async () => ({ records: [] }),
          probeMailbox: async () => ({ status: "valid" as const }),
        },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "email" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("email_bounced")
  })

  it("AC-24: detects ch_not_active on non-active status", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { companiesHouseNumber: "12345678" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "ch", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        companiesHouse: { getCompany: async () => ({ status: "dissolved", name: "Dead Corp" }) },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "ch" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("ch_not_active")
  })

  it("AC-25: detects social_dead on 404", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    // Insert a social profile for this listing
    const { socialProfiles } = await import("@/db/schema/data-and-listings")
    await db.insert(socialProfiles).values({ listingId: listing.id, platform: "linkedin", url: "https://linkedin.com/dead" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "social", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        social: { checkUrl: async () => ({ status: 404 }) },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "social" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("social_dead")
  })

  it("AC-26: detects postcode_invalid on terminated postcode", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { basePostcode: "SW1A 1AA" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "postcode", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        postcode: { validate: async () => ({ status: "terminated" }) },
      }),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "postcode" })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    expect(signals).toHaveLength(1)
    expect(signals[0].signalType).toBe("postcode_invalid")
  })

  it("AC-31: self-perpetuates at cadence interval for paid tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { websiteUrl: "https://healthy.example.com" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: createMockBus().bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices(),
    })

    const beforeExec = Date.now()
    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "website" })

    const scheduled = mockScheduler.getScheduled()
    const nextRun = scheduled.find((s) => s.action === "decay_liveness_check")
    expect(nextRun).toBeDefined()
    expect(nextRun!.params).toEqual({ listingId: listing.id, checkType: "website" })

    // Paid website liveness = 7 days
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(nextRun!.executeAt.getTime()).toBeGreaterThanOrEqual(beforeExec + sevenDaysMs - 1000)
  })

  it("AC-31: does not self-perpetuate for archived listings", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      websiteUrl: "https://archived.example.com",
      lifecycleStatus: "archived",
    })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerDecayLivenessCheckHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: createMockBus().bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices(),
    })

    await invokeHandler(registry, "decay_liveness_check", { listingId: listing.id, checkType: "website" })

    expect(mockScheduler.getScheduled()).toHaveLength(0)

    // Schedule row should be deleted
    const remaining = await db
      .select()
      .from(enrichmentSchedules)
      .where(and(eq(enrichmentSchedules.listingId, listing.id), eq(enrichmentSchedules.checkType, "website")))
    expect(remaining).toHaveLength(0)
  })
})
