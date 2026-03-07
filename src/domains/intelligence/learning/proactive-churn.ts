// Proactive churn risk computation — S9 §5.2, AC-75/76/77
// Pure logic: risk scoring and recommended actions for proactive detection signals.
// No I/O — handler wires DB reads and event emission.

import type { ChurnRiskFactor } from "@/lib/events/types"

// --- Types ---

export type DetectedChurnSignal = {
  listingId: string
  accountId: string
  factor: "engagement_dropping" | "billing_cadence_switch_to_monthly"
  overallRisk: "low" | "medium" | "high"
  recommendedAction: "none" | "monitor" | "retention_outreach"
  existingFactors: ChurnRiskFactor[]
}

// --- Spec constants ---

export const PROACTIVE_CHURN_SPEC = {
  ENGAGEMENT_DROP_THRESHOLD: 0.30,
  CADENCE_SWITCH_WINDOW_DAYS: 7,
}

// --- Pure functions ---

export function computeOverallRisk(
  factors: ChurnRiskFactor[],
): "low" | "medium" | "high" {
  if (factors.length === 0) return "low"
  if (factors.length >= 2) return "high"
  if (factors.includes("payment_at_risk")) return "high"
  return "medium"
}

export function computeRecommendedAction(
  risk: "low" | "medium" | "high",
): "none" | "monitor" | "retention_outreach" {
  if (risk === "high") return "retention_outreach"
  if (risk === "medium") return "monitor"
  return "none"
}
