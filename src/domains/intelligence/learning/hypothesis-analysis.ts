// Learning hypothesis measurement — S9 §5.1, AC-71/72/73
// Pure logic: trend computation, confound warnings, hypothesis measurement.
// No I/O — handler wires DB reads/writes.

// --- Types ---

export type HypothesisId = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7"
export type Trend = "improving" | "stable" | "declining" | "insufficient_data"
export type ImprovingDirection = "up" | "down"

export type HypothesisMeasurement = {
  hypothesisId: HypothesisId
  currentValue: number | null
  previousValue: number | null
  trend: Trend
  confoundWarning: string | null
  sampleSize: number
}

export type HypothesisMeasurementConfig = {
  decisionType: string
  improvingDirection: ImprovingDirection
}

// --- Spec constants ---

const SPEC = {
  TREND_STABLE_THRESHOLD: 0.05,
  MIN_SAMPLE_SIZE: 10,
  SEASONAL_LOW_MONTHS: [7, 11], // 0-indexed: August, December
}

// --- Configuration ---

export const HYPOTHESIS_MEASUREMENT_CONFIG: Record<HypothesisId, HypothesisMeasurementConfig> = {
  L1: { decisionType: "claim_evaluation", improvingDirection: "down" },
  L2: { decisionType: "claim_evaluation", improvingDirection: "up" },
  L3: { decisionType: "verification_upgrade", improvingDirection: "up" },
  L4: { decisionType: "feature_gate_nudge", improvingDirection: "down" },
  L5: { decisionType: "conversion_trigger_evaluation", improvingDirection: "up" },
  L6: { decisionType: "churn_intervention", improvingDirection: "down" },
  L7: { decisionType: "task_completion", improvingDirection: "down" },
}

// --- Pure functions ---

export function computeTrend(
  currentValue: number | null,
  previousValue: number | null,
  improvingDirection: ImprovingDirection,
): Trend {
  if (currentValue == null || previousValue == null) {
    return "insufficient_data"
  }

  if (previousValue === 0) {
    // Avoid division by zero — any non-zero current is a change
    if (currentValue === 0) return "stable"
    return improvingDirection === "up" ? "improving" : "declining"
  }

  const relativeChange = (currentValue - previousValue) / Math.abs(previousValue)

  if (Math.abs(relativeChange) < SPEC.TREND_STABLE_THRESHOLD) {
    return "stable"
  }

  const isIncreasing = relativeChange > 0

  if (improvingDirection === "up") {
    return isIncreasing ? "improving" : "declining"
  }
  // improvingDirection === "down"
  return isIncreasing ? "declining" : "improving"
}

export function computeConfoundWarning(
  sampleSize: number,
  measurementPeriodStart: Date,
): string | null {
  if (sampleSize < SPEC.MIN_SAMPLE_SIZE) {
    return "Sample size < 10"
  }

  const month = measurementPeriodStart.getMonth() // 0-indexed
  if (SPEC.SEASONAL_LOW_MONTHS.includes(month)) {
    return "Seasonal low period \u2014 baseline may be depressed"
  }

  return null
}

export function computeHypothesisMeasurement(
  hypothesisId: HypothesisId,
  sampleSize: number,
  currentValue: number | null,
  previousValue: number | null,
  improvingDirection: ImprovingDirection,
  measurementPeriodStart: Date,
): HypothesisMeasurement {
  const trend = computeTrend(currentValue, previousValue, improvingDirection)
  const confoundWarning = computeConfoundWarning(sampleSize, measurementPeriodStart)

  return {
    hypothesisId,
    currentValue,
    previousValue,
    trend,
    confoundWarning,
    sampleSize,
  }
}
