// Unit tests for evaluateFeatureGateFriction — AC-47, AC-48, AC-49

import { describe, it, expect } from "vitest"
import { evaluateFeatureGateFriction } from "@/domains/commercial/feature-gate-friction"
import type { FeatureGateFrictionSummary } from "@/domains/operations/friction/queries"

function makeSummary(
  gates: { gateName: string; frictionRatio: number; ticketCount?: number }[],
): FeatureGateFrictionSummary {
  return {
    period: "30d",
    gates: gates.map((g) => ({
      gateName: g.gateName,
      ticketCount: g.ticketCount ?? 5,
      totalTickets: 100,
      frictionRatio: g.frictionRatio,
    })),
  }
}

describe("evaluateFeatureGateFriction", () => {
  it("returns critical for frictionRatio > 0.15 (AC-47)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "trendAnalytics", frictionRatio: 0.2, ticketCount: 20 }]),
    )
    expect(result.assessments).toHaveLength(1)
    expect(result.assessments[0].level).toBe("critical")
    expect(result.assessments[0].gateName).toBe("trendAnalytics")
  })

  it("returns warning for frictionRatio > 0.05 and <= 0.15 (AC-47)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "maxMedia", frictionRatio: 0.1 }]),
    )
    expect(result.assessments[0].level).toBe("warning")
  })

  it("returns ok for frictionRatio <= 0.05 (AC-47)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "sponsoredPlacement", frictionRatio: 0.03 }]),
    )
    expect(result.assessments[0].level).toBe("ok")
  })

  it("returns ok for frictionRatio exactly 0.05 (boundary)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "maxCredits", frictionRatio: 0.05 }]),
    )
    expect(result.assessments[0].level).toBe("ok")
  })

  it("returns warning for frictionRatio exactly 0.15 (boundary)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "maxCredits", frictionRatio: 0.15 }]),
    )
    expect(result.assessments[0].level).toBe("warning")
  })

  it("overallLevel is worst severity across all gates (AC-48)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([
        { gateName: "ok-gate", frictionRatio: 0.02 },
        { gateName: "warn-gate", frictionRatio: 0.1 },
        { gateName: "crit-gate", frictionRatio: 0.2 },
      ]),
    )
    expect(result.overallLevel).toBe("critical")
  })

  it("overallLevel is warning when no critical gates exist (AC-48)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([
        { gateName: "ok-gate", frictionRatio: 0.02 },
        { gateName: "warn-gate", frictionRatio: 0.08 },
      ]),
    )
    expect(result.overallLevel).toBe("warning")
  })

  it("overallLevel is ok when all gates are ok (AC-48)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([
        { gateName: "gate-a", frictionRatio: 0.01 },
        { gateName: "gate-b", frictionRatio: 0.03 },
      ]),
    )
    expect(result.overallLevel).toBe("ok")
  })

  it("overallLevel is ok when no gates exist", () => {
    const result = evaluateFeatureGateFriction(makeSummary([]))
    expect(result.overallLevel).toBe("ok")
    expect(result.assessments).toHaveLength(0)
  })

  it("each assessment includes gateName, ticketCount, frictionRatio, recommendation (AC-49)", () => {
    const result = evaluateFeatureGateFriction(
      makeSummary([{ gateName: "trendAnalytics", frictionRatio: 0.2, ticketCount: 15 }]),
    )
    const a = result.assessments[0]
    expect(a.gateName).toBe("trendAnalytics")
    expect(a.ticketCount).toBe(15)
    expect(a.frictionRatio).toBe(0.2)
    expect(a.recommendation.length).toBeGreaterThan(0)
  })

  it("preserves period from input summary", () => {
    const summary: FeatureGateFrictionSummary = {
      period: "90d",
      gates: [{ gateName: "a", ticketCount: 1, totalTickets: 10, frictionRatio: 0.1 }],
    }
    const result = evaluateFeatureGateFriction(summary)
    expect(result.period).toBe("90d")
  })
})
