// Unit tests: Phase 2 CH batch verification — AC-23

import { describe, it, expect, vi } from "vitest"
import { phase2CHVerification } from "../phase-2-ch-verify"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { CleanedRecord } from "../types"

function makeRecord(overrides: Partial<CleanedRecord> = {}): CleanedRecord {
  return {
    sourceId: "test-1",
    name: "Test Company",
    entityType: "company",
    services: [],
    flags: [],
    ...overrides,
  }
}

function makeCH(overrides: Partial<ReturnType<CompaniesHouseService["lookup"]> extends Promise<infer T> ? T : never> = {}): CompaniesHouseService {
  return {
    lookup: vi.fn().mockResolvedValue({ found: true, status: "active", ...overrides }),
  }
}

describe("phase2CHVerification", () => {
  it("passes through records without CH number (skipped)", async () => {
    const ch = makeCH()
    const result = await phase2CHVerification(
      [makeRecord({ companiesHouseNumber: undefined })],
      ch,
      0, // no rate limit in tests
    )
    expect(result.verified).toHaveLength(1)
    expect(result.dissolved).toHaveLength(0)
    expect(result.stats.skipped).toBe(1)
    expect(ch.lookup).not.toHaveBeenCalled()
  })

  it("flags dissolved companies", async () => {
    const ch: CompaniesHouseService = {
      lookup: vi.fn().mockResolvedValue({ found: true, status: "dissolved" }),
    }
    const result = await phase2CHVerification(
      [makeRecord({ companiesHouseNumber: "12345678" })],
      ch,
      0,
    )
    expect(result.verified).toHaveLength(0)
    expect(result.dissolved).toHaveLength(1)
    expect(result.dissolved[0].flagReason).toBe("dissolved_company")
  })

  it("keeps active companies", async () => {
    const ch = makeCH({ status: "active" })
    const result = await phase2CHVerification(
      [makeRecord({ companiesHouseNumber: "12345678" })],
      ch,
      0,
    )
    expect(result.verified).toHaveLength(1)
    expect(result.dissolved).toHaveLength(0)
  })

  it("keeps records when CH lookup returns not found", async () => {
    const ch: CompaniesHouseService = {
      lookup: vi.fn().mockResolvedValue({ found: false }),
    }
    const result = await phase2CHVerification(
      [makeRecord({ companiesHouseNumber: "99999999" })],
      ch,
      0,
    )
    expect(result.verified).toHaveLength(1)
    expect(result.dissolved).toHaveLength(0)
  })

  it("reports correct stats", async () => {
    const ch: CompaniesHouseService = {
      lookup: vi.fn()
        .mockResolvedValueOnce({ found: true, status: "active" })
        .mockResolvedValueOnce({ found: true, status: "dissolved" }),
    }
    const result = await phase2CHVerification(
      [
        makeRecord({ sourceId: "1", companiesHouseNumber: "11111111" }),
        makeRecord({ sourceId: "2", companiesHouseNumber: "22222222" }),
        makeRecord({ sourceId: "3" }), // no CH number
      ],
      ch,
      0,
    )
    expect(result.stats).toEqual({ total: 3, verified: 2, dissolved: 1, skipped: 1 })
  })
})
