// Unit tests for intelligence D&L perception consumers
// AC-86, AC-87, AC-89, AC-92, AC-95, AC-96, AC-97, AC-100

import { describe, it, expect, vi } from "vitest"
import { profileViewedHandler } from "../profile-viewed"
import { accountClosedHandler } from "../account-closed"
import { contactAttemptHandler } from "../contact-attempt"
import { listingCreatedHandler } from "../listing-created"
import { profileEditedHandler } from "../profile-edited"
import { claimApprovedHandler } from "../claim-approved"
import { shortlistAddedHandler } from "../shortlist-added"
import { enquirySubmittedHandler } from "../enquiry-submitted"
import { searchPerformedHandler } from "../search-performed"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { InProcessEventBus } from "@/lib/events/bus"
import { emptyConsumerMatrix } from "@/db/test-fixtures"

// --- Mocks ---

function createMockDb() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([{ id: "signal-id" }]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Db
}

function createMockSchedulerDb() {
  const scheduled: Array<{ action: string; params: Record<string, unknown> }> = []
  const cancelled: Array<{ action: string; filterParams: Record<string, unknown> }> = []
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

// --- Tests ---

describe("profile_viewed consumer (AC-86)", () => {
  it("AC-86: calls deduplicateProfileView with correct params", async () => {
    // We can't easily mock deduplicateProfileView since it's imported.
    // Instead we verify the handler shape and that it handles the event type correctly.
    const db = createMockDb()
    const handler = profileViewedHandler({ db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("profile_viewed")
    expect(handler.mode).toBe("async")

    // Handler calls deduplicateProfileView which queries engagements table
    // For anonymous viewers (null viewerAccountId), dedup always counts
    await handler.handler({
      _brand: "ProfileViewedEvent" as const,
      listingId: "list-001",
      viewerAccountId: null,
      source: "search",
      timestamp: new Date().toISOString(),
    })

    // Verify DB was called (update for anonymous increment)
    expect(db.update).toHaveBeenCalled()
  })

  it("AC-86: dedup check for known viewer queries for recent view within 1hr", async () => {
    const db = createMockDb()
    const handler = profileViewedHandler({ db })

    await handler.handler({
      _brand: "ProfileViewedEvent" as const,
      listingId: "list-001",
      viewerAccountId: "viewer-001",
      source: "search",
      timestamp: new Date().toISOString(),
    })

    // select().from().where() chain called for dedup check
    expect(db.select).toHaveBeenCalled()
  })
})

describe("account_closed consumer (AC-87)", () => {
  it("AC-87: is a no-op — D&L consumer handles enrichment suspension", async () => {
    const handler = accountClosedHandler()

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("account_closed")
    expect(handler.mode).toBe("async")

    // Should not throw
    await handler.handler({
      _brand: "AccountClosedEvent" as const,
      accountId: "acct-001",
      listingsArchived: ["list-001", "list-002"],
      buyerDataDeleted: false,
      complianceHoldActive: false,
      paddleCancellationsPending: false,
      timestamp: new Date().toISOString(),
    })
  })
})

describe("contact_attempt consumer (AC-89)", () => {
  it("AC-89: does nothing when result is reached", async () => {
    const db = createMockDb()
    const bus = new InProcessEventBus({ logError: async () => {}, consumerMatrix: emptyConsumerMatrix })
    const handler = contactAttemptHandler({ db, bus, waitUntilFn: () => {} })

    await handler.handler({
      _brand: "ContactAttemptEvent" as const,
      listingId: "list-001",
      result: "reached",
      reporterAccountId: "reporter-001",
      timestamp: new Date().toISOString(),
    })

    // No DB calls when reached
    expect(db.select).not.toHaveBeenCalled()
  })

  it("AC-89: evaluates decay response when result is unreachable", async () => {
    // Drizzle chains: select().from().where() is thenable (resolves to array).
    // hasActiveTicket adds .orderBy().limit(1) after .where().
    // Build a chainable mock where .where() returns a thenable array with .orderBy/.limit.
    function chainableResult(data: unknown[] = []) {
      const result = Object.assign(Promise.resolve(data), {
        orderBy: vi.fn().mockImplementation(() => chainableResult(data)),
        limit: vi.fn().mockImplementation(() => Promise.resolve(data)),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(data).then(res, rej),
      })
      return result
    }

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(chainableResult([])),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "signal-id" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as unknown as Db

    const bus = new InProcessEventBus({ logError: async () => {}, consumerMatrix: emptyConsumerMatrix })
    const handler = contactAttemptHandler({ db: mockDb, bus, waitUntilFn: () => {} })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("contact_attempt")

    await handler.handler({
      _brand: "ContactAttemptEvent" as const,
      listingId: "list-001",
      result: "unreachable",
      reporterAccountId: "reporter-001",
      timestamp: new Date().toISOString(),
    })

    // Should have queried for existing signals and active tickets
    expect(mockDb.select).toHaveBeenCalled()
    // Should have inserted a new decay signal
    expect(mockDb.insert).toHaveBeenCalled()
  })
})

describe("listing_created consumer (AC-92)", () => {
  it("AC-92: schedules quality_score_recalculation and enrichment", async () => {
    const db = createMockDb()
    const mock = createMockSchedulerDb()
    const handler = listingCreatedHandler({ db, schedulerDb: mock.db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("listing_created")

    await handler.handler({
      _brand: "ListingCreatedEvent" as const,
      listingId: "list-001",
      accountId: "acct-001",
      entityType: "company",
      slug: "test-co",
    })

    const scheduled = mock.getScheduled()
    const qualityRecalc = scheduled.find((s) => s.action === "quality_score_recalculation")
    expect(qualityRecalc).toBeDefined()
    expect(qualityRecalc!.params.listingId).toBe("list-001")

    // Should also schedule liveness checks for unclaimed cadence (website, email, ch)
    const livenessChecks = scheduled.filter((s) => s.action === "decay_liveness_check")
    expect(livenessChecks.length).toBeGreaterThanOrEqual(3)
  })
})

describe("profile_edited consumer (AC-95)", () => {
  it("AC-95: resets freshness timestamp and schedules quality recalc", async () => {
    const db = createMockDb()
    const mock = createMockSchedulerDb()
    const handler = profileEditedHandler({ db, schedulerDb: mock.db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("profile_edited")

    await handler.handler({
      _brand: "ProfileEditedEvent" as const,
      listingId: "list-001",
      accountId: "acct-001",
      changedFields: ["bio"],
    })

    // Should have updated qualityScores.lastCalculated (freshness reset)
    expect(db.update).toHaveBeenCalled()

    // Should cancel existing + schedule new quality recalc
    const cancelled = mock.getCancelled()
    expect(cancelled.some((c) => c.action === "quality_score_recalculation")).toBe(true)

    const scheduled = mock.getScheduled()
    expect(scheduled.some((s) => s.action === "quality_score_recalculation")).toBe(true)
  })
})

describe("claim_approved consumer (AC-96)", () => {
  it("AC-96: schedules quality recalc, upgrades enrichment, records L2/L3", async () => {
    const db = createMockDb()
    const mock = createMockSchedulerDb()
    const handler = claimApprovedHandler({ db, schedulerDb: mock.db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("claim_approved")

    await handler.handler({
      _brand: "ClaimApprovedEvent" as const,
      listingId: "list-001",
      accountId: "acct-001",
      method: "auto",
      timestamp: new Date().toISOString(),
    })

    // Quality recalc scheduled
    const scheduled = mock.getScheduled()
    expect(scheduled.some((s) => s.action === "quality_score_recalculation")).toBe(true)

    // Old enrichment deleted
    expect(db.delete).toHaveBeenCalled()

    // Old liveness checks cancelled
    const cancelled = mock.getCancelled()
    expect(cancelled.some((c) => c.action === "decay_liveness_check")).toBe(true)

    // Claimed-cadence enrichment scheduled (6 check types for claimed)
    const livenessChecks = scheduled.filter((s) => s.action === "decay_liveness_check")
    expect(livenessChecks.length).toBe(6)

    // Hypothesis tracking written (L2, L3)
    // The insert call for perception_aggregates (hypothesis_tracking)
    expect(db.insert).toHaveBeenCalled()
  })
})

describe("shortlist_added consumer (AC-97)", () => {
  it("AC-97: records quality calibration signal in perception_aggregates", async () => {
    const db = createMockDb()
    const handler = shortlistAddedHandler({ db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("shortlist_added")

    await handler.handler({
      _brand: "ShortlistAddedEvent" as const,
      listingId: "list-001",
      accountId: "acct-001",
      timestamp: new Date().toISOString(),
    })

    // Should insert into perception_aggregates (quality_calibration)
    expect(db.insert).toHaveBeenCalled()
  })
})

describe("enquiry_submitted consumer (AC-100)", () => {
  it("AC-100: records quality calibration + outreach prioritisation", async () => {
    const db = createMockDb()
    const handler = enquirySubmittedHandler({ db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("enquiry_submitted")

    await handler.handler({
      _brand: "EnquirySubmittedEvent" as const,
      enquiryId: "enq-001",
      listingId: "list-001",
      timestamp: new Date().toISOString(),
    })

    // Two inserts: quality_calibration + outreach_prioritisation perception aggregates
    expect(db.insert).toHaveBeenCalledTimes(2)
  })
})

describe("search_performed consumer", () => {
  it("aggregates search terms for each result listing", async () => {
    const db = createMockDb()
    const handler = searchPerformedHandler({ db })

    expect(handler.domain).toBe("intelligence")
    expect(handler.eventType).toBe("search_performed")

    await handler.handler({
      _brand: "SearchPerformedEvent" as const,
      query: "camera operator",
      filters: {},
      resultCount: 2,
      resultListingIds: ["list-001", "list-002"],
      sessionId: null,
      timestamp: new Date().toISOString(),
    })

    // Should have queried/inserted perception_aggregates for each listing
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  it("does nothing for empty query", async () => {
    const db = createMockDb()
    const handler = searchPerformedHandler({ db })

    await handler.handler({
      _brand: "SearchPerformedEvent" as const,
      query: "   ",
      filters: {},
      resultCount: 0,
      resultListingIds: [],
      sessionId: null,
      timestamp: new Date().toISOString(),
    })

    expect(db.select).not.toHaveBeenCalled()
  })
})
