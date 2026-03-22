// Unit tests for viewer demographics — AC-40
import { describe, it, expect } from "vitest"
import type {
  ViewerDemographicsData,
  DemographicBucket,
  SectorBucket,
  RegionBucket,
} from "../types"
import { roundTo } from "../types"

describe("ViewerDemographicsData shape", () => {
  it("has the correct structure with all required fields", () => {
    const data: ViewerDemographicsData = {
      entityTypes: [],
      sectors: [],
      regions: [],
      totalUniqueViewers: 0,
    }

    expect(data).toHaveProperty("entityTypes")
    expect(data).toHaveProperty("sectors")
    expect(data).toHaveProperty("regions")
    expect(data).toHaveProperty("totalUniqueViewers")
    expect(Array.isArray(data.entityTypes)).toBe(true)
    expect(Array.isArray(data.sectors)).toBe(true)
    expect(Array.isArray(data.regions)).toBe(true)
    expect(data.totalUniqueViewers).toBe(0)
  })

  it("accepts populated buckets with correct types", () => {
    const data: ViewerDemographicsData = {
      entityTypes: [
        { type: "company", count: 5, pct: 0.5 },
        { type: "freelancer", count: 5, pct: 0.5 },
      ],
      sectors: [
        { sector: "Camera", count: 3, pct: 1.0 },
      ],
      regions: [
        { region: "London", count: 7, pct: 0.7 },
        { region: "Manchester", count: 3, pct: 0.3 },
      ],
      totalUniqueViewers: 10,
    }

    expect(data.entityTypes).toHaveLength(2)
    expect(data.sectors).toHaveLength(1)
    expect(data.regions).toHaveLength(2)
    expect(data.totalUniqueViewers).toBe(10)
  })
})

describe("DemographicBucket pct recomputation", () => {
  function recomputePercentages<T extends { count: number; pct: number }>(
    buckets: T[],
  ): T[] {
    const total = buckets.reduce((sum, b) => sum + b.count, 0)
    if (total === 0) return buckets
    for (const bucket of buckets) {
      bucket.pct = roundTo(bucket.count / total, 2)
    }
    return buckets
  }

  it("recomputes pct from raw counts [3, 2, 5] to [0.3, 0.2, 0.5]", () => {
    const buckets: DemographicBucket<string>[] = [
      { type: "company", count: 3, pct: 0 },
      { type: "freelancer", count: 2, pct: 0 },
      { type: "education", count: 5, pct: 0 },
    ]

    recomputePercentages(buckets)

    expect(buckets[0].pct).toBe(0.3)
    expect(buckets[1].pct).toBe(0.2)
    expect(buckets[2].pct).toBe(0.5)
  })

  it("pct values sum to 1.0 per entity type bucket category", () => {
    const buckets: DemographicBucket<string>[] = [
      { type: "company", count: 3, pct: 0 },
      { type: "freelancer", count: 2, pct: 0 },
      { type: "education", count: 5, pct: 0 },
    ]

    recomputePercentages(buckets)

    const sum = buckets.reduce((s, b) => s + b.pct, 0)
    expect(sum).toBeCloseTo(1.0, 1)
  })

  it("pct values sum to 1.0 per sector bucket category", () => {
    const sectors: SectorBucket[] = [
      { sector: "Camera", count: 4, pct: 0 },
      { sector: "Lighting", count: 3, pct: 0 },
      { sector: "Sound", count: 3, pct: 0 },
    ]

    recomputePercentages(sectors)

    const sum = sectors.reduce((s, b) => s + b.pct, 0)
    expect(sum).toBeCloseTo(1.0, 1)
  })

  it("pct values sum to 1.0 per region bucket category", () => {
    const regions: RegionBucket[] = [
      { region: "London", count: 7, pct: 0 },
      { region: "Manchester", count: 2, pct: 0 },
      { region: "Bristol", count: 1, pct: 0 },
    ]

    recomputePercentages(regions)

    const sum = regions.reduce((s, b) => s + b.pct, 0)
    expect(sum).toBeCloseTo(1.0, 1)
  })

  it("handles single bucket — pct is 1.0", () => {
    const buckets: DemographicBucket<string>[] = [
      { type: "company", count: 5, pct: 0 },
    ]

    recomputePercentages(buckets)

    expect(buckets[0].pct).toBe(1.0)
  })

  it("handles uneven division with rounding", () => {
    const buckets: DemographicBucket<string>[] = [
      { type: "company", count: 1, pct: 0 },
      { type: "freelancer", count: 1, pct: 0 },
      { type: "education", count: 1, pct: 0 },
    ]

    recomputePercentages(buckets)

    // Each should be 0.33 (roundTo 2 decimal places)
    expect(buckets[0].pct).toBe(0.33)
    expect(buckets[1].pct).toBe(0.33)
    expect(buckets[2].pct).toBe(0.33)
    // Sum ~0.99 due to rounding — floating point acceptable
    const sum = buckets.reduce((s, b) => s + b.pct, 0)
    expect(sum).toBeGreaterThanOrEqual(0.99)
    expect(sum).toBeLessThanOrEqual(1.01)
  })

  it("handles empty bucket array", () => {
    const buckets: DemographicBucket<string>[] = []
    recomputePercentages(buckets)
    expect(buckets).toHaveLength(0)
  })
})
