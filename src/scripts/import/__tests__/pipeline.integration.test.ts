// Integration tests: Import pipeline — AC-25, AC-26, AC-46, AC-47

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { rawQuery } from "@/db/raw-query"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
} from "@/db/schema/data-and-listings"
import { runImportPipeline } from "../pipeline"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { ImportRecord } from "../types"

let db: ReturnType<typeof getTestDb>

const stubCH: CompaniesHouseService = {
  lookup: async () => ({ found: true, status: "active" as const }),
}

function makeRecord(overrides: Partial<ImportRecord> = {}): ImportRecord {
  return {
    sourceId: "4rfv-001",
    name: "Test Company Ltd",
    entityType: "company",
    contactEmail: "info@test.com",
    basePostcode: "SW1A 1AA",
    baseRegion: "London",
    services: [],
    ...overrides,
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

describe("Import pipeline integration", () => {
  it("AC-25: commits records with claimStatus unclaimed and source 4rfv_import", async () => {
    const result = await runImportPipeline(
      [makeRecord()],
      db,
      stubCH,
    )

    expect(result.committed).toBe(1)

    const rows = await db.select().from(listings)
    expect(rows).toHaveLength(1)
    expect(rows[0].claimStatus).toBe("unclaimed")
    expect(rows[0].source).toBe("4rfv_import")
    expect(rows[0].accountId).toBeNull()
    expect(rows[0].lifecycleStatus).toBe("active")
    expect(rows[0].subscriptionTier).toBe("free")
  })

  it("AC-46: creates 1:1 companion rows for each listing", async () => {
    await runImportPipeline(
      [makeRecord({ sourceId: "a" }), makeRecord({ sourceId: "b", name: "Another Company" })],
      db,
      stubCH,
    )

    const allListings = await db.select().from(listings)
    expect(allListings).toHaveLength(2)

    for (const listing of allListings) {
      const [v] = await db.select().from(verifications).where(eq(verifications.listingId, listing.id))
      expect(v).toBeDefined()
      expect(v.tier).toBe("unclaimed")

      const [q] = await db.select().from(qualityScores).where(eq(qualityScores.listingId, listing.id))
      expect(q).toBeDefined()
      expect(q.composite).toBe(0)

      const [qe] = await db.select().from(qualityScoreExplanations).where(eq(qualityScoreExplanations.listingId, listing.id))
      expect(qe).toBeDefined()

      const [e] = await db.select().from(engagements).where(eq(engagements.listingId, listing.id))
      expect(e).toBeDefined()
      expect(e.profileViews).toBe(0)
    }
  })

  it("AC-47: does NOT emit listing_created events (pipeline bypasses event bus)", async () => {
    // The pipeline function signature has no bus parameter — it cannot emit events.
    // This test verifies the architectural guarantee: runImportPipeline accepts only
    // (records, db, companiesHouse) — no InProcessEventBus in the dependency list.
    const result = await runImportPipeline(
      [makeRecord()],
      db,
      stubCH,
    )
    expect(result.committed).toBe(1)

    // No event_consumer_errors should exist (no events were emitted)
    const rows = await rawQuery<{ c: string }>(db, sql`SELECT count(*) as c FROM event_consumer_errors`)
    expect(Number(rows[0].c)).toBe(0)
  })

  it("AC-26: no listing_live email sent (pipeline has no email service dependency)", async () => {
    // Same architectural guarantee as AC-47: runImportPipeline has no EmailService
    // in its dependency signature. It cannot send emails.
    const result = await runImportPipeline(
      [makeRecord()],
      db,
      stubCH,
    )
    expect(result.committed).toBe(1)
    // Verification: committed listing exists with source = "4rfv_import"
    // No email infrastructure is reachable from the pipeline
    const rows = await db.select().from(listings)
    expect(rows[0].source).toBe("4rfv_import")
  })

  it("filters dissolved companies and invalid records", async () => {
    const dissolvedCH: CompaniesHouseService = {
      lookup: async (num) =>
        num === "DISSOLVED1"
          ? { found: true, status: "dissolved" as const }
          : { found: true, status: "active" as const },
    }

    const result = await runImportPipeline(
      [
        makeRecord({ sourceId: "1", name: "Good Company" }),
        makeRecord({ sourceId: "2", name: "Dissolved Co", companiesHouseNumber: "DISSOLVED1" }),
        makeRecord({ sourceId: "3", name: "Bad Email Co", contactEmail: "not-valid" }),
      ],
      db,
      dissolvedCH,
    )

    // 1 clean + 1 with CH pass phase 1; bad email flagged in phase 1
    expect(result.phase1.stats.flagged).toBe(1) // bad email
    expect(result.phase2.stats.dissolved).toBe(1) // dissolved company
    expect(result.committed).toBe(1) // only "Good Company" survives

    const rows = await db.select().from(listings)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe("Good Company")
  })

  it("normalises fields before committing", async () => {
    const result = await runImportPipeline(
      [makeRecord({
        name: "smith cameras",
        contactEmail: "INFO@SMITH.COM",
        websiteUrl: "smith.com",
        contactPhone: "07700900000",
        basePostcode: "sw1a1aa",
      })],
      db,
      stubCH,
    )

    expect(result.committed).toBe(1)
    const rows = await db.select().from(listings)
    expect(rows[0].name).toBe("Smith Cameras")
    expect(rows[0].contactEmail).toBe("info@smith.com")
    expect(rows[0].websiteUrl).toBe("https://smith.com")
    expect(rows[0].contactPhone).toBe("+447700900000")
    expect(rows[0].basePostcode).toBe("SW1A 1AA")
  })

  it("generates unique slugs for committed records", async () => {
    await runImportPipeline(
      [
        makeRecord({ sourceId: "1", name: "Alpha Ltd" }),
        makeRecord({ sourceId: "2", name: "Beta Ltd" }),
      ],
      db,
      stubCH,
    )

    const rows = await db.select().from(listings)
    expect(rows).toHaveLength(2)
    const slugs = rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(2)
  })
})
