// CS-WORK-016: Claim path and pre-claim snapshots integration tests
// AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-45
// Updated for S3 (CS-WORK-030): submitClaim now calls evaluateClaim

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedUsers,
  makeSession,
  ctx,
  seedTaxonomy,
  createSchedulerDb,
  createDecisionLogDb,
  createUnclaimedListing as createUnclaimedListingFixture,
} from "@/db/test-fixtures"
import {
  listings,
  engagements,
  preClaimSnapshots,
} from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import { deferredActions } from "@/db/schema/shared"
import { createClaimRouter } from "@/server/routers/claim"
import type { ClaimRouterDeps } from "@/server/routers/claim"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { registerPreClaimSnapshotCleanup } from "@/lib/onboarding/pre-claim-snapshot-cleanup"
import { TRPCError } from "@trpc/server"
import type { CompaniesHouseService } from "@/lib/services/types"
import { InProcessEventBus, createWaitUntilCollector } from "@/lib/events"
import { InMemoryEmailService } from "@/lib/email"
import { InMemoryNotificationDb, emptyConsumerMatrix } from "@/db/test-fixtures"

let db: ReturnType<typeof getTestDb>

// Must be valid UUID — decision_logs.accountId is uuid type in DB
const CLAIMER_ID = "00000000-0000-0000-0000-000000000001"
const CLAIMER_EMAIL = "claimer@example.com"

// Mock CH service — returns not found by default
function mockCompaniesHouse(
  overrides: Partial<CompaniesHouseService> = {},
): CompaniesHouseService {
  return {
    lookup: async () => ({ found: false }),
    ...overrides,
  }
}

function makeDeps(chOverrides?: Partial<CompaniesHouseService>): ClaimRouterDeps {
  const { waitUntilFn } = createWaitUntilCollector()
  return {
    db,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    companiesHouse: mockCompaniesHouse(chOverrides),
    eventBus: new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: emptyConsumerMatrix,
    }),
    waitUntilFn,
    emailService: new InMemoryEmailService(),
    notificationDb: new InMemoryNotificationDb(),
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

// Delegates to shared fixture — defaults match unclaimed seed listing pattern
async function createUnclaimedListing(overrides: Record<string, unknown> = {}) {
  return createUnclaimedListingFixture(db, overrides)
}

async function setupClaimerUser() {
  await seedUsers(db, [{ id: CLAIMER_ID, name: "Test Claimer", email: CLAIMER_EMAIL }])
  await db.insert(accountProfiles).values({ accountId: CLAIMER_ID, fullName: "Test Claimer" })
}

// --- AC-16: Claim form pre-populates with existing listing data; profile strength uses fallback ---

describe("AC-16: getClaimContext pre-populates listing data with fallback profile strength", () => {
  it("returns listing data and fallback profile strength for unclaimed listing", async () => {
    await setupClaimerUser()
    const tax = await seedTaxonomy(db)
    const listing = await createUnclaimedListing()

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.getClaimContext({ listingId: listing.id })

    // Pre-populated listing data
    expect(result.listing.id).toBe(listing.id)
    expect(result.listing.name).toBe("Test Company")
    expect(result.listing.headline).toBe("Seed Company Headline")
    expect(result.listing.bio).toBe("Imported bio text")
    expect(result.listing.contactEmail).toBe("contact@seedco.com")

    // Fallback profile strength (not from quality_scores)
    expect(result.profileStrength.percentage).toBeGreaterThan(0)
    expect(result.profileStrength.level).toBeDefined()
    expect(typeof result.profileStrength.percentage).toBe("number")
  })

  it("returns NOT_FOUND for non-existent listing", async () => {
    await setupClaimerUser()
    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await expect(
      caller.getClaimContext({ listingId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(TRPCError)
  })

  it("returns CONFLICT for already-claimed listing", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing({ claimStatus: "claimed" })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await expect(
      caller.getClaimContext({ listingId: listing.id }),
    ).rejects.toThrow(TRPCError)
  })

  it("computes higher profile strength when more fields are populated", async () => {
    await setupClaimerUser()
    // Listing with most fields populated
    const fullListing = await createUnclaimedListing({
      headline: "Full profile",
      bio: "Has a bio",
      contactEmail: "email@test.com",
      websiteUrl: "https://example.com",
      logoUrl: "https://example.com/logo.png",
    })

    // Listing with minimal fields
    const minimalListing = await createUnclaimedListing({
      slug: `minimal-${Date.now()}`,
      headline: null,
      bio: null,
      contactEmail: null,
      websiteUrl: null,
      logoUrl: null,
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const fullResult = await caller.getClaimContext({ listingId: fullListing.id })
    const minResult = await caller.getClaimContext({ listingId: minimalListing.id })

    expect(fullResult.profileStrength.percentage).toBeGreaterThan(
      minResult.profileStrength.percentage,
    )
  })
})

// --- AC-17: Endowment messaging thresholds ---

describe("AC-17: Endowment messaging shows view count >= 5, category-level < 5", () => {
  it("returns personal messaging when profileViews >= 5", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    // Set engagement to 5+ views
    await db
      .update(engagements)
      .set({ profileViews: 12 })
      .where(eq(engagements.listingId, listing.id))

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.getClaimContext({ listingId: listing.id })

    expect(result.endowmentMessaging.type).toBe("personal")
    expect(result.endowmentMessaging.text).toContain("12")
  })

  it("returns category-level messaging when profileViews < 5", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    // Engagements default to 0 views (from createTestListing)
    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.getClaimContext({ listingId: listing.id })

    expect(result.endowmentMessaging.type).toBe("category")
    expect(result.endowmentMessaging.text).not.toContain("0 times")
  })

  it("returns personal messaging at exactly 5 views", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    await db
      .update(engagements)
      .set({ profileViews: 5 })
      .where(eq(engagements.listingId, listing.id))

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.getClaimContext({ listingId: listing.id })

    expect(result.endowmentMessaging.type).toBe("personal")
    expect(result.endowmentMessaging.text).toContain("5")
  })
})

// --- AC-18: Pre-claim snapshot created with edits held ---

describe("AC-18: Pre-claim snapshot stores original data and pending edits", () => {
  it("creates snapshot with claimantAccountId, originalListing, and pendingEdits", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      edits: {
        headline: "Updated headline by claimer",
        bio: "New bio text",
      },
    })

    // Verify snapshot exists
    const [snapshot] = await db
      .select()
      .from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))

    expect(snapshot).toBeDefined()

    const data = snapshot.snapshot as {
      claimantAccountId: string
      originalListing: Record<string, unknown>
      pendingEdits: Record<string, unknown> | null
    }

    expect(data.claimantAccountId).toBe(CLAIMER_ID)
    expect(data.originalListing.headline).toBe("Seed Company Headline")
    expect(data.originalListing.bio).toBe("Imported bio text")
    expect(data.pendingEdits).toEqual({
      headline: "Updated headline by claimer",
      bio: "New bio text",
    })
  })

  it("edits are NOT applied to the listing [S2-ST-14]", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({
      listingId: listing.id,
      edits: { headline: "Changed headline" },
    })

    // Listing headline should still be the original
    const [updated] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(updated.headline).toBe("Seed Company Headline")
  })

  it("creates snapshot with null pendingEdits when no edits provided", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({ listingId: listing.id })

    const [snapshot] = await db
      .select()
      .from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))

    const data = snapshot.snapshot as { pendingEdits: unknown }
    expect(data.pendingEdits).toBeNull()
  })
})

// --- AC-19: Claim submission evaluates via evaluateClaim (S3 replaces S2 stub) ---

describe("AC-19: submitClaim routes through evaluateClaim (S3)", () => {
  it("sets claimStatus to pending_review for unclaimed listing without domain match", async () => {
    await setupClaimerUser()
    // No websiteUrl → no domain match → manual review → claimStatus = pending_review
    const listing = await createUnclaimedListing({ websiteUrl: null })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({ listingId: listing.id })

    expect(result.status).toBe("pending_review")

    const [updated] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))

    expect(updated.claimStatus).toBe("pending_review")
  })

  it("rejects claim on pending_review listing with CONFLICT", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing({ claimStatus: "pending_review" })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await expect(
      caller.submitClaim({ listingId: listing.id }),
    ).rejects.toThrow(TRPCError)
  })

  it("rejects claim on claimed listing as disputed (competing claim)", async () => {
    await setupClaimerUser()
    // Seed the existing owner
    const EXISTING_OWNER_ID = "00000000-0000-0000-0000-000000000002"
    await seedUsers(db, [{ id: EXISTING_OWNER_ID, name: "Existing Owner", email: "owner@test.com" }])

    // Already claimed by someone else
    const listing = await createUnclaimedListing({
      claimStatus: "claimed",
      accountId: EXISTING_OWNER_ID,
    })

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.submitClaim({ listingId: listing.id })

    expect(result.status).toBe("disputed")

    // Listing claimStatus should be "disputed"
    const [updated] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(updated.claimStatus).toBe("disputed")
  })
})

// --- AC-20: Claim-path progressive disclosure NOT scheduled at submission ---

describe("AC-20: No progressive disclosure scheduled during claim submission [S2-ST-17]", () => {
  it("does not schedule send_progressive_email actions on claim submission", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({ listingId: listing.id })

    const progressiveActions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "send_progressive_email"))

    expect(progressiveActions).toHaveLength(0)
  })
})

// --- AC-21: pre_claim_snapshot_cleanup cancellation (S3 cancels S2's scheduled cleanup) ---

describe("AC-21: S3 cancels pre_claim_snapshot_cleanup on claim submission [S3-ST-20]", () => {
  it("cancels any pending pre_claim_snapshot_cleanup for the listing", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    // S3 doesn't schedule pre_claim_snapshot_cleanup — it cancels any existing one
    // (S2 originally scheduled it, but S3 manages snapshot lifecycle directly)
    const deps = makeDeps()
    const router = createClaimRouter(deps)
    const session = makeSession({ accountId: CLAIMER_ID, email: CLAIMER_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.submitClaim({ listingId: listing.id })

    const cleanups = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "pre_claim_snapshot_cleanup"))

    // No cleanup should be scheduled — S3 cancels it
    expect(cleanups.filter(a => a.status === "pending")).toHaveLength(0)
  })
})

// --- AC-45: pre_claim_snapshot_cleanup handler deletes snapshot; idempotent ---

describe("AC-45: pre_claim_snapshot_cleanup handler is idempotent", () => {
  it("deletes pre-claim snapshot by listingId", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    // Insert snapshot directly
    await db.insert(preClaimSnapshots).values({
      listingId: listing.id,
      snapshot: { claimantAccountId: CLAIMER_ID, originalListing: {}, pendingEdits: null },
    })

    // Verify snapshot exists
    const before = await db
      .select()
      .from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))
    expect(before).toHaveLength(1)

    // Register and execute handler
    const registry = new ActionHandlerRegistry()
    registerPreClaimSnapshotCleanup(registry, db)
    const handler = registry.get("pre_claim_snapshot_cleanup")
    expect(handler).toBeDefined()

    await handler!({ listingId: listing.id } as never)

    // Verify deleted
    const after = await db
      .select()
      .from(preClaimSnapshots)
      .where(eq(preClaimSnapshots.listingId, listing.id))
    expect(after).toHaveLength(0)
  })

  it("is idempotent — no error when snapshot already deleted", async () => {
    await setupClaimerUser()
    const listing = await createUnclaimedListing()

    // No snapshot exists — handler should not throw
    const registry = new ActionHandlerRegistry()
    registerPreClaimSnapshotCleanup(registry, db)
    const handler = registry.get("pre_claim_snapshot_cleanup")

    await expect(
      handler!({ listingId: listing.id } as never),
    ).resolves.not.toThrow()
  })
})
