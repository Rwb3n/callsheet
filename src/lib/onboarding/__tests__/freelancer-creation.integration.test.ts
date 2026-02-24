// CS-WORK-014: Freelancer listing creation integration tests
// AC-06, AC-07, AC-08, AC-09, AC-10

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedUsers, makeSession, ctx, seedTaxonomy, createSchedulerDb, emptyConsumerMatrix } from "@/db/test-fixtures"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
  listingTaxonomyTags,
} from "@/db/schema/data-and-listings"
import { accountProfiles } from "@/db/schema/accounts"
import { deferredActions } from "@/db/schema/shared"
import { createListingCreationRouter } from "@/server/routers/listing-creation"
import type { ListingCreationRouterDeps } from "@/server/routers/listing-creation"
import { InProcessEventBus } from "@/lib/events/bus"
import { createWaitUntilCollector } from "@/lib/events/waitUntil"
import { InMemoryEmailService, clearTemplates } from "@/lib/email"
import { registerListingLiveTemplate, registerWelcomeTemplate } from "@/lib/onboarding/email-templates"
import type { CompaniesHouseService } from "@/lib/services/types"
import { TRPCError } from "@trpc/server"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "test-freelancer-001"
const ACCOUNT_EMAIL = "jane@example.com"

// Stub CompaniesHouse — not used for freelancer path
const stubCH: CompaniesHouseService = {
  lookup: vi.fn(async () => ({ found: false })),
}

function makeDeps(overrides?: Partial<ListingCreationRouterDeps>): ListingCreationRouterDeps {
  const emailService = new InMemoryEmailService()
  const { waitUntilFn } = createWaitUntilCollector()
  const bus = new InProcessEventBus({
    logError: async () => {},
    consumerMatrix: emptyConsumerMatrix,
  })
  return {
    db,
    bus,
    waitUntilFn,
    companiesHouse: stubCH,
    emailService,
    schedulerDb: createSchedulerDb(db),
    ...overrides,
  }
}

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerListingLiveTemplate()
  registerWelcomeTemplate()
})

afterAll(async () => {
  await closeTestDb()
})

async function setupUserAndTaxonomy() {
  await seedUsers(db, [{ id: ACCOUNT_ID, name: "Jane Doe", email: ACCOUNT_EMAIL }])
  await db.insert(accountProfiles).values({ accountId: ACCOUNT_ID, fullName: "Jane Doe" })
  return seedTaxonomy(db)
}

describe("AC-06: Freelancer listing created with correct defaults", () => {
  it("creates listing with entityType=freelancer, claimStatus=claimed, verificationTier=claimed, subscriptionTier=free", async () => {
    const tax = await setupUserAndTaxonomy()
    const deps = makeDeps()
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "Experienced cinematographer",
      baseRegion: "London",
    })

    expect(result.slug).toBeDefined()
    expect(result.slug).toContain("experienced-cinematographer")

    // Verify listing row
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.slug, result.slug))

    expect(listing.entityType).toBe("freelancer")
    expect(listing.claimStatus).toBe("claimed")
    expect(listing.subscriptionTier).toBe("free")
    expect(listing.lifecycleStatus).toBe("active")
    expect(listing.accountId).toBe(ACCOUNT_ID)

    // Verify verification row
    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.listingId, listing.id))
    expect(verification.tier).toBe("claimed")
    expect(verification.claimedAt).toBeDefined()

    // Verify quality_scores zero-init
    const [quality] = await db
      .select()
      .from(qualityScores)
      .where(eq(qualityScores.listingId, listing.id))
    expect(quality.composite).toBe(0)
    expect(quality.completeness).toBe(0)

    // Verify quality_score_explanations
    const [explanation] = await db
      .select()
      .from(qualityScoreExplanations)
      .where(eq(qualityScoreExplanations.listingId, listing.id))
    expect(explanation).toBeDefined()

    // Verify engagements zero-init
    const [engagement] = await db
      .select()
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))
    expect(engagement.profileViews).toBe(0)
    expect(engagement.enquiriesReceived).toBe(0)

    // Verify taxonomy tags
    const tags = await db
      .select()
      .from(listingTaxonomyTags)
      .where(eq(listingTaxonomyTags.listingId, listing.id))
    expect(tags).toHaveLength(1)
    expect(tags[0].sectorId).toBe(tax.camera.id)
    expect(tags[0].serviceAreaId).toBe(tax.cinematography.id)
  })

  it("creates taxonomy tags for primary + additional tags", async () => {
    const tax = await setupUserAndTaxonomy()
    const deps = makeDeps()
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      additionalTags: [
        { sectorId: tax.camera.id, serviceAreaId: tax.cameraOp.id },
        { sectorId: tax.sound.id, serviceAreaId: tax.soundRecording.id },
      ],
      headline: "Multi-skilled camera and sound",
      baseRegion: "Manchester",
    })

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.slug, result.slug))

    const tags = await db
      .select()
      .from(listingTaxonomyTags)
      .where(eq(listingTaxonomyTags.listingId, listing.id))

    // 1 primary + 2 additional
    expect(tags).toHaveLength(3)
  })
})

describe("AC-07: Integrity checks flag_for_review blocks listing", () => {
  it("rejects creation when duplicate detected (>80% taxonomy overlap)", async () => {
    const tax = await setupUserAndTaxonomy()
    const deps = makeDeps()
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    // Create first listing
    await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "First cinematographer listing",
      baseRegion: "London",
    })

    // Attempt duplicate — same account, same service area
    await expect(
      caller.createFreelancer({
        primarySectorId: tax.camera.id,
        primaryServiceAreaId: tax.cinematography.id,
        headline: "Second cinematographer listing",
        baseRegion: "London",
      }),
    ).rejects.toThrow(TRPCError)

    // Verify only one listing exists
    const allListings = await db.select().from(listings)
    expect(allListings).toHaveLength(1)
  })

  it("allows creation when different service area (no overlap)", async () => {
    const tax = await setupUserAndTaxonomy()
    const deps = makeDeps()
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "Cinematographer listing",
      baseRegion: "London",
    })

    // Different service area — should succeed
    const result = await caller.createFreelancer({
      primarySectorId: tax.sound.id,
      primaryServiceAreaId: tax.soundRecording.id,
      headline: "Sound recordist listing",
      baseRegion: "London",
    })

    expect(result.slug).toBeDefined()
    const allListings = await db.select().from(listings)
    expect(allListings).toHaveLength(2)
  })
})

describe("AC-08: listing_created event emitted after creation", () => {
  it("emits listing_created with correct payload", async () => {
    const tax = await setupUserAndTaxonomy()
    const emittedEvents: Array<{ type: string; payload: unknown }> = []
    const { waitUntilFn } = createWaitUntilCollector()
    const bus = new InProcessEventBus({
      logError: async () => {},
      consumerMatrix: {
        ...emptyConsumerMatrix,
        listing_created: [
          { consumer: "testCapture", domain: "platform", mode: "async" },
        ],
      },
    })

    bus.on({
      domain: "platform",
      eventType: "listing_created",
      mode: "async",
      handler: async (payload) => {
        emittedEvents.push({ type: "listing_created", payload })
      },
    })

    const deps = makeDeps({ bus, waitUntilFn })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "Event test cinematographer",
      baseRegion: "Bristol",
    })

    // Flush async handlers
    await new Promise((r) => setTimeout(r, 50))

    expect(emittedEvents).toHaveLength(1)
    const event = emittedEvents[0].payload as {
      listingId: string
      accountId: string
      entityType: string
      slug: string
    }
    expect(event.accountId).toBe(ACCOUNT_ID)
    expect(event.entityType).toBe("freelancer")
    expect(event.slug).toBe(result.slug)
    expect(event.listingId).toBeDefined()
  })
})

describe("AC-09: Progressive disclosure deferred actions scheduled", () => {
  it("schedules Day 1, 3, 7 deferred actions after creation", async () => {
    const tax = await setupUserAndTaxonomy()
    const deps = makeDeps()
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "Scheduled actions test",
      baseRegion: "Edinburgh",
    })

    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "send_progressive_email"))

    expect(actions).toHaveLength(3)

    const templates = actions.map(
      (a) => (a.params as { template: string }).template,
    ).sort()
    expect(templates).toEqual(["profile_day1", "profile_day3", "profile_day7"])

    // Verify each has correct listingId
    const listingIds = new Set(
      actions.map((a) => (a.params as { listingId: string }).listingId),
    )
    expect(listingIds.size).toBe(1)

    // Verify executeAt ordering (day1 < day3 < day7)
    const sortedByTime = [...actions].sort(
      (a, b) => a.executeAt.getTime() - b.executeAt.getTime(),
    )
    expect((sortedByTime[0].params as { template: string }).template).toBe("profile_day1")
    expect((sortedByTime[1].params as { template: string }).template).toBe("profile_day3")
    expect((sortedByTime[2].params as { template: string }).template).toBe("profile_day7")
  })
})

describe("AC-10: listing_live email sent after creation", () => {
  it("sends listing_live email to account email", async () => {
    const tax = await setupUserAndTaxonomy()
    const emailService = new InMemoryEmailService()
    const deps = makeDeps({ emailService })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createFreelancer({
      primarySectorId: tax.camera.id,
      primaryServiceAreaId: tax.cinematography.id,
      headline: "Email test cinematographer",
      baseRegion: "Cardiff",
    })

    const calls = emailService.getCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].template).toBe("listing_live")
    expect(calls[0].to).toBe(ACCOUNT_EMAIL)
    expect(calls[0].category).toBe("transactional")
    expect(calls[0].data).toMatchObject({ name: "Email test cinematographer", slug: result.slug })
  })
})
