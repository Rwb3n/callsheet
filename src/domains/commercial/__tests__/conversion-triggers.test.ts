// Unit tests for conversion trigger evaluators — AC-7, AC-8
import { describe, it, expect } from "vitest"
import {
  evaluateViewMilestone,
  evaluateFirstEnquiry,
  evaluateCompetitorUpgraded,
  evaluateAnalyticsTeaser,
  evaluateSocialProof,
  evaluateEngagementSummary,
  buildUpgradeUrl,
} from "../conversion-triggers"

// --- Minimal state factory ---

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    listingId: "00000000-0000-4000-8000-000000000001",
    lastViewMilestoneFired: null as number | null,
    firstEnquiryTriggerFired: false,
    competitorUpgradedFired: 0,
    lastCompetitorUpgradedAt: null as Date | null,
    analyticsTeaseFired: 0,
    lastAnalyticsTeaseAt: null as Date | null,
    socialProofFired: 0,
    lastSocialProofAt: null as Date | null,
    engagementSummaryFired: 0,
    lastEngagementSummaryAt: null as Date | null,
    endowmentCtaShown: false,
    lastChurnEventAt: null as Date | null,
    lastChurnReason: null as string | null,
    effectivePriceAtSubscription: null as number | null,
    revenueHealthExtended: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeEngagement(overrides: Record<string, unknown> = {}) {
  return {
    profileViews: 0,
    searchAppearances: 0,
    enquiriesReceived: 0,
    ...overrides,
  }
}

describe("evaluateViewMilestone", () => {
  it("fires at 50 views when no prior milestone (AC-7 payload structure)", () => {
    const result = evaluateViewMilestone(makeEngagement({ profileViews: 55 }), makeState())
    expect(result.fired).toBe(true)
    if (result.fired) {
      expect(result.trigger).toBe("view_milestone")
      expect(result.milestoneValue).toBe(50)
      expect(result.stateUpdate).toEqual({ lastViewMilestoneFired: 50 })
    }
  })

  it("fires at 100 after 50 was fired", () => {
    const result = evaluateViewMilestone(
      makeEngagement({ profileViews: 105 }),
      makeState({ lastViewMilestoneFired: 50, updatedAt: new Date(Date.now() - 8 * 86400000) }),
    )
    expect(result.fired).toBe(true)
    if (result.fired) expect(result.milestoneValue).toBe(100)
  })

  it("does not fire when all milestones exhausted", () => {
    const result = evaluateViewMilestone(
      makeEngagement({ profileViews: 999 }),
      makeState({ lastViewMilestoneFired: 200 }),
    )
    expect(result).toEqual({ fired: false, reason: "all_milestones_exhausted" })
  })

  it("does not fire when views below threshold", () => {
    const result = evaluateViewMilestone(makeEngagement({ profileViews: 30 }), makeState())
    expect(result).toEqual({ fired: false, reason: "threshold_not_reached" })
  })
})

describe("evaluateFirstEnquiry", () => {
  it("fires on exactly 1 enquiry (AC-7 payload structure)", () => {
    const result = evaluateFirstEnquiry(makeEngagement({ enquiriesReceived: 1 }), makeState())
    expect(result.fired).toBe(true)
    if (result.fired) {
      expect(result.trigger).toBe("first_enquiry")
      expect(result.stateUpdate).toEqual({ firstEnquiryTriggerFired: true })
    }
  })

  it("does not fire on 0 enquiries", () => {
    const result = evaluateFirstEnquiry(makeEngagement({ enquiriesReceived: 0 }), makeState())
    expect(result).toEqual({ fired: false, reason: "not_first_enquiry" })
  })

  it("does not fire on 2+ enquiries", () => {
    const result = evaluateFirstEnquiry(makeEngagement({ enquiriesReceived: 2 }), makeState())
    expect(result).toEqual({ fired: false, reason: "not_first_enquiry" })
  })

  it("does not fire if already fired", () => {
    const result = evaluateFirstEnquiry(
      makeEngagement({ enquiriesReceived: 1 }),
      makeState({ firstEnquiryTriggerFired: true }),
    )
    expect(result).toEqual({ fired: false, reason: "already_fired" })
  })
})

describe("evaluateCompetitorUpgraded", () => {
  it("fires with sufficient overlap and pool size", () => {
    const result = evaluateCompetitorUpgraded(makeState(), 0.6, 25)
    expect(result.fired).toBe(true)
    if (result.fired) expect(result.trigger).toBe("competitor_upgraded")
  })

  it("rejects when max firings reached", () => {
    const result = evaluateCompetitorUpgraded(
      makeState({ competitorUpgradedFired: 3 }),
      0.8,
      30,
    )
    expect(result).toEqual({ fired: false, reason: "max_firings_reached" })
  })

  it("rejects when overlap < 0.5", () => {
    const result = evaluateCompetitorUpgraded(makeState(), 0.3, 25)
    expect(result).toEqual({ fired: false, reason: "insufficient_overlap" })
  })

  it("rejects when pool < 20 (anonymity threshold)", () => {
    const result = evaluateCompetitorUpgraded(makeState(), 0.6, 15)
    expect(result).toEqual({ fired: false, reason: "pool_too_small_for_anonymity" })
  })
})

describe("evaluateAnalyticsTeaser", () => {
  it("fires when views > 0 and no prior firing", () => {
    const result = evaluateAnalyticsTeaser(makeEngagement({ profileViews: 10 }), makeState())
    expect(result.fired).toBe(true)
    if (result.fired) expect(result.trigger).toBe("analytics_teaser")
  })

  it("rejects when no engagement", () => {
    const result = evaluateAnalyticsTeaser(makeEngagement(), makeState())
    expect(result).toEqual({ fired: false, reason: "no_engagement" })
  })
})

describe("evaluateSocialProof", () => {
  it("fires when 3+ paid listings in sector", () => {
    const result = evaluateSocialProof(makeState(), 5)
    expect(result.fired).toBe(true)
    if (result.fired) expect(result.trigger).toBe("social_proof")
  })

  it("rejects when < 3 paid listings", () => {
    const result = evaluateSocialProof(makeState(), 2)
    expect(result).toEqual({ fired: false, reason: "insufficient_paid_competitors" })
  })
})

describe("evaluateEngagementSummary", () => {
  it("fires when any engagement data exists", () => {
    const result = evaluateEngagementSummary(makeEngagement({ enquiriesReceived: 1 }), makeState())
    expect(result.fired).toBe(true)
    if (result.fired) expect(result.trigger).toBe("engagement_summary")
  })

  it("rejects when no engagement data", () => {
    const result = evaluateEngagementSummary(makeEngagement(), makeState())
    expect(result).toEqual({ fired: false, reason: "no_engagement_data" })
  })
})

// AC-8: Email merge field structure verification
describe("merge field structure (AC-8)", () => {
  it("buildUpgradeUrl includes listingId", () => {
    const url = buildUpgradeUrl("abc-123")
    expect(url).toContain("listing=abc-123")
    expect(url).toContain("/pricing")
  })

  it("buildUpgradeUrl includes tier when specified", () => {
    const url = buildUpgradeUrl("abc-123", "premium")
    expect(url).toContain("tier=premium")
  })

  // AC-8 merge field completeness is validated in integration tests via emailService.send calls
})
