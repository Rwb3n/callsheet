// Integration tests for intelligence D&L perception consumers
// AC-87 (verify D&L consumer), AC-91 (decay_signal_detected annotation)

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, and, isNull } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID } from "@/db/test-fixtures"
import { enrichmentSchedules, decaySignals } from "@/db/schema/intelligence"
import { supportTickets } from "@/db/schema/operations"
import { accountClosedHandler as dlAccountClosedHandler } from "@/domains/data-and-listings/consumers/account-closed"
import { accountClosedHandler as intelAccountClosedHandler } from "../account-closed"
import { decaySignalDetectedHandler } from "../decay-signal-detected"
import { listingCreatedHandler } from "../listing-created"
import { shortlistAddedHandler } from "../shortlist-added"
import { enquirySubmittedHandler } from "../enquiry-submitted"
import { profileEditedHandler } from "../profile-edited"
import { perceptionAggregates } from "@/db/schema/intelligence"
import { qualityScores } from "@/db/schema/data-and-listings"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { Db } from "@/db/types"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("intel81acct")

function createMockSchedulerDb() {
  const scheduled: Array<{
    action: string
    params: Record<string, unknown>
  }> = []
  const cancelled: Array<{
    action: string
    filterParams: Record<string, unknown>
  }> = []
  return {
    db: {
      insert: async (row: Record<string, unknown>) => {
        scheduled.push({ action: row.action as string, params: row.params as Record<string, unknown> })
        return "mock-id"
      },
      cancelMatching: async (
        action: string,
        filterParams: Record<string, unknown>,
      ) => {
        cancelled.push({ action, filterParams })
        return 1
      },
      findPending: async () => null,
    } satisfies SchedulerDb,
    getScheduled: () => scheduled,
    getCancelled: () => cancelled,
  }
}

async function insertScheduleRow(
  database: Db,
  listingId: string,
  checkType: "website" | "email" | "ch",
) {
  await database.insert(enrichmentSchedules).values({
    listingId,
    checkType,
    nextCheckAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    cadenceTier: "paid",
  })
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
})

afterAll(async () => {
  await closeTestDb()
})

describe("AC-87: account_closed enrichment suspension", () => {
  it("D&L consumer cancels deferred actions and deletes enrichment_schedules", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    await insertScheduleRow(db, listing.id, "website")
    await insertScheduleRow(db, listing.id, "email")

    const mock = createMockSchedulerDb()
    const handler = dlAccountClosedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: [listing.id],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })

    // Verify deferred actions cancelled
    const decayChecks = mock.getCancelled().filter((c) => c.action === "decay_liveness_check")
    expect(decayChecks).toHaveLength(1)

    const fullCycles = mock.getCancelled().filter((c) => c.action === "enrichment_full_cycle")
    expect(fullCycles).toHaveLength(1)

    // Verify enrichment_schedules deleted
    const remaining = await db
      .select()
      .from(enrichmentSchedules)
      .where(eq(enrichmentSchedules.listingId, listing.id))
    expect(remaining).toHaveLength(0)
  })

  it("intelligence consumer is a no-op", async () => {
    const handler = intelAccountClosedHandler()

    expect(handler.domain).toBe("intelligence")

    // Should complete without error
    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: ACCOUNT_ID,
      listingsArchived: ["list-001"],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })
  })
})

describe("AC-91: decay_signal_detected annotation", () => {
  it("annotates checkDetails with supportAnnotation when active ticket exists", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    // Insert a decay signal
    await db.insert(decaySignals).values({
      listingId: listing.id,
      signalType: "website_dead",
      severity: "high",
      checkDetails: { url: "https://example.com", error: "DNS_RESOLUTION_FAILED" },
    })

    // Insert an active support ticket
    await db.insert(supportTickets).values({
      listingId: listing.id,
      category: "data_quality",
      status: "open",
      priority: "normal",
      subject: "Website appears down",
      details: { source: "automated_decay_detection" },
    })

    const handler = decaySignalDetectedHandler({ db })

    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "website_dead", severity: "high" },
    })

    // Verify the signal was annotated
    const [updated] = await db
      .select({ checkDetails: decaySignals.checkDetails })
      .from(decaySignals)
      .where(
        and(
          eq(decaySignals.listingId, listing.id),
          isNull(decaySignals.resolvedAt),
        ),
      )
      .limit(1)

    expect(updated).toBeDefined()
    const details = updated.checkDetails as Record<string, unknown>
    expect(details.supportAnnotation).toBeDefined()

    const annotation = details.supportAnnotation as Record<string, unknown>
    expect(annotation.category).toBe("data_quality")
    expect(annotation.ticketId).toBeDefined()
  })

  it("does nothing when no active ticket exists", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)

    // Insert a decay signal but no ticket
    await db.insert(decaySignals).values({
      listingId: listing.id,
      signalType: "email_bounced",
      severity: "high",
      checkDetails: { email: "test@example.com" },
    })

    const handler = decaySignalDetectedHandler({ db })

    await handler.handler({
      _brand: "DecaySignalDetectedEvent" as const,
      listingId: listing.id,
      signal: { type: "email_bounced", severity: "high" },
    })

    // Check signal was NOT modified (no supportAnnotation)
    const [signal] = await db
      .select({ checkDetails: decaySignals.checkDetails })
      .from(decaySignals)
      .where(eq(decaySignals.listingId, listing.id))
      .limit(1)

    const details = signal.checkDetails as Record<string, unknown>
    expect(details.supportAnnotation).toBeUndefined()
  })
})

describe("AC-92: listing_created enrichment scheduling (integration)", () => {
  it("creates enrichment_schedules rows for unclaimed cadence", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const mock = createMockSchedulerDb()
    const handler = listingCreatedHandler({ db, schedulerDb: mock.db })

    await handler.handler({
      _brand: "ListingCreatedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      entityType: "company",
      slug: "test-co",
    })

    // Unclaimed cadence: website, email, ch (social/postcode/imdb are null)
    const schedules = await db
      .select()
      .from(enrichmentSchedules)
      .where(eq(enrichmentSchedules.listingId, listing.id))
    expect(schedules).toHaveLength(3)

    const checkTypes = schedules.map((s) => s.checkType).sort()
    expect(checkTypes).toEqual(["ch", "email", "website"])

    // All should be unclaimed cadence tier
    expect(schedules.every((s) => s.cadenceTier === "unclaimed")).toBe(true)
  })
})

describe("AC-95: profile_edited freshness reset (integration)", () => {
  it("resets lastCalculated timestamp on quality_scores", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const mock = createMockSchedulerDb()
    const handler = profileEditedHandler({ db, schedulerDb: mock.db })

    // Set a known past timestamp so the comparison is deterministic
    const pastDate = new Date("2025-01-01T00:00:00Z")
    await db
      .update(qualityScores)
      .set({ lastCalculated: pastDate })
      .where(eq(qualityScores.listingId, listing.id))

    await handler.handler({
      _brand: "ProfileEditedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      changedFields: ["bio"],
    })

    const [after] = await db
      .select({ lastCalculated: qualityScores.lastCalculated })
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))

    expect(after.lastCalculated.getTime()).toBeGreaterThan(pastDate.getTime())
  })
})

describe("AC-97: shortlist_added calibration signal (integration)", () => {
  it("inserts quality_calibration perception aggregate", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const handler = shortlistAddedHandler({ db })

    await handler.handler({
      _brand: "ShortlistAddedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      timestamp: new Date().toISOString(),
    })

    const [row] = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, listing.id),
          eq(perceptionAggregates.aggregateType, "quality_calibration"),
        ),
      )

    expect(row).toBeDefined()
    expect(row.sampleSize).toBe(1)
    const data = row.data as { signals: Array<{ type: string; count: number }> }
    expect(data.signals).toHaveLength(1)
    expect(data.signals[0].type).toBe("shortlist")
    expect(data.signals[0].count).toBe(1)
  })

  it("increments count on second shortlist for same listing in same week", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const handler = shortlistAddedHandler({ db })

    await handler.handler({
      _brand: "ShortlistAddedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      timestamp: new Date().toISOString(),
    })

    await handler.handler({
      _brand: "ShortlistAddedEvent" as const,
      listingId: listing.id,
      accountId: ACCOUNT_ID,
      timestamp: new Date().toISOString(),
    })

    const [row] = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, listing.id),
          eq(perceptionAggregates.aggregateType, "quality_calibration"),
        ),
      )

    expect(row.sampleSize).toBe(2)
    const data = row.data as { signals: Array<{ type: string; count: number }> }
    expect(data.signals[0].count).toBe(2)
  })
})

describe("AC-100: enquiry_submitted analytics (integration)", () => {
  it("creates quality_calibration and outreach_prioritisation aggregates", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const handler = enquirySubmittedHandler({ db })

    await handler.handler({
      _brand: "EnquirySubmittedEvent" as const,
      enquiryId: makeUUID("enq001"),
      listingId: listing.id,
      timestamp: new Date().toISOString(),
    })

    const calibration = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, listing.id),
          eq(perceptionAggregates.aggregateType, "quality_calibration"),
        ),
      )

    expect(calibration).toHaveLength(1)
    const calData = calibration[0].data as { signals: Array<{ type: string }> }
    expect(calData.signals[0].type).toBe("enquiry")

    const outreach = await db
      .select()
      .from(perceptionAggregates)
      .where(
        and(
          eq(perceptionAggregates.listingId, listing.id),
          eq(perceptionAggregates.aggregateType, "outreach_prioritisation"),
        ),
      )

    expect(outreach).toHaveLength(1)
    const outData = outreach[0].data as { enquiryCount: number }
    expect(outData.enquiryCount).toBe(1)
  })
})
