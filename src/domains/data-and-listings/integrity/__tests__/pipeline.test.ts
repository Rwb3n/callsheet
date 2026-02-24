// AC-31: Integrity pipeline short-circuits on first non-allow result (unit test)

import { describe, it, expect, vi } from "vitest"

// We test the pipeline's short-circuit behaviour by mocking individual rule modules.
// This is a unit test — no DB required.

// Mock modules before import
vi.mock("../duplicate-detection", () => ({
  checkDuplicate: vi.fn(),
}))
vi.mock("../identity-verification", () => ({
  verifyIdentity: vi.fn(),
}))
vi.mock("../ch-uniqueness", () => ({
  checkCHUniqueness: vi.fn(),
}))

import { runIntegrityChecks } from "../index"
import { checkDuplicate } from "../duplicate-detection"
import { checkCHUniqueness } from "../ch-uniqueness"
import { verifyIdentity } from "../identity-verification"
import type { IntegrityResult } from "../types"

const mockDuplicate = vi.mocked(checkDuplicate)
const mockIdentity = vi.mocked(verifyIdentity)
const mockCH = vi.mocked(checkCHUniqueness)

const db = {} as Parameters<typeof runIntegrityChecks>[1]
const ch = {} as Parameters<typeof runIntegrityChecks>[2]

const input = {
  accountId: "acc-1",
  accountHolderName: "Test User",
  companiesHouseNumber: "12345678",
  tags: [{ sectorId: 1, serviceAreaId: 10 }],
}

describe("runIntegrityChecks short-circuit", () => {
  // AC-31: pipeline short-circuits on first non-allow result
  it("stops after duplicate detection if flagged", async () => {
    const flagResult: IntegrityResult = {
      action: "flag_duplicate",
      reasons: ["overlap"],
      existingListingId: "lst-99",
    }
    mockDuplicate.mockResolvedValue(flagResult)

    const result = await runIntegrityChecks(input, db, ch)

    expect(result).toEqual(flagResult)
    expect(mockIdentity).not.toHaveBeenCalled()
    expect(mockCH).not.toHaveBeenCalled()
  })

  it("stops after identity verification if rejected", async () => {
    mockDuplicate.mockResolvedValue({ action: "allow" })
    const rejectResult: IntegrityResult = {
      action: "reject",
      reasons: ["dissolved"],
    }
    mockIdentity.mockResolvedValue(rejectResult)

    const result = await runIntegrityChecks(input, db, ch)

    expect(result).toEqual(rejectResult)
    expect(mockCH).not.toHaveBeenCalled()
  })

  it("runs all three checks when all allow", async () => {
    mockDuplicate.mockResolvedValue({ action: "allow" })
    mockIdentity.mockResolvedValue({ action: "allow" })
    mockCH.mockResolvedValue({ action: "allow" })

    const result = await runIntegrityChecks(input, db, ch)

    expect(result.action).toBe("allow")
    expect(mockDuplicate).toHaveBeenCalled()
    expect(mockIdentity).toHaveBeenCalled()
    expect(mockCH).toHaveBeenCalled()
  })
})
