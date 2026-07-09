// Graduation evaluation unit tests — CS-WORK-089
// AC-58, AC-59, AC-60, AC-61

import { describe, it, expect } from "vitest"
import { createChainableMockDb } from "@/db/test-fixtures"
import {
  evaluateGraduationCriteria,
  evaluateCeremonyGraduation,
} from "../evaluate"
import type { CeremonyRecommendation } from "../evaluate"

// --- AC-58: Insufficient data ---

describe("AC-58: insufficient data returns graduated=false", () => {
  it("returns graduated=false with fewer than 12 decisions in 6-month window", async () => {
    const db = createChainableMockDb([
      // Query 1: manual override check → no results
      [],
      // Query 2: enrichment adjustments → only 5 results
      Array.from({ length: 5 }, (_, i) => ({
        id: `adj-${i}`,
        inputs: {},
        output: {},
        createdAt: new Date(),
      })),
    ])

    const result = await evaluateGraduationCriteria(
      db as never,
      "data-and-listings",
      "enrichment_cadence_adjustment",
    )

    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("Insufficient data")
    expect(result.currentMetrics.sampleSize).toBe(5)
    expect(result.thresholds.minSampleSize).toBe(12)
  })
})

// --- AC-59: Graduated when metrics within thresholds ---

describe("AC-59: graduated=true when FP=1.5% and ROI=0.7", () => {
  it("returns graduated=true when false positive rate and ROI meet thresholds", async () => {
    // 200 adjustments: 3 false positives → FP = 1.5%, ROI = 0.985
    const adjustments = Array.from({ length: 200 }, (_, i) => ({
      id: `adj-${i}`,
      inputs: {},
      output: i < 3 ? { qualityImproved: false } : { qualityImproved: true },
      createdAt: new Date(),
    }))

    const db = createChainableMockDb([
      [], // no manual override
      adjustments,
    ])

    const result = await evaluateGraduationCriteria(
      db as never,
      "data-and-listings",
      "enrichment_cadence_adjustment",
    )

    expect(result.graduated).toBe(true)
    expect(result.reason).toContain("All criteria met")
    expect(result.currentMetrics.falsePositiveRate).toBe(0.015)
    expect(result.currentMetrics.enrichmentROI).toBe(0.985)
    expect(result.currentMetrics.sampleSize).toBe(200)
  })
})

// --- AC-60: Financial recommendations never graduate ---

describe("AC-60: financial recommendations never graduate", () => {
  it("returns graduated=false for isFinancial=true regardless of precedent", async () => {
    const db = createChainableMockDb([])

    const rec: CeremonyRecommendation = {
      ceremonyType: "pricing_review",
      disposition: "adjust_tier",
      isFinancial: true,
      isUserVisible: false,
    }

    const result = await evaluateCeremonyGraduation(db as never, rec)

    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("Financial impact")
    expect(result.currentMetrics.isFinancial).toBe(1)
  })
})

// --- AC-61: Ceremony graduates with sufficient precedent ---

describe("AC-61: ceremony graduates when precedent >= 50, non-financial, non-user-visible", () => {
  it("returns graduated=true with 55 precedents", async () => {
    const db = createChainableMockDb([
      [{ count: 55 }], // precedent count query
    ])

    const rec: CeremonyRecommendation = {
      ceremonyType: "taxonomy_promotion",
      disposition: "promote",
      isFinancial: false,
      isUserVisible: false,
    }

    const result = await evaluateCeremonyGraduation(db as never, rec)

    expect(result.graduated).toBe(true)
    expect(result.reason).toContain("Precedent met")
    expect(result.currentMetrics.precedentCount).toBe(55)
    expect(result.thresholds.precedentCount).toBe(50)
  })

  it("returns graduated=false with only 30 precedents", async () => {
    const db = createChainableMockDb([
      [{ count: 30 }],
    ])

    const rec: CeremonyRecommendation = {
      ceremonyType: "data_health",
      disposition: "adjust_threshold",
      isFinancial: false,
      isUserVisible: false,
    }

    const result = await evaluateCeremonyGraduation(db as never, rec)

    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("Insufficient precedent")
    expect(result.currentMetrics.precedentCount).toBe(30)
  })

  it("returns graduated=false for user-visible recommendations", async () => {
    const db = createChainableMockDb([])

    const rec: CeremonyRecommendation = {
      ceremonyType: "notification_review",
      disposition: "update_text",
      isFinancial: false,
      isUserVisible: true,
    }

    const result = await evaluateCeremonyGraduation(db as never, rec)

    expect(result.graduated).toBe(false)
    expect(result.reason).toContain("User-visible impact")
  })
})
