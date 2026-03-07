// Unit tests for learning hypothesis analysis + proactive churn — AC-71, AC-75
import { describe, it, expect } from "vitest"
import {
  computeTrend,
  computeConfoundWarning,
  computeHypothesisMeasurement,
  HYPOTHESIS_MEASUREMENT_CONFIG,
} from "../hypothesis-analysis"
import { computeOverallRisk, computeRecommendedAction } from "../proactive-churn"

// --- computeTrend ---

describe("computeTrend", () => {
  it("returns insufficient_data when currentValue is null", () => {
    expect(computeTrend(null, 10, "up")).toBe("insufficient_data")
  })

  it("returns insufficient_data when previousValue is null", () => {
    expect(computeTrend(10, null, "up")).toBe("insufficient_data")
  })

  it("returns insufficient_data when both values are null", () => {
    expect(computeTrend(null, null, "up")).toBe("insufficient_data")
  })

  it("returns stable when relative change < 5%", () => {
    // 100 -> 104 = 4% change
    expect(computeTrend(104, 100, "up")).toBe("stable")
  })

  it("returns stable when relative change is exactly at threshold boundary (negative)", () => {
    // 100 -> 96 = -4% change, abs < 5%
    expect(computeTrend(96, 100, "up")).toBe("stable")
  })

  it("returns improving when value goes up and improvingDirection is up", () => {
    // 100 -> 120 = 20% increase
    expect(computeTrend(120, 100, "up")).toBe("improving")
  })

  it("returns declining when value goes up but improvingDirection is down", () => {
    // 100 -> 120 = 20% increase, but "down" is improving
    expect(computeTrend(120, 100, "down")).toBe("declining")
  })

  it("returns improving when value goes down and improvingDirection is down", () => {
    // 100 -> 80 = -20% decrease, and "down" is improving
    expect(computeTrend(80, 100, "down")).toBe("improving")
  })

  it("returns declining when value goes down and improvingDirection is up", () => {
    // 100 -> 80 = -20% decrease
    expect(computeTrend(80, 100, "up")).toBe("declining")
  })

  it("handles previousValue of 0 with non-zero current", () => {
    expect(computeTrend(10, 0, "up")).toBe("improving")
    expect(computeTrend(10, 0, "down")).toBe("declining")
  })

  it("returns stable when both values are 0", () => {
    expect(computeTrend(0, 0, "up")).toBe("stable")
  })
})

// --- computeConfoundWarning ---

describe("computeConfoundWarning", () => {
  it("returns sample size warning when sampleSize < 10 — AC-71", () => {
    const date = new Date(2026, 2, 1) // March
    expect(computeConfoundWarning(9, date)).toBe("Sample size < 10")
    expect(computeConfoundWarning(0, date)).toBe("Sample size < 10")
  })

  it("returns seasonal warning for August (month index 7)", () => {
    const august = new Date(2026, 7, 15)
    expect(computeConfoundWarning(50, august)).toBe(
      "Seasonal low period \u2014 baseline may be depressed",
    )
  })

  it("returns seasonal warning for December (month index 11)", () => {
    const december = new Date(2026, 11, 1)
    expect(computeConfoundWarning(50, december)).toBe(
      "Seasonal low period \u2014 baseline may be depressed",
    )
  })

  it("returns null when no confound present", () => {
    const march = new Date(2026, 2, 15)
    expect(computeConfoundWarning(50, march)).toBeNull()
  })

  it("prioritises sample size warning over seasonal when both apply", () => {
    const august = new Date(2026, 7, 1)
    expect(computeConfoundWarning(5, august)).toBe("Sample size < 10")
  })

  it("returns null for sampleSize exactly 10 in non-seasonal month", () => {
    const march = new Date(2026, 2, 1)
    expect(computeConfoundWarning(10, march)).toBeNull()
  })
})

// --- computeHypothesisMeasurement ---

describe("computeHypothesisMeasurement", () => {
  it("combines trend and confound into measurement", () => {
    const result = computeHypothesisMeasurement(
      "L1",
      50,
      30,
      40,
      "down",
      new Date(2026, 2, 1), // March, no seasonal
    )
    expect(result).toEqual({
      hypothesisId: "L1",
      currentValue: 30,
      previousValue: 40,
      trend: "improving", // went down, improvingDirection is down
      confoundWarning: null,
      sampleSize: 50,
    })
  })

  it("marks insufficient_data with confound when sample is small and value is null", () => {
    const result = computeHypothesisMeasurement(
      "L3",
      5,
      null,
      null,
      "up",
      new Date(2026, 2, 1),
    )
    expect(result.trend).toBe("insufficient_data")
    expect(result.confoundWarning).toBe("Sample size < 10")
  })
})

// --- HYPOTHESIS_MEASUREMENT_CONFIG ---

describe("HYPOTHESIS_MEASUREMENT_CONFIG", () => {
  it("has entries for all 7 hypotheses", () => {
    const ids: string[] = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]
    for (const id of ids) {
      expect(HYPOTHESIS_MEASUREMENT_CONFIG[id as keyof typeof HYPOTHESIS_MEASUREMENT_CONFIG]).toBeDefined()
    }
  })

  it("L1 tracks claim_evaluation with improvingDirection down", () => {
    expect(HYPOTHESIS_MEASUREMENT_CONFIG.L1).toEqual({
      decisionType: "claim_evaluation",
      improvingDirection: "down",
    })
  })

  it("L5 tracks conversion_trigger_evaluation with improvingDirection up", () => {
    expect(HYPOTHESIS_MEASUREMENT_CONFIG.L5).toEqual({
      decisionType: "conversion_trigger_evaluation",
      improvingDirection: "up",
    })
  })
})

// --- computeOverallRisk (from proactive-churn.ts) ---

describe("computeOverallRisk", () => {
  it("returns low when factors is empty — AC-75", () => {
    expect(computeOverallRisk([])).toBe("low")
  })

  it("returns medium for single non-payment factor", () => {
    expect(computeOverallRisk(["quality_declining"])).toBe("medium")
    expect(computeOverallRisk(["engagement_dropping"])).toBe("medium")
    expect(computeOverallRisk(["low_quality_paid"])).toBe("medium")
  })

  it("returns high for payment_at_risk alone", () => {
    expect(computeOverallRisk(["payment_at_risk"])).toBe("high")
  })

  it("returns high for 2+ factors", () => {
    expect(computeOverallRisk(["quality_declining", "engagement_dropping"])).toBe("high")
  })

  it("returns high for 3 factors", () => {
    expect(
      computeOverallRisk(["quality_declining", "engagement_dropping", "payment_at_risk"]),
    ).toBe("high")
  })
})

// --- computeRecommendedAction ---

describe("computeRecommendedAction", () => {
  it("returns none for low risk", () => {
    expect(computeRecommendedAction("low")).toBe("none")
  })

  it("returns monitor for medium risk", () => {
    expect(computeRecommendedAction("medium")).toBe("monitor")
  })

  it("returns retention_outreach for high risk", () => {
    expect(computeRecommendedAction("high")).toBe("retention_outreach")
  })
})
