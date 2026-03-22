// Unit tests — CS-WORK-056 AC-45, AC-46, AC-47
import { describe, it, expect } from "vitest"
import {
  evaluateCrossRoleNudge,
  type SearchHistoryEntry,
} from "../cross-role-nudge"

function recentDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
}

function makeEntries(
  count: number,
  serviceArea?: string,
  daysAgo = 5,
): SearchHistoryEntry[] {
  return Array.from({ length: count }, () => ({
    createdAt: recentDate(daysAgo),
    filters: serviceArea ? { serviceAreas: [serviceArea] } : null,
  }))
}

describe("evaluateCrossRoleNudge", () => {
  // --- AC-45: category_concentration ---

  it("returns category_concentration when 5+ searches in same service area within 30 days and 0 listings", () => {
    const history = makeEntries(5, "cinematography", 10)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    expect(result).not.toBeNull()
    expect(result!.type).toBe("category_concentration")
    expect(result!.message).toContain("cinematography")
    expect(result!.message).toContain("5")
    expect(result!.action.target).toBe("/dashboard/listings/create")
  })

  it("returns category_concentration with highest-frequency service area", () => {
    const history = [
      ...makeEntries(6, "sound-recording", 5),
      ...makeEntries(3, "cinematography", 5),
    ]
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    expect(result!.type).toBe("category_concentration")
    expect(result!.message).toContain("sound-recording")
    expect(result!.message).toContain("6")
  })

  it("ignores searches older than 30 days for category concentration", () => {
    const history = makeEntries(5, "cinematography", 35)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    // 5 searches but all >30 days old — no concentration trigger
    // But still 5 total + old account — not enough for engagement (needs 20)
    expect(result).toBeNull()
  })

  it("ignores searches with no service area filter", () => {
    const history = makeEntries(10, undefined, 5)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    expect(result).toBeNull()
  })

  it("does not fire at 4 searches (below threshold)", () => {
    const history = makeEntries(4, "cinematography", 5)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    expect(result).toBeNull()
  })

  // --- AC-46: engagement_threshold ---

  it("returns engagement_threshold when 20+ searches, 0 listings, account >14 days", () => {
    const history = makeEntries(20, undefined, 5)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(30))

    expect(result).not.toBeNull()
    expect(result!.type).toBe("engagement_threshold")
    expect(result!.action.target).toBe("/dashboard/listings/create")
  })

  it("does not fire engagement_threshold for new account (<14 days)", () => {
    const history = makeEntries(25, undefined, 5)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(10))

    expect(result).toBeNull()
  })

  it("does not fire at 19 searches (below threshold)", () => {
    const history = makeEntries(19, undefined, 5)
    const result = evaluateCrossRoleNudge(history, 0, recentDate(30))

    expect(result).toBeNull()
  })

  // --- AC-46 (priority): category_concentration takes priority ---

  it("returns category_concentration over engagement_threshold when both qualify", () => {
    // 20+ total, 5+ in same area, old account
    const history = [
      ...makeEntries(6, "cinematography", 5),
      ...makeEntries(15, undefined, 5),
    ]
    const result = evaluateCrossRoleNudge(history, 0, recentDate(30))

    expect(result!.type).toBe("category_concentration")
  })

  // --- AC-47: returns null when account has any listing ---

  it("returns null when account has 1 listing", () => {
    const history = makeEntries(10, "cinematography", 5)
    const result = evaluateCrossRoleNudge(history, 1, recentDate(60))

    expect(result).toBeNull()
  })

  it("returns null when account has archived listings (count includes archived)", () => {
    // accountListingCount includes archived — caller counts all listings
    const history = makeEntries(25, "cinematography", 5)
    const result = evaluateCrossRoleNudge(history, 2, recentDate(60))

    expect(result).toBeNull()
  })

  // --- Edge cases ---

  it("returns null for empty search history", () => {
    const result = evaluateCrossRoleNudge([], 0, recentDate(60))
    expect(result).toBeNull()
  })

  it("uses first service area in filters array as primary intent signal", () => {
    const history: SearchHistoryEntry[] = Array.from({ length: 5 }, () => ({
      createdAt: recentDate(5),
      filters: { serviceAreas: ["cinematography", "sound-recording"] },
    }))
    const result = evaluateCrossRoleNudge(history, 0, recentDate(60))

    expect(result!.type).toBe("category_concentration")
    expect(result!.message).toContain("cinematography")
  })
})
