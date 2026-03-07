// Unit tests for funnel friction ratio computation — AC-77, AC-78
import { describe, it, expect } from "vitest"
import {
  computeFrictionRatios,
  findEscalationGates,
  FUNNEL_SPEC,
} from "../funnel-analysis"

describe("computeFrictionRatios", () => {
  it("AC-77: computes friction ratio correctly (10 tickets / 2 conversions = 5.0)", () => {
    const frictionGates = [{ gateName: "analytics_preview", ticketCount: 10 }]
    const triggerStats = [{ triggerType: "analytics_preview", fired: 2 }]

    const result = computeFrictionRatios(frictionGates, triggerStats)

    expect(result).toHaveLength(1)
    expect(result[0].gate).toBe("analytics_preview")
    expect(result[0].conversions).toBe(2)
    expect(result[0].complaints).toBe(10)
    expect(result[0].frictionRatio).toBe(5.0)
  })

  it("AC-77: returns Infinity when complaints exist but 0 conversions", () => {
    const frictionGates = [{ gateName: "shortlist_limit", ticketCount: 3 }]
    const triggerStats: { triggerType: string; fired: number }[] = []

    const result = computeFrictionRatios(frictionGates, triggerStats)

    expect(result).toHaveLength(1)
    expect(result[0].frictionRatio).toBe(Infinity)
    expect(result[0].conversions).toBe(0)
    expect(result[0].complaints).toBe(3)
  })

  it("AC-77: returns 0 when both complaints and conversions are 0", () => {
    const frictionGates = [{ gateName: "enquiry_limit", ticketCount: 0 }]
    const triggerStats = [{ triggerType: "enquiry_limit", fired: 0 }]

    const result = computeFrictionRatios(frictionGates, triggerStats)

    expect(result).toHaveLength(1)
    expect(result[0].frictionRatio).toBe(0)
    expect(result[0].conversions).toBe(0)
    expect(result[0].complaints).toBe(0)
  })

  it("handles multiple gates with mixed trigger matches", () => {
    const frictionGates = [
      { gateName: "analytics_preview", ticketCount: 10 },
      { gateName: "shortlist_limit", ticketCount: 5 },
      { gateName: "enquiry_limit", ticketCount: 0 },
    ]
    const triggerStats = [
      { triggerType: "analytics_preview", fired: 2 },
      { triggerType: "enquiry_limit", fired: 10 },
    ]

    const result = computeFrictionRatios(frictionGates, triggerStats)

    expect(result).toHaveLength(3)
    expect(result[0].frictionRatio).toBe(5.0) // 10/2
    expect(result[1].frictionRatio).toBe(Infinity) // 5/0, complaints exist
    expect(result[2].frictionRatio).toBe(0) // 0/10
  })
})

describe("findEscalationGates", () => {
  it("AC-78: returns gates with friction ratio > 5.0", () => {
    const ratios = [
      { gate: "analytics_preview", conversions: 2, complaints: 12, frictionRatio: 6.0 },
      { gate: "shortlist_limit", conversions: 10, complaints: 2, frictionRatio: 0.2 },
      { gate: "enquiry_limit", conversions: 0, complaints: 3, frictionRatio: Infinity },
    ]

    const escalations = findEscalationGates(ratios)

    expect(escalations).toHaveLength(2)
    expect(escalations[0].gate).toBe("analytics_preview")
    expect(escalations[1].gate).toBe("enquiry_limit")
  })

  it("AC-78: returns empty array when all ratios <= 5.0", () => {
    const ratios = [
      { gate: "analytics_preview", conversions: 10, complaints: 10, frictionRatio: 1.0 },
      { gate: "shortlist_limit", conversions: 2, complaints: 10, frictionRatio: 5.0 },
      { gate: "enquiry_limit", conversions: 100, complaints: 0, frictionRatio: 0 },
    ]

    const escalations = findEscalationGates(ratios)

    expect(escalations).toHaveLength(0)
  })

  it("uses FUNNEL_SPEC.FRICTION_RATIO_ESCALATION threshold of 5.0", () => {
    expect(FUNNEL_SPEC.FRICTION_RATIO_ESCALATION).toBe(5.0)
  })
})
