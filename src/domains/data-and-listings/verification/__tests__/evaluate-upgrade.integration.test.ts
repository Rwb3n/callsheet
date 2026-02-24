// CS-WORK-033: verification upgrade integration tests
// AC-37: evaluateVerificationUpgrade reads verifications table, returns eligible: false for non-claimed
// AC-38: Score computation: CH active = +1, trade body = +1, client credits (max +4), threshold = 6
// AC-39: Score >= 6 without portfolio review returns pending_human_review with TaskSpec
// AC-40: applyVerificationUpgrade emits verification_tier_changed event
// AC-41: Upgrade decision logged in decision_logs

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  createTestListing,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
  emptyConsumerMatrix,
} from "@/db/test-fixtures"
import {
  listings,
  verifications,
  accreditations,
  credits,
} from "@/db/schema/data-and-listings"
import { decisionLogs } from "@/db/schema/shared"
import type { CompaniesHouseService } from "@/lib/services/types"
import { InProcessEventBus, createWaitUntilCollector } from "@/lib/events"
import {
  evaluateVerificationUpgrade,
  applyVerificationUpgrade,
  checkTradeBodyMembership,
  countClientConfirmedCredits,
} from "@/domains/data-and-listings/verification/evaluate-upgrade"
import type { EvaluateUpgradeDeps, ApplyUpgradeDeps } from "@/domains/data-and-listings/verification/evaluate-upgrade"

let db: ReturnType<typeof getTestDb>

const OWNER_ID = "00000000-0000-0000-0000-000000000060"

function mockCH(overrides?: Partial<CompaniesHouseService>): CompaniesHouseService {
  return {
    lookup: async () => ({ found: false }),
    ...overrides,
  }
}

function makeEvalDeps(ch?: Partial<CompaniesHouseService>): EvaluateUpgradeDeps {
  return { db, companiesHouse: mockCH(ch) }
}

function makeApplyDeps(): ApplyUpgradeDeps & { emittedEvents: Array<{ type: string; payload: unknown }> } {
  const emittedEvents: Array<{ type: string; payload: unknown }> = []
  const { waitUntilFn } = createWaitUntilCollector()
  const eventBus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })

  const originalEmit = eventBus.emit.bind(eventBus)
  eventBus.emit = async (type: string, payload: unknown, wuf: unknown) => {
    emittedEvents.push({ type, payload })
    return originalEmit(
      type as Parameters<typeof originalEmit>[0],
      payload as Parameters<typeof originalEmit>[1],
      wuf as Parameters<typeof originalEmit>[2],
    )
  }

  return {
    db,
    decisionLogDb: createDecisionLogDb(db),
    eventBus,
    waitUntilFn,
    emittedEvents,
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER_ID)
})

afterAll(async () => {
  await closeTestDb()
})

// Helper: create a claimed listing with verification tier = "claimed"
async function createClaimedListing(overrides: Record<string, unknown> = {}) {
  const listing = await createTestListing(db, OWNER_ID, {
    claimStatus: "claimed",
    ...overrides,
  })
  // Set verification tier to claimed
  await db.update(verifications).set({
    tier: "claimed" as const,
    claimedAt: new Date(),
  }).where(eq(verifications.listingId, listing.id))
  return listing
}

// Helper: add trade body accreditations for a listing
async function addAccreditation(listingId: string) {
  await db.insert(accreditations).values({
    listingId,
    body: "BECTU",
    membershipType: "full",
  })
}

// Helper: add client-confirmed credits for a listing
async function addClientCredits(listingId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await db.insert(credits).values({
      listingId,
      projectName: `Project ${i + 1}`,
      roleProvided: "Camera Operator",
      year: 2025,
      format: "feature",
      sourcingMethod: "client_confirmed",
    })
  }
}

// ========== AC-37: reads verifications table, eligible: false for non-claimed ==========

describe("AC-37: evaluateVerificationUpgrade tier guard", () => {
  it("returns eligible: false when verification tier is unclaimed", async () => {
    const listing = await createTestListing(db, OWNER_ID, { claimStatus: "unclaimed" })
    // verification tier defaults to "unclaimed"
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps())

    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.score).toBe(0)
      expect(result.guidance).toContain("listing must be claimed first")
    }
  })

  it("proceeds with evaluation when verification tier is claimed", async () => {
    const listing = await createClaimedListing()
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps())

    // With no evidence, should return not eligible (score 0)
    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.score).toBe(0)
      expect(result.threshold).toBe(6)
    }
  })
})

// ========== AC-38: score computation ==========

describe("AC-38: score computation", () => {
  it("CH active adds +1 to score", async () => {
    const listing = await createClaimedListing({ companiesHouseNumber: "12345678" })
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps({
      lookup: async () => ({ found: true, status: "active", name: "Test Co", number: "12345678" }),
    }))

    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.score).toBe(1)
    }
  })

  it("trade body membership adds +1 to score", async () => {
    const listing = await createClaimedListing()
    await addAccreditation(listing.id)
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps())

    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.score).toBe(1)
    }
  })

  it("client credits add 2 points each, max 4", async () => {
    const listing = await createClaimedListing()
    await addClientCredits(listing.id, 3) // 3 credits × 2 = 6, capped at 4
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps())

    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.score).toBe(4) // min(3*2, 4) = 4
    }
  })

  it("checkTradeBodyMembership returns false when no accreditations", async () => {
    const listing = await createClaimedListing()
    const result = await checkTradeBodyMembership(db, listing.id)
    expect(result).toBe(false)
  })

  it("countClientConfirmedCredits returns 0 when no client-confirmed credits", async () => {
    const listing = await createClaimedListing()
    const result = await countClientConfirmedCredits(db, listing.id)
    expect(result).toBe(0)
  })

  it("countClientConfirmedCredits ignores non-client-confirmed credits", async () => {
    const listing = await createClaimedListing()
    await db.insert(credits).values({
      listingId: listing.id,
      projectName: "Self-reported project",
      roleProvided: "Director",
      year: 2025,
      format: "feature",
      sourcingMethod: "self_reported",
    })
    const result = await countClientConfirmedCredits(db, listing.id)
    expect(result).toBe(0)
  })

  it("provides guidance for missing checks", async () => {
    const listing = await createClaimedListing()
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps())

    expect(result.eligible).toBe(false)
    if (result.eligible === false) {
      expect(result.guidance).toContain("Add Companies House number for +1 point")
      expect(result.guidance).toContain("Add trade body membership for +1 point")
      expect(result.guidance).toContain("Get client-confirmed credits for up to +4 points")
    }
  })
})

// ========== AC-39: score >= 6 returns pending_human_review with TaskSpec ==========

describe("AC-39: score >= 6 routes to portfolio review", () => {
  it("returns pending_human_review when score reaches 6", async () => {
    const listing = await createClaimedListing({ companiesHouseNumber: "12345678" })
    await addAccreditation(listing.id)     // +1 = 2
    await addClientCredits(listing.id, 2)  // +4 = 6 (2 credits × 2 = 4)
    const [verification] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))

    const result = await evaluateVerificationUpgrade(listing, verification, makeEvalDeps({
      lookup: async () => ({ found: true, status: "active", name: "Test Co", number: "12345678" }),
    }))

    expect(result.eligible).toBe("pending_human_review")
    if (result.eligible === "pending_human_review") {
      expect(result.taskSpec.domain).toBe("verification")
      expect(result.taskSpec.context.callbackType).toBe("verification_upgrade")
      expect(result.taskSpec.context.newTier).toBe("verified")
      expect(result.taskSpec.context.score).toBe(6)
    }
  })
})

// ========== AC-40: applyVerificationUpgrade emits verification_tier_changed ==========

describe("AC-40: applyVerificationUpgrade emits verification_tier_changed", () => {
  it("emits event with correct previousTier and newTier", async () => {
    const listing = await createClaimedListing()
    const deps = makeApplyDeps()

    await applyVerificationUpgrade(deps, listing.id, "verified", 7)

    const tierEvent = deps.emittedEvents.find(e => e.type === "verification_tier_changed")
    expect(tierEvent).toBeDefined()
    const payload = tierEvent!.payload as Record<string, unknown>
    expect(payload.previousTier).toBe("claimed")
    expect(payload.newTier).toBe("verified")
    expect(payload.listingId).toBe(listing.id)
  })

  it("updates verifications table with new tier and score", async () => {
    const listing = await createClaimedListing()
    const deps = makeApplyDeps()

    await applyVerificationUpgrade(deps, listing.id, "verified", 7)

    const [ver] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(ver.tier).toBe("verified")
    expect(ver.verificationScore).toBe(7)
    expect(ver.verifiedAt).not.toBeNull()
    expect(ver.lastVerificationCheck).not.toBeNull()
  })
})

// ========== AC-41: upgrade decision logged in decision_logs ==========

describe("AC-41: upgrade decision logged", () => {
  it("creates decision log entry with verification_upgrade type", async () => {
    const listing = await createClaimedListing()
    const deps = makeApplyDeps()

    await applyVerificationUpgrade(deps, listing.id, "verified", 7)

    const logs = await db.select().from(decisionLogs)
    const upgradeLog = logs.find(l => l.decisionType === "verification_upgrade")
    expect(upgradeLog).toBeDefined()
    expect(upgradeLog!.domain).toBe("data-and-listings")
    expect((upgradeLog!.inputs as Record<string, unknown>).previousTier).toBe("claimed")
    expect((upgradeLog!.output as Record<string, unknown>).newTier).toBe("verified")
    expect(upgradeLog!.listingId).toBe(listing.id)
  })
})
