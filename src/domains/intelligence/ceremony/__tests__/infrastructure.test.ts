// Ceremony infrastructure unit tests — AC-55, AC-56, AC-57, AC-69
import { describe, it, expect } from "vitest"
import {
  computeInputsHash,
  currentMonth,
  currentQuarter,
  startOfMonth,
  startOfQuarter,
  evaluateCeremonyOutcomeLogic,
  getNextRunDate,
  CADENCE_MS,
} from "../infrastructure"

describe("computeInputsHash", () => {
  it("produces deterministic SHA-256 hex", () => {
    const h1 = computeInputsHash({ month: "2026-03" })
    const h2 = computeInputsHash({ month: "2026-03" })
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it("produces different hash for different inputs", () => {
    const h1 = computeInputsHash({ month: "2026-03" })
    const h2 = computeInputsHash({ month: "2026-04" })
    expect(h1).not.toBe(h2)
  })
})

describe("period helpers", () => {
  it("currentMonth returns YYYY-MM", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/)
  })

  it("currentQuarter returns YYYY-QN", () => {
    expect(currentQuarter()).toMatch(/^\d{4}-Q[1-4]$/)
  })

  it("startOfMonth returns first day of month", () => {
    const d = new Date(2026, 2, 15) // March 15
    const result = startOfMonth(d)
    expect(result.getDate()).toBe(1)
    expect(result.getMonth()).toBe(2)
  })

  it("startOfQuarter returns first day of quarter", () => {
    const d = new Date(2026, 4, 15) // May 15 (Q2)
    const result = startOfQuarter(d)
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(1)
  })
})

describe("evaluateCeremonyOutcomeLogic — AC-57", () => {
  it("escalates when recommendation has financial impact", () => {
    const result = evaluateCeremonyOutcomeLogic({
      ceremonyType: "multi_listing_pricing",
      recommendation: {
        action: "recommend_discount",
        hasFinancialImpact: true,
        hasUserVisibleChange: false,
        precedentExists: true,
      },
    })
    expect(result.disposition).toBe("escalate_to_principal")
    expect(result.reason).toBe("financial impact")
  })

  it("escalates when recommendation has user-visible change", () => {
    const result = evaluateCeremonyOutcomeLogic({
      ceremonyType: "taxonomy_review",
      recommendation: {
        action: "promote_tag:foo",
        hasFinancialImpact: false,
        hasUserVisibleChange: true,
        precedentExists: false,
      },
    })
    expect(result.disposition).toBe("escalate_to_principal")
    expect(result.reason).toBe("user-visible change")
  })

  it("escalates when no precedent exists", () => {
    const result = evaluateCeremonyOutcomeLogic({
      ceremonyType: "data_health_review",
      recommendation: {
        action: "escalate_decay_trend",
        hasFinancialImpact: false,
        hasUserVisibleChange: false,
        precedentExists: false,
      },
    })
    expect(result.disposition).toBe("escalate_to_principal")
    expect(result.reason).toBe("first-time recommendation type")
  })

  it("auto-applies when low-risk with precedent", () => {
    const result = evaluateCeremonyOutcomeLogic({
      ceremonyType: "data_health_review",
      recommendation: {
        action: "investigate_enrichment",
        hasFinancialImpact: false,
        hasUserVisibleChange: false,
        precedentExists: true,
      },
    })
    expect(result.disposition).toBe("auto_apply")
    expect(result.reason).toBe("low-risk with precedent")
  })
})

describe("getNextRunDate — AC-55", () => {
  it("returns +30 days for monthly ceremonies", () => {
    const now = new Date("2026-03-01T00:00:00Z")
    const next = getNextRunDate("data_health_review", now)
    expect(next.getTime()).toBe(now.getTime() + CADENCE_MS.monthly)
  })

  it("returns +90 days for quarterly ceremonies", () => {
    const now = new Date("2026-03-01T00:00:00Z")
    const next = getNextRunDate("taxonomy_review", now)
    expect(next.getTime()).toBe(now.getTime() + CADENCE_MS.quarterly)
  })
})
