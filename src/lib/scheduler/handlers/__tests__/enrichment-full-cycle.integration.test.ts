// enrichment_full_cycle handler integration test — AC-35
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID, createMockDecisionLogDb } from "@/db/test-fixtures"
import { enrichmentSchedules, decaySignals } from "@/db/schema/intelligence"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { invokeHandler } from "./invoke-handler"
import { registerEnrichmentFullCycleHandler } from "../enrichment-full-cycle"
import type { LivenessServices } from "@/domains/data-and-listings/decay/liveness-services"
import type { SchedulerDb } from "@/lib/scheduler/api"

import type { InProcessEventBus } from "@/lib/events/bus"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("full-cycle-1")

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

describe("enrichment_full_cycle handler", () => {
  it("AC-35: runs all applicable checks for paid tier and schedules next full cycle", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      websiteUrl: "https://healthy.example.com",
      contactEmail: "alive@example.com",
      companiesHouseNumber: "12345678",
    })

    // Create schedules for 3 check types (paid tier has 6 but we test 3 for simplicity)
    for (const checkType of ["website", "email", "ch"] as const) {
      await db.insert(enrichmentSchedules).values({
        listingId: listing.id, checkType, nextCheckAt: new Date(), cadenceTier: "paid",
      })
    }

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerEnrichmentFullCycleHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices(),
    })

    const beforeExec = Date.now()
    await invokeHandler(registry, "enrichment_full_cycle", { listingId: listing.id })

    // Should schedule next full cycle
    const nextCycle = mockScheduler.getScheduled().find((s) => s.action === "enrichment_full_cycle")
    expect(nextCycle).toBeDefined()
    expect(nextCycle!.params).toEqual({ listingId: listing.id })

    // Paid full cycle = 90 days
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
    expect(nextCycle!.executeAt.getTime()).toBeGreaterThanOrEqual(beforeExec + ninetyDaysMs - 1000)
  })

  it("AC-35: detects signals across multiple check types in one cycle", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, {
      websiteUrl: "https://dead.example.com",
      contactEmail: "dead@gone.com",
      companiesHouseNumber: "99999999",
    })

    for (const checkType of ["website", "email", "ch"] as const) {
      await db.insert(enrichmentSchedules).values({
        listingId: listing.id, checkType, nextCheckAt: new Date(), cadenceTier: "paid",
      })
    }

    const mockScheduler = createMockSchedulerDb()
    const mockBus = createMockBus()
    const registry = new ActionHandlerRegistry()
    registerEnrichmentFullCycleHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: mockBus.bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices({
        website: { checkUrl: async () => ({ ok: true as const, status: 500 }) },
        email: { checkMx: async () => ({ records: [] }), probeMailbox: async () => ({ status: "valid" as const }) },
      }),
    })

    await invokeHandler(registry, "enrichment_full_cycle", { listingId: listing.id })

    const signals = await db.select().from(decaySignals).where(eq(decaySignals.listingId, listing.id))
    const signalTypes = signals.map((s) => s.signalType)
    expect(signalTypes).toContain("website_dead")
    expect(signalTypes).toContain("email_bounced")
  })

  it("AC-35: does not schedule next cycle for archived listing", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { lifecycleStatus: "archived" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    registerEnrichmentFullCycleHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: createMockBus().bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices(),
    })

    await invokeHandler(registry, "enrichment_full_cycle", { listingId: listing.id })

    expect(mockScheduler.getScheduled()).toHaveLength(0)

    // Schedules should be deleted
    const remaining = await db.select().from(enrichmentSchedules).where(eq(enrichmentSchedules.listingId, listing.id))
    expect(remaining).toHaveLength(0)
  })

  it("AC-35: updates lastFullCycleAt on schedule rows after cycle", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { websiteUrl: "https://ok.com" })
    await db.insert(enrichmentSchedules).values({
      listingId: listing.id, checkType: "website", nextCheckAt: new Date(), cadenceTier: "paid",
    })

    const mockScheduler = createMockSchedulerDb()
    const registry = new ActionHandlerRegistry()
    const beforeExec = new Date()
    registerEnrichmentFullCycleHandler(registry, {
      db, schedulerDb: mockScheduler.db, decisionLogDb: createMockDecisionLogDb().db,
      bus: createMockBus().bus, waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
      livenessServices: createStubLivenessServices(),
    })

    await invokeHandler(registry, "enrichment_full_cycle", { listingId: listing.id })

    const [updated] = await db.select().from(enrichmentSchedules).where(eq(enrichmentSchedules.listingId, listing.id))
    expect(updated.lastFullCycleAt).toBeDefined()
    expect(updated.lastFullCycleAt!.getTime()).toBeGreaterThanOrEqual(beforeExec.getTime())
  })
})
