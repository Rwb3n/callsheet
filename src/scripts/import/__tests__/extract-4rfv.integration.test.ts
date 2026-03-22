// Integration test: 4rfv extraction → pipeline round-trip — CS-WORK-024 AC-08
// Extracts ImportRecord[] from SQLite, passes through runImportPipeline,
// and verifies listings committed to Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import path from "path"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { listings } from "@/db/schema/data-and-listings"
import { runImportPipeline } from "../pipeline"
import { extract4rfv } from "../extract-4rfv"
import type { CompaniesHouseService } from "@/lib/services/types"

let db: ReturnType<typeof getTestDb>

const stubCH: CompaniesHouseService = {
  lookup: async () => ({ found: true, status: "active" as const }),
}

const DB_PATH = path.resolve(process.cwd(), "4-work-management/4rfv_directory.db")

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestDb()
})

describe("4rfv extraction → pipeline round-trip", () => {
  it("AC-08: extracted records pass through pipeline without type errors and commit to DB", async () => {
    // Extract a small batch (first 20 records) for integration test speed
    const result = extract4rfv(DB_PATH)
    const batch = result.records.slice(0, 20)

    expect(batch.length).toBe(20)
    expect(batch[0].sourceId).toMatch(/^4rfv-/)
    expect(batch[0].name).toBeTruthy()
    expect(batch[0].entityType).toMatch(/^(company|freelancer)$/)
    expect(Array.isArray(batch[0].services)).toBe(true)

    // Run through pipeline
    const pipelineResult = await runImportPipeline(batch, db, stubCH)

    // Pipeline should process without errors
    expect(pipelineResult.phase1.stats.total).toBe(20)
    expect(pipelineResult.committed).toBeGreaterThan(0)

    // Verify listings in DB
    const rows = await db.select().from(listings)
    expect(rows.length).toBe(pipelineResult.committed)

    // Verify committed listings have expected fields
    for (const row of rows) {
      expect(row.source).toBe("4rfv_import")
      expect(row.claimStatus).toBe("unclaimed")
      expect(row.lifecycleStatus).toBe("active")
      expect(row.name).toBeTruthy()
      expect(row.entityType).toMatch(/^(company|freelancer)$/)
    }
  })

  it("extraction produces consistent entity type distribution", () => {
    const result = extract4rfv(DB_PATH)

    // 4657 total, ~57 skipped (broadcasters, 4rfv placeholders, defunct)
    expect(result.stats.total).toBe(4657)
    expect(result.stats.skipped).toBeGreaterThan(40)
    expect(result.stats.skipped).toBeLessThan(100)
    expect(result.stats.extracted).toBe(result.stats.total - result.stats.skipped)
    // ~1103 companies, ~3497 freelancers after skip
    expect(result.stats.entityTypes.company).toBeGreaterThan(1000)
    expect(result.stats.entityTypes.company).toBeLessThan(1200)
    expect(result.stats.entityTypes.freelancer).toBeGreaterThan(3300)
  })

  it("extraction is deterministic (AC-07)", () => {
    const r1 = extract4rfv(DB_PATH)
    const r2 = extract4rfv(DB_PATH)

    expect(r1.records.length).toBe(r2.records.length)
    expect(JSON.stringify(r1.records)).toBe(JSON.stringify(r2.records))
  })

  it("all extracted records have at least one service (AC-04 coverage)", () => {
    const result = extract4rfv(DB_PATH)

    const withServices = result.records.filter((r) => r.services.length > 0)
    const coverage = withServices.length / result.records.length

    // AC-04: Coverage ≥ 90%
    expect(coverage).toBeGreaterThanOrEqual(0.9)
  })

  it("extraction handles known data quality issues (AC-05)", () => {
    const result = extract4rfv(DB_PATH)

    // Check that emails are cleaned
    for (const r of result.records) {
      if (r.contactEmail) {
        expect(r.contactEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        expect(r.contactEmail).toBe(r.contactEmail.toLowerCase())
      }
    }

    // Check that postcodes are cleaned (no leading/trailing whitespace)
    for (const r of result.records) {
      if (r.basePostcode) {
        expect(r.basePostcode).toBe(r.basePostcode.trim())
        expect(r.basePostcode).toBe(r.basePostcode.toUpperCase())
      }
    }
  })
})
