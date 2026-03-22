// Unit tests for evaluateRefund — AC-55 through AC-59

import { describe, it, expect } from "vitest"
import { evaluateRefund, type RefundEvaluationInput } from "@/domains/commercial/refund-evaluation"

function makeInput(overrides: Partial<RefundEvaluationInput> = {}): RefundEvaluationInput {
  return {
    listingId: "00000000-0000-4000-8000-000000000001",
    paddleSubscriptionId: "sub_123",
    subscriptionAgeInDays: 10,
    reason: "Not satisfied",
    enquiriesReceivedSinceSubscription: 0,
    priorRefundCount: 0,
    lastRefundAt: null,
    effectivePrice: 199,
    billingCadence: "annual",
    ...overrides,
  }
}

describe("evaluateRefund", () => {
  it("denies when enquiriesReceivedSinceSubscription > 10 regardless of age (AC-55)", () => {
    const result = evaluateRefund(makeInput({
      enquiriesReceivedSinceSubscription: 11,
      subscriptionAgeInDays: 5,
    }))
    expect(result.refundType).toBe("deny")
    expect(result.eligible).toBe(false)
    expect(result.amount).toBe(0)
  })

  it("denies when prior refund within 12 months (AC-56)", () => {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
    const result = evaluateRefund(makeInput({
      priorRefundCount: 1,
      lastRefundAt: sixMonthsAgo,
      subscriptionAgeInDays: 10,
    }))
    expect(result.refundType).toBe("deny")
    expect(result.eligible).toBe(false)
  })

  it("allows refund when prior refund was more than 12 months ago", () => {
    const thirteenMonthsAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const result = evaluateRefund(makeInput({
      priorRefundCount: 1,
      lastRefundAt: thirteenMonthsAgo,
      subscriptionAgeInDays: 10,
    }))
    expect(result.refundType).toBe("full")
    expect(result.eligible).toBe(true)
  })

  it("returns full refund with effectivePrice when <= 30 days (AC-57)", () => {
    const result = evaluateRefund(makeInput({
      subscriptionAgeInDays: 30,
      effectivePrice: 99,
    }))
    expect(result.refundType).toBe("full")
    expect(result.eligible).toBe(true)
    expect(result.amount).toBe(99)
  })

  it("returns partial pro-rata refund for 31-90 days annual (AC-58)", () => {
    const result = evaluateRefund(makeInput({
      subscriptionAgeInDays: 60,
      effectivePrice: 199,
      billingCadence: "annual",
    }))
    expect(result.refundType).toBe("partial")
    expect(result.eligible).toBe(true)
    // remaining = 365 - 60 = 305, proRata = floor(199 * 305/365) = floor(166.3) = 166
    expect(result.amount).toBe(Math.floor(199 * (305 / 365)))
  })

  it("returns partial pro-rata refund for 31-90 days monthly (AC-58)", () => {
    const result = evaluateRefund(makeInput({
      subscriptionAgeInDays: 45,
      effectivePrice: 19,
      billingCadence: "monthly",
    }))
    expect(result.refundType).toBe("partial")
    expect(result.eligible).toBe(true)
    // remaining = 30 - (45 % 30) = 30 - 15 = 15, proRata = floor(19 * 15/30) = floor(9.5) = 9
    expect(result.amount).toBe(Math.floor(19 * (15 / 30)))
  })

  it("denies when subscription age exceeds 90 days (AC-59)", () => {
    const result = evaluateRefund(makeInput({ subscriptionAgeInDays: 91 }))
    expect(result.refundType).toBe("deny")
    expect(result.eligible).toBe(false)
    expect(result.amount).toBe(0)
  })

  it("engagement guard takes precedence over age (AC-55)", () => {
    const result = evaluateRefund(makeInput({
      enquiriesReceivedSinceSubscription: 15,
      subscriptionAgeInDays: 5,
    }))
    expect(result.refundType).toBe("deny")
    expect(result.rationale).toContain("enquiries")
  })

  it("returns non-empty rationale for all decision paths", () => {
    const full = evaluateRefund(makeInput({ subscriptionAgeInDays: 10 }))
    const partial = evaluateRefund(makeInput({ subscriptionAgeInDays: 60 }))
    const deny = evaluateRefund(makeInput({ subscriptionAgeInDays: 100 }))
    expect(full.rationale.length).toBeGreaterThan(0)
    expect(partial.rationale.length).toBeGreaterThan(0)
    expect(deny.rationale.length).toBeGreaterThan(0)
  })
})
