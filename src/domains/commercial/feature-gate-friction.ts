// Feature gate friction evaluation — S8 §6, AC-47, AC-48, AC-49
// Pure function. Consumes Ops' FeatureGateFrictionSummary, returns per-gate assessment.

import type { FeatureGateFrictionSummary } from "@/domains/operations/friction/queries"

export type FrictionLevel = "ok" | "warning" | "critical"

export type GateFrictionAssessment = {
  gateName: string
  frictionRatio: number
  ticketCount: number
  level: FrictionLevel
  recommendation: string
}

export type FrictionEvaluationResult = {
  period: string
  assessments: GateFrictionAssessment[]
  overallLevel: FrictionLevel
}

export function evaluateFeatureGateFriction(
  summary: FeatureGateFrictionSummary,
): FrictionEvaluationResult {
  const assessments: GateFrictionAssessment[] = summary.gates.map((gate) => {
    if (gate.frictionRatio > 0.15) {
      return {
        gateName: gate.gateName,
        frictionRatio: gate.frictionRatio,
        ticketCount: gate.ticketCount,
        level: "critical" as const,
        recommendation:
          `Gate '${gate.gateName}' generated ${gate.ticketCount} complaints ` +
          `(${formatPercent(gate.frictionRatio)} of all tickets). ` +
          `Escalate to principal. Consider: (a) improve gate explanation, ` +
          `(b) move feature to lower tier, (c) remove gate.`,
      }
    }
    if (gate.frictionRatio > 0.05) {
      return {
        gateName: gate.gateName,
        frictionRatio: gate.frictionRatio,
        ticketCount: gate.ticketCount,
        level: "warning" as const,
        recommendation:
          `Gate '${gate.gateName}' at ${formatPercent(gate.frictionRatio)} friction. ` +
          `Monitor next period. If sustained, investigate conversion impact.`,
      }
    }
    return {
      gateName: gate.gateName,
      frictionRatio: gate.frictionRatio,
      ticketCount: gate.ticketCount,
      level: "ok" as const,
      recommendation: "Friction within expected range.",
    }
  })

  const overallLevel: FrictionLevel = assessments.some((a) => a.level === "critical")
    ? "critical"
    : assessments.some((a) => a.level === "warning")
      ? "warning"
      : "ok"

  return { period: summary.period, assessments, overallLevel }
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
