// CS-WORK-015: Company listing creation and CH lookup integration tests
// AC-11, AC-12, AC-13, AC-14, AC-15

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

const ACCOUNT_ID = "test-company-001"
const ACCOUNT_EMAIL = "bob@acmestudio.com"

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
    companiesHouse: { lookup: vi.fn(async () => ({ found: false })) },
    emailService,
    schedulerDb: createSchedulerDb(db),
    ...overrides,
  }
}

beforeAll(() => { db = getTestDb() })
beforeEach(async () => {
  await resetDb()
  clearTemplates()
  registerListingLiveTemplate()
  registerWelcomeTemplate()
})
afterAll(async () => { await closeTestDb() })

async function setupUserAndTaxonomy() {
  await seedUsers(db, [{ id: ACCOUNT_ID, name: "Bob Studio", email: ACCOUNT_EMAIL }])
  await db.insert(accountProfiles).values({ accountId: ACCOUNT_ID, fullName: "Bob Studio" })
  return seedTaxonomy(db)
}

describe("AC-11: Company listing created with correct entity type and taxonomy tags", () => {
  it("creates company listing with entityType from input and min 1 tag", async () => {
    const tax = await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: true, status: "active" as const, name: "Acme Studio Ltd" })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createCompany({
      companyName: "Acme Studio",
      entityType: "company",
      companiesHouseNumber: "12345678",
      taxonomyTags: [
        { sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id },
        { sectorId: tax.sound.id, serviceAreaId: tax.soundRecording.id },
      ],
      baseRegion: "London",
    })

    expect(result.status).toBe("created")
    if (result.status !== "created") return
    expect(result.slug).toBeDefined()

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.slug, result.slug))

    expect(listing.entityType).toBe("company")
    expect(listing.name).toBe("Acme Studio")
    expect(listing.companiesHouseNumber).toBe("12345678")
    expect(listing.claimStatus).toBe("claimed")
    expect(listing.lifecycleStatus).toBe("active")
    expect(listing.subscriptionTier).toBe("free")

    // Companion rows
    const [v] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(v.tier).toBe("claimed")

    const [q] = await db.select().from(qualityScores).where(eq(qualityScores.listingId, listing.id))
    expect(q.composite).toBe(0)

    const [e] = await db.select().from(engagements).where(eq(engagements.listingId, listing.id))
    expect(e.profileViews).toBe(0)

    const tags = await db.select().from(listingTaxonomyTags).where(eq(listingTaxonomyTags.listingId, listing.id))
    expect(tags).toHaveLength(2)
  })

  it("creates education entity type", async () => {
    const tax = await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: false })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createCompany({
      companyName: "Film School UK",
      entityType: "education",
      taxonomyTags: [{ sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id }],
      baseRegion: "Manchester",
    })

    expect(result.status).toBe("created")
    if (result.status !== "created") return

    const [listing] = await db.select().from(listings).where(eq(listings.slug, result.slug))
    expect(listing.entityType).toBe("education")
  })
})

describe("AC-12: Companies House lookup returns company data", () => {
  it("returns company data for valid CH number", async () => {
    await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({
        found: true,
        status: "active" as const,
        name: "Acme Studio Ltd",
        registeredAddress: "123 Film Lane, London",
      })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.lookupCompaniesHouse({ companyNumber: "12345678" })

    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.name).toBe("Acme Studio Ltd")
    expect(result.status).toBe("active")
    expect(result.registeredAddress).toBe("123 Film Lane, London")
    expect(result.dissolved).toBe(false)
  })

  it("returns found=false for unknown CH number", async () => {
    await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: false })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.lookupCompaniesHouse({ companyNumber: "99999999" })
    expect(result.found).toBe(false)
  })
})

describe("AC-13: Dissolved company shows warning", () => {
  it("returns dissolved=true for dissolved CH company", async () => {
    await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({
        found: true,
        status: "dissolved" as const,
        name: "Dead Co Ltd",
      })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.lookupCompaniesHouse({ companyNumber: "DISSOLVED1" })

    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.dissolved).toBe(true)
    expect(result.status).toBe("dissolved")
  })
})

describe("AC-14: Full integrity pipeline runs for company creation", () => {
  it("runs duplicate + identity verification + CH uniqueness", async () => {
    const tax = await setupUserAndTaxonomy()
    const lookupFn = vi.fn(async () => ({ found: true, status: "active" as const, name: "Test Co" }))
    const ch: CompaniesHouseService = { lookup: lookupFn }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    await caller.createCompany({
      companyName: "Test Co",
      entityType: "company",
      companiesHouseNumber: "11111111",
      taxonomyTags: [{ sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id }],
      baseRegion: "Bristol",
    })

    // CH lookup called by verifyIdentity
    expect(lookupFn).toHaveBeenCalledWith("11111111")
  })

  it("rejects dissolved company at creation (identity verification rejects)", async () => {
    const tax = await setupUserAndTaxonomy()
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: true, status: "dissolved" as const, name: "Dead Co" })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    // Dissolved → integrity rejects → flagged path (suspended + pending_review)
    const result = await caller.createCompany({
      companyName: "Dead Co",
      entityType: "company",
      companiesHouseNumber: "DISSOLVED1",
      taxonomyTags: [{ sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id }],
      baseRegion: "London",
    })

    expect(result.status).toBe("flagged")
    if (result.status !== "flagged") return
    expect(result.reason).toContain("dissolved")
  })
})

describe("AC-15: Flagged company listing created with suspended + pending_review", () => {
  it("creates listing with lifecycleStatus=suspended and claimStatus=pending_review when flagged", async () => {
    const tax = await setupUserAndTaxonomy()
    // CH not found → flag_for_review
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: false })),
    }
    const deps = makeDeps({ companiesHouse: ch })
    const emailService = deps.emailService as InMemoryEmailService
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createCompany({
      companyName: "Suspicious Co",
      entityType: "company",
      companiesHouseNumber: "NONEXIST1",
      taxonomyTags: [{ sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id }],
      baseRegion: "Edinburgh",
    })

    expect(result.status).toBe("flagged")
    if (result.status !== "flagged") return
    expect(result.listingId).toBeDefined()

    // Verify listing exists but is suspended
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, result.listingId))

    expect(listing).toBeDefined()
    expect(listing.lifecycleStatus).toBe("suspended")
    expect(listing.claimStatus).toBe("pending_review")
    expect(listing.name).toBe("Suspicious Co")

    // Companion rows still created
    const [v] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
    expect(v).toBeDefined()
    expect(v.tier).toBe("unclaimed")

    // No listing_live email for flagged listings
    expect(emailService.getCalls()).toHaveLength(0)

    // No progressive disclosure for flagged listings
    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "send_progressive_email"))
    expect(actions).toHaveLength(0)
  })

  it("non-flagged company gets full post-creation effects", async () => {
    const tax = await setupUserAndTaxonomy()
    // No CH number → identity check skipped → passes
    const ch: CompaniesHouseService = {
      lookup: vi.fn(async () => ({ found: false })),
    }
    const emailService = new InMemoryEmailService()
    const deps = makeDeps({ companiesHouse: ch, emailService })
    const router = createListingCreationRouter(deps)
    const session = makeSession({ accountId: ACCOUNT_ID, email: ACCOUNT_EMAIL })
    const caller = router.createCaller(ctx(session))

    const result = await caller.createCompany({
      companyName: "Clean Co",
      entityType: "company",
      // No CH number — integrity passes (no identity check, no CH uniqueness check)
      taxonomyTags: [{ sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id }],
      baseRegion: "Cardiff",
    })

    expect(result.status).toBe("created")

    // listing_live email sent
    expect(emailService.wasCalledWith("listing_live")).toBe(true)

    // Progressive disclosure scheduled
    const actions = await db
      .select()
      .from(deferredActions)
      .where(eq(deferredActions.action, "send_progressive_email"))
    expect(actions).toHaveLength(3)
  })
})
