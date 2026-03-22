// Unit tests — CS-WORK-068: Churn detection and intervention
// Tests evaluateChurnIntervention pure decision logic (AC-14, AC-15, AC-17)

import { describe, it, expect } from "vitest"
import {
  evaluateChurnIntervention,
  V1_CHURN_RISK_FACTORS,
  type ChurnInterventionInput,
} from "../churn-intervention"

function makeInput(overrides: Partial<ChurnInterventionInput> = {}): ChurnInterventionInput {
  return {
    listingId: "00000000-0000-4000-a000-000000000001",
    accountId: "00000000-0000-4000-a000-000000000002",
    cancellationReason: "voluntary",
    previousTier: "standard",
    recentEngagement: { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
    subscriptionStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    lastChurnEventAt: null,
    ...overrides,
  }
}

describe("evaluateChurnIntervention", () => {
  // AC-14: returns one of show_retention_data | accept | grace_period
  it("returns grace_period for payment_failure reason", () => {
    const result = evaluateChurnIntervention(makeInput({ cancellationReason: "payment_failure" }))
    expect(result.action).toBe("grace_period")
    expect(result).toMatchObject({
      action: "grace_period",
      duration: "14_days",
      fallback: "downgrade_to_free",
    })
  })

  it("returns accept for paddle_reconciliation reason", () => {
    const result = evaluateChurnIntervention(makeInput({ cancellationReason: "paddle_reconciliation" }))
    expect(result.action).toBe("accept")
  })

  it("returns accept for account_closed reason", () => {
    const result = evaluateChurnIntervention(makeInput({ cancellationReason: "account_closed" }))
    expect(result.action).toBe("accept")
    if (result.action === "accept") {
      expect(result.reason).toContain("account_closed")
    }
  })

  it("returns accept for listing_archived reason", () => {
    const result = evaluateChurnIntervention(makeInput({ cancellationReason: "listing_archived" }))
    expect(result.action).toBe("accept")
    if (result.action === "accept") {
      expect(result.reason).toContain("listing_archived")
    }
  })

  // AC-15: show_retention_data when enquiries > 0 OR views > 50
  it("returns show_retention_data when enquiries > 0", () => {
    const result = evaluateChurnIntervention(makeInput({
      recentEngagement: { profileViews: 10, searchAppearances: 5, enquiriesReceived: 3 },
    }))
    expect(result.action).toBe("show_retention_data")
    if (result.action === "show_retention_data") {
      expect(result.data.enquiries).toBe(3)
      expect(result.data.views).toBe(10)
      expect(result.message).toContain("3 enquiries")
      expect(result.message).toContain("10 profile views")
    }
  })

  it("returns show_retention_data when views > 50", () => {
    const result = evaluateChurnIntervention(makeInput({
      recentEngagement: { profileViews: 75, searchAppearances: 100, enquiriesReceived: 0 },
    }))
    expect(result.action).toBe("show_retention_data")
    if (result.action === "show_retention_data") {
      expect(result.data.enquiries).toBe(0)
      expect(result.data.views).toBe(75)
    }
  })

  it("returns accept for low engagement voluntary cancellation", () => {
    const result = evaluateChurnIntervention(makeInput({
      recentEngagement: { profileViews: 10, searchAppearances: 5, enquiriesReceived: 0 },
    }))
    expect(result.action).toBe("accept")
    if (result.action === "accept") {
      expect(result.reason).toBe("low_engagement — retention unlikely")
    }
  })

  it("returns accept when views exactly 50 and no enquiries", () => {
    const result = evaluateChurnIntervention(makeInput({
      recentEngagement: { profileViews: 50, searchAppearances: 20, enquiriesReceived: 0 },
    }))
    expect(result.action).toBe("accept")
  })

  it("returns show_retention_data when views exactly 51", () => {
    const result = evaluateChurnIntervention(makeInput({
      recentEngagement: { profileViews: 51, searchAppearances: 0, enquiriesReceived: 0 },
    }))
    expect(result.action).toBe("show_retention_data")
  })
})

// AC-17: V1 produces 3 of 5 ChurnRiskFactor values
describe("V1_CHURN_RISK_FACTORS", () => {
  it("contains exactly 3 factors", () => {
    expect(V1_CHURN_RISK_FACTORS).toHaveLength(3)
  })

  it("contains low_quality_paid, payment_at_risk, quality_declining", () => {
    expect(V1_CHURN_RISK_FACTORS).toContain("low_quality_paid")
    expect(V1_CHURN_RISK_FACTORS).toContain("payment_at_risk")
    expect(V1_CHURN_RISK_FACTORS).toContain("quality_declining")
  })

  it("does not contain deferred S9 factors", () => {
    expect(V1_CHURN_RISK_FACTORS).not.toContain("engagement_dropping")
    expect(V1_CHURN_RISK_FACTORS).not.toContain("billing_cadence_switch_to_monthly")
  })
})
