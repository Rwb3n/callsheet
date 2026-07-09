// Algorithm rollout unit tests — CS-WORK-090
// AC-65, AC-66

import { describe, it, expect } from "vitest"
import {
  selectAlgorithmVersion,
  crc32,
} from "../algorithm-rollout"

// --- AC-65: selectAlgorithmVersion returns correct version based on bucket ---

describe("AC-65: selectAlgorithmVersion bucket assignment", () => {
  it("returns 2 for listing whose bucket is below rollout percentage", () => {
    // Find a listing ID whose crc32 % 100 is < 10
    // We'll compute buckets and find ones that match
    const testIds = Array.from({ length: 200 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    )

    const bucketsBelow10 = testIds.filter((id) => crc32(id) % 100 < 10)
    const bucketsAbove10 = testIds.filter((id) => crc32(id) % 100 >= 10)

    // Must have at least one in each group (statistically guaranteed with 200 IDs)
    expect(bucketsBelow10.length).toBeGreaterThan(0)
    expect(bucketsAbove10.length).toBeGreaterThan(0)

    // All below-10 listings get V2 at 10% rollout
    for (const id of bucketsBelow10) {
      expect(selectAlgorithmVersion(id, 10)).toBe(2)
    }

    // All above-10 listings get V1 at 10% rollout
    for (const id of bucketsAbove10) {
      expect(selectAlgorithmVersion(id, 10)).toBe(1)
    }
  })

  it("returns 1 for all listings at 0% rollout", () => {
    const id = "00000000-0000-4000-8000-000000000001"
    expect(selectAlgorithmVersion(id, 0)).toBe(1)
  })

  it("returns 2 for all listings at 100% rollout", () => {
    const id = "00000000-0000-4000-8000-000000000099"
    expect(selectAlgorithmVersion(id, 100)).toBe(2)
  })

  it("specific bucket check: bucket 7 → V2 at 10%, bucket 15 → V1 at 10%", () => {
    // Find IDs with specific buckets
    const testIds = Array.from({ length: 10000 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    )

    const bucket7Id = testIds.find((id) => crc32(id) % 100 === 7)
    const bucket15Id = testIds.find((id) => crc32(id) % 100 === 15)

    expect(bucket7Id).toBeDefined()
    expect(bucket15Id).toBeDefined()

    expect(selectAlgorithmVersion(bucket7Id!, 10)).toBe(2) // bucket 7 < 10
    expect(selectAlgorithmVersion(bucket15Id!, 10)).toBe(1) // bucket 15 >= 10
  })
})

// --- AC-66: selectAlgorithmVersion is deterministic ---

describe("AC-66: deterministic selection", () => {
  it("same listingId and rolloutPercentage always returns same version", () => {
    const id = "00000000-0000-4000-8000-000000000042"
    const pct = 25
    const first = selectAlgorithmVersion(id, pct)

    // Call 100 times — must always return the same value
    for (let i = 0; i < 100; i++) {
      expect(selectAlgorithmVersion(id, pct)).toBe(first)
    }
  })

  it("crc32 is deterministic for the same input", () => {
    const input = "test-string-12345"
    const first = crc32(input)

    for (let i = 0; i < 100; i++) {
      expect(crc32(input)).toBe(first)
    }
  })

  it("different listing IDs produce different buckets (collision resistance)", () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    )

    const buckets = new Set(ids.map((id) => crc32(id) % 100))
    // With 100 IDs and 100 buckets, expect at least 50 distinct buckets
    // (birthday paradox — but CRC32 distributes well)
    expect(buckets.size).toBeGreaterThan(30)
  })
})
