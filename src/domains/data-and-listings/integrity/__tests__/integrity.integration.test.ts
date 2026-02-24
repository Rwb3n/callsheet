// AC-27, AC-28, AC-29, AC-30: Integrity rules integration tests
// Runs against local Supabase Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  listings,
  listingTaxonomyTags,
  taxonomySectors,
  taxonomyServiceAreas,
} from "@/db/schema/data-and-listings"
import { user } from "@/db/schema/auth"
import { checkDuplicate } from "../duplicate-detection"
import { verifyIdentity } from "../identity-verification"
import { checkCHUniqueness } from "../ch-uniqueness"
import { InMemoryCompaniesHouseService } from "@/lib/services/mocks"

let db: ReturnType<typeof getTestDb>
let chService: InMemoryCompaniesHouseService

// Seed IDs
const ACCOUNT_A = "test-account-a"
const ACCOUNT_B = "test-account-b"
let sectorId: number
let serviceAreaIds: number[]

async function seedTaxonomy() {
  const [sector] = await db
    .insert(taxonomySectors)
    .values({ name: "Camera", slug: "camera", sortOrder: 1 })
    .returning({ id: taxonomySectors.id })
  sectorId = sector.id

  const areas = await db
    .insert(taxonomyServiceAreas)
    .values([
      { sectorId, name: "Cinematography", slug: "cinematography", sortOrder: 1 },
      { sectorId, name: "Camera Op", slug: "camera-op", sortOrder: 2 },
      { sectorId, name: "Steadicam", slug: "steadicam", sortOrder: 3 },
      { sectorId, name: "Drone", slug: "drone", sortOrder: 4 },
      { sectorId, name: "Underwater", slug: "underwater", sortOrder: 5 },
    ])
    .returning({ id: taxonomyServiceAreas.id })
  serviceAreaIds = areas.map((a) => a.id)
}

async function seedUsers() {
  await db.insert(user).values([
    { id: ACCOUNT_A, name: "Alice Smith", email: "alice@test.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: ACCOUNT_B, name: "Bob Jones", email: "bob@test.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ])
}

async function createListing(opts: {
  accountId: string
  name: string
  slug: string
  ch?: string
  tagServiceAreaIds?: number[]
}) {
  const [lst] = await db
    .insert(listings)
    .values({
      accountId: opts.accountId,
      entityType: "company",
      name: opts.name,
      slug: opts.slug,
      companiesHouseNumber: opts.ch ?? null,
    })
    .returning({ id: listings.id })

  if (opts.tagServiceAreaIds?.length) {
    await db.insert(listingTaxonomyTags).values(
      opts.tagServiceAreaIds.map((saId) => ({
        listingId: lst.id,
        sectorId,
        serviceAreaId: saId,
      })),
    )
  }
  return lst.id
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  chService = new InMemoryCompaniesHouseService()
  await seedTaxonomy()
  await seedUsers()
})

afterAll(async () => {
  await closeTestDb()
})

describe("Rule 1: Duplicate Detection", () => {
  // AC-27: >80% taxonomy overlap to same-account listing → flagged
  it("flags listing with >80% taxonomy overlap to same-account listing", async () => {
    // Existing listing: 5 service areas
    await createListing({
      accountId: ACCOUNT_A,
      name: "Alpha Cameras",
      slug: "alpha-cameras",
      tagServiceAreaIds: serviceAreaIds, // all 5
    })

    // New listing shares 5/5 = 100% overlap
    const result = await checkDuplicate(
      {
        accountId: ACCOUNT_A,
        tags: serviceAreaIds.map((saId) => ({ sectorId, serviceAreaId: saId })),
      },
      db,
    )

    expect(result.action).toBe("flag_duplicate")
  })

  it("allows listing with <=80% taxonomy overlap", async () => {
    // Existing listing: 5 service areas
    await createListing({
      accountId: ACCOUNT_A,
      name: "Alpha Cameras",
      slug: "alpha-cameras",
      tagServiceAreaIds: serviceAreaIds, // all 5
    })

    // New listing shares 1/5 service areas → 20% overlap
    const result = await checkDuplicate(
      {
        accountId: ACCOUNT_A,
        tags: [{ sectorId, serviceAreaId: serviceAreaIds[0] }],
      },
      db,
    )

    expect(result.action).toBe("allow")
  })

  it("ignores listings from different accounts", async () => {
    await createListing({
      accountId: ACCOUNT_B,
      name: "Beta Cameras",
      slug: "beta-cameras",
      tagServiceAreaIds: serviceAreaIds,
    })

    const result = await checkDuplicate(
      {
        accountId: ACCOUNT_A,
        tags: serviceAreaIds.map((saId) => ({ sectorId, serviceAreaId: saId })),
      },
      db,
    )

    expect(result.action).toBe("allow")
  })
})

describe("Rule 2: Identity Verification", () => {
  // AC-28: CH number not matching account holder → flagged
  it("flags when CH company name does not match account holder", async () => {
    chService.setResult("12345678", {
      found: true,
      status: "active",
      name: "Completely Different Ltd",
    })

    const result = await verifyIdentity(
      { companiesHouseNumber: "12345678", accountHolderName: "Alice Smith Productions" },
      chService,
    )

    expect(result.action).toBe("flag_for_review")
  })

  // AC-30: Dissolved CH number → rejected
  it("rejects dissolved CH number", async () => {
    chService.setResult("99999999", {
      found: true,
      status: "dissolved",
      name: "Dead Company Ltd",
    })

    const result = await verifyIdentity(
      { companiesHouseNumber: "99999999", accountHolderName: "Dead Company" },
      chService,
    )

    expect(result.action).toBe("reject")
    expect(result.action === "reject" && result.reasons[0]).toContain("dissolved")
  })

  it("allows when CH company matches account holder name", async () => {
    chService.setResult("12345678", {
      found: true,
      status: "active",
      name: "Smith Productions Ltd",
    })

    const result = await verifyIdentity(
      { companiesHouseNumber: "12345678", accountHolderName: "Smith Productions" },
      chService,
    )

    expect(result.action).toBe("allow")
  })

  it("allows when no CH number provided", async () => {
    const result = await verifyIdentity(
      { companiesHouseNumber: null, accountHolderName: "Anyone" },
      chService,
    )

    expect(result.action).toBe("allow")
  })

  it("flags when CH number not found", async () => {
    const result = await verifyIdentity(
      { companiesHouseNumber: "00000000", accountHolderName: "Nobody" },
      chService,
    )

    expect(result.action).toBe("flag_for_review")
  })
})

describe("Rule 3: CH Uniqueness", () => {
  // AC-29: CH number already used by different account → flagged
  it("flags CH number already used by different account", async () => {
    await createListing({
      accountId: ACCOUNT_B,
      name: "Bob's Company",
      slug: "bobs-company",
      ch: "12345678",
    })

    const result = await checkCHUniqueness(
      { companiesHouseNumber: "12345678", accountId: ACCOUNT_A },
      db,
    )

    expect(result.action).toBe("flag_co_director")
  })

  it("allows same CH number on same account", async () => {
    await createListing({
      accountId: ACCOUNT_A,
      name: "Alice Co 1",
      slug: "alice-co-1",
      ch: "12345678",
    })

    // ne(accountId) excludes same account, so this should allow
    const result = await checkCHUniqueness(
      { companiesHouseNumber: "12345678", accountId: ACCOUNT_A },
      db,
    )

    expect(result.action).toBe("allow")
  })

  it("allows when no CH number provided", async () => {
    const result = await checkCHUniqueness(
      { companiesHouseNumber: null, accountId: ACCOUNT_A },
      db,
    )

    expect(result.action).toBe("allow")
  })
})
