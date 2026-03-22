// Unit tests for sponsored placement — AC-32 (slot count), AC-33 (rotation determinism)

import { describe, it, expect } from "vitest"
import { computeSlotCount, dailyRotationOffset } from "../sponsored-placement"

describe("computeSlotCount (AC-32)", () => {
  it("returns 0 when fewer than 3 qualified candidates", () => {
    expect(computeSlotCount(0)).toBe(0)
    expect(computeSlotCount(1)).toBe(0)
    expect(computeSlotCount(2)).toBe(0)
  })

  it("returns 1 when 3-5 qualified candidates", () => {
    expect(computeSlotCount(3)).toBe(1)
    expect(computeSlotCount(4)).toBe(1)
    expect(computeSlotCount(5)).toBe(1)
  })

  it("returns 2 when 6-10 qualified candidates", () => {
    expect(computeSlotCount(6)).toBe(2)
    expect(computeSlotCount(8)).toBe(2)
    expect(computeSlotCount(10)).toBe(2)
  })

  it("returns 3 when more than 10 qualified candidates", () => {
    expect(computeSlotCount(11)).toBe(3)
    expect(computeSlotCount(50)).toBe(3)
    expect(computeSlotCount(100)).toBe(3)
  })
})

describe("dailyRotationOffset (AC-33)", () => {
  it("same listingId + same date produces same offset", () => {
    const id = "abc-123"
    const date = "2026-03-06"
    expect(dailyRotationOffset(id, date)).toBe(dailyRotationOffset(id, date))
  })

  it("different dates produce different offsets", () => {
    const id = "abc-123"
    expect(dailyRotationOffset(id, "2026-03-06")).not.toBe(
      dailyRotationOffset(id, "2026-03-07"),
    )
  })

  it("different listing IDs produce different offsets", () => {
    const date = "2026-03-06"
    expect(dailyRotationOffset("listing-a", date)).not.toBe(
      dailyRotationOffset("listing-b", date),
    )
  })

  it("returns a non-negative integer", () => {
    const offset = dailyRotationOffset("test-id", "2026-01-01")
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(offset)).toBe(true)
  })
})
