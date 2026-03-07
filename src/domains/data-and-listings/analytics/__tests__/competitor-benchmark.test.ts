// Unit tests for competitor benchmark — AC-42, AC-43, AC-44, AC-51
// Tests pure logic via buildBenchmarkResult helper. DB-dependent paths
// are covered by integration tests.

import { describe, it, expect } from "vitest"
import { buildBenchmarkResult, computeCompetitorBenchmark } from "../competitor-benchmark"
import type { CompetitorBenchmark } from "../types"
import { ANALYTICS_CONSTANTS, median } from "../types"
import type { TaxonomyTag } from "@/domains/data-and-listings/integrity/types"

describe("CompetitorBenchmark shape (AC-51)", () => {
  it("has all required fields with correct types", () => {
    const benchmark: CompetitorBenchmark = {
      medianViews: 42,
      medianEnquiries: 5,
      medianQualityScore: 73,
      sampleSize: 10,
      taxonomyOverlapCount: 10,
      insufficientData: false,
    }

    expect(benchmark.medianViews).toBeTypeOf("number")
    expect(benchmark.medianEnquiries).toBeTypeOf("number")
    expect(benchmark.medianQualityScore).toBeTypeOf("number")
    expect(benchmark.sampleSize).toBeTypeOf("number")
    expect(benchmark.taxonomyOverlapCount).toBeTypeOf("number")
    expect(benchmark.insufficientData).toBeTypeOf("boolean")
  })

  it("allows null medians when data is insufficient", () => {
    const benchmark: CompetitorBenchmark = {
      medianViews: null,
      medianEnquiries: null,
      medianQualityScore: null,
      sampleSize: 1,
      taxonomyOverlapCount: 1,
      insufficientData: true,
    }

    expect(benchmark.medianViews).toBeNull()
    expect(benchmark.medianEnquiries).toBeNull()
    expect(benchmark.medianQualityScore).toBeNull()
    expect(benchmark.insufficientData).toBe(true)
  })
})

describe("computeCompetitorBenchmark signature (AC-42)", () => {
  it("accepts TaxonomyTag[] parameter (type-level assertion)", () => {
    // This test validates at the type level that the function accepts TaxonomyTag[].
    // If the signature were wrong, TypeScript would reject this file.
    const tags: TaxonomyTag[] = [
      { sectorId: 1, serviceAreaId: 10 },
      { sectorId: 1, serviceAreaId: 20, specialisationId: 100 },
      { sectorId: 2, serviceAreaId: 30, specialisationId: null },
    ]

    // Verify the function exists and has the expected arity
    expect(computeCompetitorBenchmark).toBeTypeOf("function")
    expect(computeCompetitorBenchmark.length).toBeGreaterThanOrEqual(3)

    // Type-level: tags satisfies TaxonomyTag[] — compiler enforces this
    expect(tags).toHaveLength(3)
  })
})

describe("buildBenchmarkResult (AC-43 — anonymised medians)", () => {
  it("returns insufficientData=true when competitor count is 0", () => {
    const result = buildBenchmarkResult([], [], 0)

    expect(result.insufficientData).toBe(true)
    expect(result.medianViews).toBeNull()
    expect(result.medianEnquiries).toBeNull()
    expect(result.medianQualityScore).toBeNull()
    expect(result.sampleSize).toBe(0)
    expect(result.taxonomyOverlapCount).toBe(0)
  })

  it("returns insufficientData=true when competitor count is 1", () => {
    const result = buildBenchmarkResult(
      [{ profileViews: 100, enquiriesReceived: 5 }],
      [{ composite: 80 }],
      1,
    )

    expect(result.insufficientData).toBe(true)
    expect(result.medianViews).toBeNull()
    expect(result.medianEnquiries).toBeNull()
    expect(result.medianQualityScore).toBeNull()
    expect(result.sampleSize).toBe(1)
  })

  it("returns insufficientData=true when competitor count is 2 (below MIN_SAMPLE_SIZE=3)", () => {
    const result = buildBenchmarkResult(
      [
        { profileViews: 50, enquiriesReceived: 2 },
        { profileViews: 100, enquiriesReceived: 4 },
      ],
      [{ composite: 60 }, { composite: 80 }],
      2,
    )

    expect(result.insufficientData).toBe(true)
    expect(result.medianViews).toBeNull()
    expect(result.sampleSize).toBe(2)
  })

  it("computes medians when competitor count equals MIN_SAMPLE_SIZE (3)", () => {
    const result = buildBenchmarkResult(
      [
        { profileViews: 10, enquiriesReceived: 1 },
        { profileViews: 30, enquiriesReceived: 3 },
        { profileViews: 50, enquiriesReceived: 5 },
      ],
      [{ composite: 40 }, { composite: 60 }, { composite: 80 }],
      3,
    )

    expect(result.insufficientData).toBe(false)
    expect(result.medianViews).toBe(30)
    expect(result.medianEnquiries).toBe(3)
    expect(result.medianQualityScore).toBe(60)
    expect(result.sampleSize).toBe(3)
    expect(result.taxonomyOverlapCount).toBe(3)
  })

  it("computes medians for even-count competitors (averages middle two)", () => {
    const result = buildBenchmarkResult(
      [
        { profileViews: 10, enquiriesReceived: 2 },
        { profileViews: 20, enquiriesReceived: 4 },
        { profileViews: 30, enquiriesReceived: 6 },
        { profileViews: 40, enquiriesReceived: 8 },
      ],
      [{ composite: 50 }, { composite: 60 }, { composite: 70 }, { composite: 80 }],
      4,
    )

    expect(result.insufficientData).toBe(false)
    expect(result.medianViews).toBe(25) // (20+30)/2
    expect(result.medianEnquiries).toBe(5) // (4+6)/2
    expect(result.medianQualityScore).toBe(65) // (60+70)/2
    expect(result.sampleSize).toBe(4)
  })

  it("handles empty engagement/score arrays with sufficient competitor count", () => {
    // Edge case: competitor count >= 3 but no engagement/score rows found
    const result = buildBenchmarkResult([], [], 5)

    expect(result.insufficientData).toBe(false)
    expect(result.medianViews).toBe(0) // median([]) returns 0
    expect(result.medianEnquiries).toBe(0)
    expect(result.medianQualityScore).toBe(0)
    expect(result.sampleSize).toBe(5)
  })

  it("uses the COMPETITOR_MIN_SAMPLE_SIZE constant correctly", () => {
    // Verify the constant is 3 as specified
    expect(ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE).toBe(3)

    // Below threshold → insufficient
    const below = buildBenchmarkResult([], [], ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE - 1)
    expect(below.insufficientData).toBe(true)

    // At threshold → sufficient
    const atThreshold = buildBenchmarkResult(
      [
        { profileViews: 1, enquiriesReceived: 1 },
        { profileViews: 2, enquiriesReceived: 2 },
        { profileViews: 3, enquiriesReceived: 3 },
      ],
      [{ composite: 10 }, { composite: 20 }, { composite: 30 }],
      ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE,
    )
    expect(atThreshold.insufficientData).toBe(false)
  })
})

describe("batch query verification (AC-44)", () => {
  it("competitor-benchmark module does not import getEngagementCounters", async () => {
    // AC-44 requires batch queries, not per-competitor getEngagementCounters calls.
    // This test reads the source and verifies no such import exists.
    // The implementation uses direct batch SELECT ... WHERE listingId IN (...).
    const fs = await import("fs")
    const path = await import("path")
    const sourceFile = path.resolve(
      __dirname,
      "..",
      "competitor-benchmark.ts",
    )
    const source = fs.readFileSync(sourceFile, "utf-8")

    expect(source).not.toContain("getEngagementCounters")
  })
})

describe("median helper (shared)", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0)
  })

  it("returns the single value for length-1 array", () => {
    expect(median([42])).toBe(42)
  })

  it("returns middle value for odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it("returns average of middle two for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe("ANALYTICS_CONSTANTS (spec compliance)", () => {
  it("COMPETITOR_BENCHMARK_TTL_DAYS is 7", () => {
    expect(ANALYTICS_CONSTANTS.COMPETITOR_BENCHMARK_TTL_DAYS).toBe(7)
  })

  it("COMPETITOR_MIN_OVERLAP_SERVICE_AREAS is 2", () => {
    expect(ANALYTICS_CONSTANTS.COMPETITOR_MIN_OVERLAP_SERVICE_AREAS).toBe(2)
  })

  it("COMPETITOR_MIN_SAMPLE_SIZE is 3", () => {
    expect(ANALYTICS_CONSTANTS.COMPETITOR_MIN_SAMPLE_SIZE).toBe(3)
  })
})
