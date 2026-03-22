// Unit tests for evaluateRevenueHealth — AC-45
// computeRevenuePerception tests are in integration (need DB).

import { describe, it, expect } from "vitest"
import {
  evaluateRevenueHealth,
  type RevenuePerception,
} from "@/domains/commercial/revenue-perception"

function makePerception(overrides: Partial<RevenuePerception> = {}): RevenuePerception {
  return {
    mrr: 1000,
    arr: 12000,
    tierDistribution: { free: 100, standard: 10, premium: 5, partner: 2 },
    churnRate30d: 1,
    churnRate90d: 3,
    conversionRate30d: 5,
    netRevenueRetention: 110,
    averageRevenuePerListing: 58.82,
    ...overrides,
  }
}

describe("evaluateRevenueHealth", () => {
  it("returns healthy for all metrics when values are within healthy thresholds", () => {
    const signals = evaluateRevenueHealth(makePerception())
    expect(signals).toHaveLength(3)
    expect(signals.every((s) => s.status === "healthy")).toBe(true)
  })

  it("returns critical for churnRate30d > 8%", () => {
    const signals = evaluateRevenueHealth(makePerception({ churnRate30d: 10 }))
    const churn = signals.find((s) => s.metric === "churnRate30d")!
    expect(churn.status).toBe("critical")
    expect(churn.value).toBe(10)
    expect(churn.threshold).toBe(8)
  })

  it("returns warning for churnRate30d between 3% and 8%", () => {
    const signals = evaluateRevenueHealth(makePerception({ churnRate30d: 5 }))
    const churn = signals.find((s) => s.metric === "churnRate30d")!
    expect(churn.status).toBe("warning")
    expect(churn.value).toBe(5)
    expect(churn.threshold).toBe(3)
  })

  it("returns healthy for churnRate30d < 3%", () => {
    const signals = evaluateRevenueHealth(makePerception({ churnRate30d: 2 }))
    const churn = signals.find((s) => s.metric === "churnRate30d")!
    expect(churn.status).toBe("healthy")
  })

  it("returns warning for churnRate30d exactly 3% (boundary)", () => {
    const signals = evaluateRevenueHealth(makePerception({ churnRate30d: 3 }))
    const churn = signals.find((s) => s.metric === "churnRate30d")!
    expect(churn.status).toBe("warning")
  })

  it("returns warning for conversionRate30d < 2%", () => {
    const signals = evaluateRevenueHealth(makePerception({ conversionRate30d: 1.5 }))
    const conv = signals.find((s) => s.metric === "conversionRate30d")!
    expect(conv.status).toBe("warning")
    expect(conv.threshold).toBe(2)
  })

  it("returns healthy for conversionRate30d >= 2%", () => {
    const signals = evaluateRevenueHealth(makePerception({ conversionRate30d: 2 }))
    const conv = signals.find((s) => s.metric === "conversionRate30d")!
    expect(conv.status).toBe("healthy")
  })

  it("returns critical for NRR < 90%", () => {
    const signals = evaluateRevenueHealth(makePerception({ netRevenueRetention: 85 }))
    const nrr = signals.find((s) => s.metric === "netRevenueRetention")!
    expect(nrr.status).toBe("critical")
    expect(nrr.threshold).toBe(90)
  })

  it("returns warning for NRR between 90% and 100%", () => {
    const signals = evaluateRevenueHealth(makePerception({ netRevenueRetention: 95 }))
    const nrr = signals.find((s) => s.metric === "netRevenueRetention")!
    expect(nrr.status).toBe("warning")
    expect(nrr.threshold).toBe(100)
  })

  it("returns healthy for NRR >= 100%", () => {
    const signals = evaluateRevenueHealth(makePerception({ netRevenueRetention: 105 }))
    const nrr = signals.find((s) => s.metric === "netRevenueRetention")!
    expect(nrr.status).toBe("healthy")
  })

  it("produces independent signals — critical churn + warning NRR simultaneously (AC-45)", () => {
    const signals = evaluateRevenueHealth(
      makePerception({ churnRate30d: 10, netRevenueRetention: 95 }),
    )
    const churn = signals.find((s) => s.metric === "churnRate30d")!
    const nrr = signals.find((s) => s.metric === "netRevenueRetention")!
    expect(churn.status).toBe("critical")
    expect(nrr.status).toBe("warning")
  })

  it("always returns exactly 3 signals (one per evaluated metric)", () => {
    const signals = evaluateRevenueHealth(makePerception())
    expect(signals).toHaveLength(3)
    const metrics = signals.map((s) => s.metric)
    expect(metrics).toContain("churnRate30d")
    expect(metrics).toContain("conversionRate30d")
    expect(metrics).toContain("netRevenueRetention")
  })
})
