// AC-40: computeTaxonomyOverlap unit tests

import { describe, it, expect } from "vitest"
import { computeTaxonomyOverlap } from "../overlap"

describe("computeTaxonomyOverlap", () => {
  // AC-40: returns 1.0 for identical tag sets
  it("returns 1.0 for identical tag sets", () => {
    const tags = [
      { sectorId: 1, serviceAreaId: 10 },
      { sectorId: 2, serviceAreaId: 20 },
    ]
    expect(computeTaxonomyOverlap(tags, tags)).toBe(1)
  })

  // AC-40: returns 0.0 for disjoint tag sets
  it("returns 0.0 for disjoint tag sets", () => {
    const a = [{ sectorId: 1, serviceAreaId: 10 }]
    const b = [{ sectorId: 2, serviceAreaId: 20 }]
    expect(computeTaxonomyOverlap(a, b)).toBe(0)
  })

  // AC-40: correct Jaccard for partial overlap
  it("returns correct Jaccard for partial overlap", () => {
    const a = [
      { sectorId: 1, serviceAreaId: 10 },
      { sectorId: 1, serviceAreaId: 11 },
    ]
    const b = [
      { sectorId: 1, serviceAreaId: 10 },
      { sectorId: 2, serviceAreaId: 20 },
    ]
    // intersection = 1 (1:10), union = 3 (1:10, 1:11, 2:20)
    expect(computeTaxonomyOverlap(a, b)).toBeCloseTo(1 / 3)
  })

  it("returns 0.0 for two empty tag sets", () => {
    expect(computeTaxonomyOverlap([], [])).toBe(0)
  })

  it("ignores specialisation — only considers sector:serviceArea", () => {
    const a = [{ sectorId: 1, serviceAreaId: 10, specialisationId: 100 }]
    const b = [{ sectorId: 1, serviceAreaId: 10, specialisationId: 200 }]
    expect(computeTaxonomyOverlap(a, b)).toBe(1)
  })

  it("deduplicates within the same set", () => {
    const a = [
      { sectorId: 1, serviceAreaId: 10 },
      { sectorId: 1, serviceAreaId: 10 },
    ]
    const b = [{ sectorId: 1, serviceAreaId: 10 }]
    expect(computeTaxonomyOverlap(a, b)).toBe(1)
  })
})
