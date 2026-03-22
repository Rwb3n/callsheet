// Integration tests for sponsored placement — AC-29, AC-30, AC-31, AC-34, AC-35, AC-36, AC-37, AC-38

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeSession,
  ctx,
  seedTestUser,
  createTestListing,
  setQuality,
  seedTaxonomy,
  createDecisionLogDb,
  expectTRPCError,
  createTestBus,
} from "@/db/test-fixtures"
import { createCommercialRouter, type CommercialRouterDeps } from "@/server/routers/commercial"
import { InMemoryEmailService } from "@/lib/email/transport"
import { listingTaxonomyTags } from "@/db/schema/data-and-listings"
import { sponsoredImpressions } from "@/db/schema/commercial"
import { decisionLogs } from "@/db/schema/shared"

const db = getTestDb()

const OWNER_A = makeUUID("sp1")
const OWNER_B = makeUUID("sp2")
const OWNER_C = makeUUID("sp3")
const OWNER_D = makeUUID("sp4")

const session = makeSession({ accountId: OWNER_A })

function makeDeps(): CommercialRouterDeps {
  return {
    db,
    decisionLogDb: createDecisionLogDb(db),
    emailService: new InMemoryEmailService(),
    bus: createTestBus(),
    waitUntilFn: (p) => { p.catch(() => {}) },
  }
}

function makeCaller(s = session) {
  const router = createCommercialRouter(makeDeps())
  return router.createCaller(ctx(s))
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, OWNER_A)
  await seedTestUser(db, OWNER_B, "b@test.com")
  await seedTestUser(db, OWNER_C, "c@test.com")
  await seedTestUser(db, OWNER_D, "d@test.com")
})

afterAll(async () => {
  await closeTestDb()
})

describe("commercial.getSponsoredListings", () => {
  it("AC-29: returns SponsoredListingResult[] with 0-3 entries, each with listingId, position, isSponsored", async () => {
    const tax = await seedTaxonomy(db)
    const ids = await seedScenarioWithTax(db, 5, "premium", 75, tax.cinematography.id, tax.camera.id)
    const caller = makeCaller()

    const result = await caller.getSponsoredListings({
      serviceAreaIds: [tax.cinematography.id],
    })

    expect(result.length).toBeGreaterThanOrEqual(0)
    expect(result.length).toBeLessThanOrEqual(3)
    for (const entry of result) {
      expect(entry).toMatchObject({
        listingId: expect.any(String),
        position: expect.any(Number),
        isSponsored: true,
      })
      expect(entry.position).toBeGreaterThanOrEqual(0)
    }
  })

  it("AC-30: only Premium/Partner + active + claimed + taxonomy overlap appear as candidates", async () => {
    const tax = await seedTaxonomy(db)

    // Create qualifying listing (premium, active, owned, taxonomy match)
    const goodId = makeUUID("good")
    await createTestListing(db, OWNER_A, {
      id: goodId,
      subscriptionTier: "premium",
      lifecycleStatus: "active",
    })
    await setQuality(db, goodId, 80)
    await db.insert(listingTaxonomyTags).values({
      listingId: goodId,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    // Free tier — should not appear
    const freeId = makeUUID("free")
    await createTestListing(db, OWNER_B, {
      id: freeId,
      subscriptionTier: "free",
      lifecycleStatus: "active",
    })
    await setQuality(db, freeId, 80)
    await db.insert(listingTaxonomyTags).values({
      listingId: freeId,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    // Archived — should not appear
    const archivedId = makeUUID("arch")
    await createTestListing(db, OWNER_C, {
      id: archivedId,
      subscriptionTier: "premium",
      lifecycleStatus: "archived",
    })
    await setQuality(db, archivedId, 80)
    await db.insert(listingTaxonomyTags).values({
      listingId: archivedId,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    // Unclaimed (accountId null) — should not appear
    const unclaimedId = makeUUID("uncl")
    await createTestListing(db, null, {
      id: unclaimedId,
      subscriptionTier: "premium",
      lifecycleStatus: "active",
    })
    await setQuality(db, unclaimedId, 80)
    await db.insert(listingTaxonomyTags).values({
      listingId: unclaimedId,
      sectorId: tax.camera.id,
      serviceAreaId: tax.cinematography.id,
    })

    // Wrong taxonomy — should not appear
    const wrongTaxId = makeUUID("wtax")
    await createTestListing(db, OWNER_D, {
      id: wrongTaxId,
      subscriptionTier: "premium",
      lifecycleStatus: "active",
    })
    await setQuality(db, wrongTaxId, 80)
    await db.insert(listingTaxonomyTags).values({
      listingId: wrongTaxId,
      sectorId: tax.sound.id,
      serviceAreaId: tax.soundRecording.id,
    })

    // Need 3+ qualifying to get any slots — add 2 more good ones
    for (const suffix of ["gd2", "gd3"]) {
      const id = makeUUID(suffix)
      await createTestListing(db, OWNER_A, {
        id,
        subscriptionTier: "partner",
        lifecycleStatus: "active",
      })
      await setQuality(db, id, 80)
      await db.insert(listingTaxonomyTags).values({
        listingId: id,
        sectorId: tax.camera.id,
        serviceAreaId: tax.cinematography.id,
      })
    }

    const caller = makeCaller()
    const result = await caller.getSponsoredListings({
      serviceAreaIds: [tax.cinematography.id],
    })

    const selectedIds = result.map((r) => r.listingId)
    expect(selectedIds).not.toContain(freeId)
    expect(selectedIds).not.toContain(archivedId)
    expect(selectedIds).not.toContain(unclaimedId)
    expect(selectedIds).not.toContain(wrongTaxId)
    // All selected must be from the qualifying pool
    const qualifyingIds = [goodId, makeUUID("gd2"), makeUUID("gd3")]
    for (const id of selectedIds) {
      expect(qualifyingIds).toContain(id)
    }
  })

  it("AC-31: candidates with qualityScores.composite < 50 are excluded", async () => {
    const tax = await seedTaxonomy(db)

    // 4 listings: 3 with quality >= 50, 1 with quality 30
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const id = makeUUID(`q${i}0`)
      await createTestListing(db, OWNER_A, {
        id,
        subscriptionTier: "premium",
        lifecycleStatus: "active",
      })
      await setQuality(db, id, i === 3 ? 30 : 75)
      await db.insert(listingTaxonomyTags).values({
        listingId: id,
        sectorId: tax.camera.id,
        serviceAreaId: tax.cinematography.id,
      })
      ids.push(id)
    }

    const caller = makeCaller()
    const result = await caller.getSponsoredListings({
      serviceAreaIds: [tax.cinematography.id],
    })

    const selectedIds = result.map((r) => r.listingId)
    expect(selectedIds).not.toContain(ids[3]) // quality 30
  })

  it("AC-34: listings exceeding 3x mean impressions in 30-day window are excluded", async () => {
    const tax = await seedTaxonomy(db)

    // Create 4 qualifying listings
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const id = makeUUID(`f${i}0`)
      await createTestListing(db, [OWNER_A, OWNER_B, OWNER_C, OWNER_D][i], {
        id,
        subscriptionTier: "premium",
        lifecycleStatus: "active",
      })
      await setQuality(db, id, 80)
      await db.insert(listingTaxonomyTags).values({
        listingId: id,
        sectorId: tax.camera.id,
        serviceAreaId: tax.cinematography.id,
      })
      ids.push(id)
    }

    // Give ids[0] 100 impressions (far above mean), others 1 each
    const now = new Date()
    for (let i = 0; i < 100; i++) {
      await db.insert(sponsoredImpressions).values({
        listingId: ids[0],
        serviceAreaId: tax.cinematography.id,
        impressionDate: now,
      })
    }
    for (let i = 1; i < 4; i++) {
      await db.insert(sponsoredImpressions).values({
        listingId: ids[i],
        serviceAreaId: tax.cinematography.id,
        impressionDate: now,
      })
    }
    // Mean = (100+1+1+1)/4 = 25.75, 3x mean = 77.25 — ids[0] at 100 exceeds

    const caller = makeCaller()
    const result = await caller.getSponsoredListings({
      serviceAreaIds: [tax.cinematography.id],
    })

    const selectedIds = result.map((r) => r.listingId)
    expect(selectedIds).not.toContain(ids[0])
  })

  it("AC-35: each sponsored listing produces one sponsored_impressions row per service area", async () => {
    const tax = await seedTaxonomy(db)

    // Create 3 qualifying listings with both service areas
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = makeUUID(`i${i}0`)
      await createTestListing(db, [OWNER_A, OWNER_B, OWNER_C][i], {
        id,
        subscriptionTier: "premium",
        lifecycleStatus: "active",
      })
      await setQuality(db, id, 80)
      // Tag with both cinematography and camera-op
      await db.insert(listingTaxonomyTags).values([
        { listingId: id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id },
        { listingId: id, sectorId: tax.camera.id, serviceAreaId: tax.cameraOp.id },
      ])
      ids.push(id)
    }

    const caller = makeCaller()
    const result = await caller.getSponsoredListings({
      serviceAreaIds: [tax.cinematography.id, tax.cameraOp.id],
    })

    expect(result.length).toBeGreaterThan(0)

    // Check impression rows for selected listings
    for (const entry of result) {
      const rows = await db
        .select()
        .from(sponsoredImpressions)
        .where(eq(sponsoredImpressions.listingId, entry.listingId))

      // Should have one row per service area queried
      expect(rows.length).toBe(2)
      const saIds = rows.map((r) => r.serviceAreaId).sort()
      expect(saIds).toEqual([tax.cinematography.id, tax.cameraOp.id].sort())
    }
  })

  it("AC-36: sponsored_impressions rows older than 90 days are deleted during cleanup", async () => {
    const tax = await seedTaxonomy(db)

    const id = makeUUID("old1")
    await createTestListing(db, OWNER_A, {
      id,
      subscriptionTier: "premium",
      lifecycleStatus: "active",
    })

    // Insert old impression (100 days ago)
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 100)
    await db.insert(sponsoredImpressions).values({
      listingId: id,
      serviceAreaId: tax.cinematography.id,
      impressionDate: oldDate,
    })

    // Insert recent impression
    await db.insert(sponsoredImpressions).values({
      listingId: id,
      serviceAreaId: tax.cinematography.id,
      impressionDate: new Date(),
    })

    // Direct call to cleanup
    const { cleanupOldImpressions } = await import("@/domains/commercial/sponsored-placement")
    await cleanupOldImpressions(db)

    const remaining = await db.select().from(sponsoredImpressions)
    expect(remaining.length).toBe(1)
    // Only the recent one should remain
    expect(remaining[0].listingId).toBe(id)
  })

  it("AC-37: unauthenticated call returns UNAUTHORIZED", async () => {
    const router = createCommercialRouter(makeDeps())
    const caller = router.createCaller(ctx(null as never))

    await expectTRPCError(
      caller.getSponsoredListings({ serviceAreaIds: [1] }),
      "UNAUTHORIZED",
    )
  })

  it("AC-38: every invocation logs a sponsored_placement_selection decision", async () => {
    const tax = await seedTaxonomy(db)

    // Create 3 qualifying listings
    for (let i = 0; i < 3; i++) {
      const id = makeUUID(`d${i}0`)
      await createTestListing(db, [OWNER_A, OWNER_B, OWNER_C][i], {
        id,
        subscriptionTier: "premium",
        lifecycleStatus: "active",
      })
      await setQuality(db, id, 80)
      await db.insert(listingTaxonomyTags).values({
        listingId: id,
        sectorId: tax.camera.id,
        serviceAreaId: tax.cinematography.id,
      })
    }

    const caller = makeCaller()
    await caller.getSponsoredListings({ serviceAreaIds: [tax.cinematography.id] })

    const logs = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "sponsored_placement_selection"))

    expect(logs.length).toBe(1)
    const output = logs[0].output as Record<string, unknown>
    expect(output).toMatchObject({
      candidateCount: expect.any(Number),
      qualifiedCount: expect.any(Number),
      fairnessCappedCount: expect.any(Number),
      selectedListingIds: expect.any(Array),
      slotCount: expect.any(Number),
    })
  })
})

// --- Helper: seed N listings with taxonomy tags ---

async function seedScenarioWithTax(
  db: Db,
  count: number,
  tier: "premium" | "partner",
  quality: number,
  serviceAreaId: number,
  sectorId: number,
): Promise<string[]> {
  const owners = [OWNER_A, OWNER_B, OWNER_C, OWNER_D]
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = makeUUID(`s${String(i).padStart(2, "0")}`)
    await createTestListing(db, owners[i % owners.length], {
      id,
      subscriptionTier: tier,
      lifecycleStatus: "active",
    })
    await setQuality(db, id, quality)
    await db.insert(listingTaxonomyTags).values({
      listingId: id,
      sectorId,
      serviceAreaId,
    })
    ids.push(id)
  }
  return ids
}

type Db = typeof db
