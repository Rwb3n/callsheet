// Refund evaluation — S8 §8, AC-55 through AC-59
// Pure decision function. S7's admin.refunds.evaluate calls this via P4 import.

export type RefundEvaluationInput = {
  listingId: string
  paddleSubscriptionId: string
  subscriptionAgeInDays: number
  reason: string
  enquiriesReceivedSinceSubscription: number
  priorRefundCount: number
  lastRefundAt: string | null
  effectivePrice: number
  billingCadence: "annual" | "monthly"
}

export type RefundDecision = {
  eligible: boolean
  refundType: "full" | "partial" | "deny"
  amount: number
  rationale: string
}

export function evaluateRefund(input: RefundEvaluationInput): RefundDecision {
  // Guard 1: engagement guard
  if (input.enquiriesReceivedSinceSubscription > 10) {
    return {
      eligible: false,
      refundType: "deny",
      amount: 0,
      rationale:
        `Listing received ${input.enquiriesReceivedSinceSubscription} enquiries since subscription. ` +
        `Service has been consumed.`,
    }
  }

  // Guard 2: repeat refund within 12 months
  if (input.priorRefundCount > 0 && input.lastRefundAt !== null) {
    const daysSinceLastRefund =
      (Date.now() - new Date(input.lastRefundAt).getTime()) / (1000 * 60 * 60 * 24)
    const monthsSinceLastRefund = daysSinceLastRefund / 30
    if (monthsSinceLastRefund < 12) {
      return {
        eligible: false,
        refundType: "deny",
        amount: 0,
        rationale:
          `Prior refund issued ${Math.floor(monthsSinceLastRefund)} months ago. ` +
          `Policy: one refund per 12-month period.`,
      }
    }
  }

  // Guard 3: age guard >90 days
  if (input.subscriptionAgeInDays > 90) {
    return {
      eligible: false,
      refundType: "deny",
      amount: 0,
      rationale:
        `Subscription is ${input.subscriptionAgeInDays} days old. ` +
        `Maximum refund window is 90 days.`,
    }
  }

  // Full refund: within 30 days
  if (input.subscriptionAgeInDays <= 30) {
    return {
      eligible: true,
      refundType: "full",
      amount: input.effectivePrice,
      rationale: `Within 30-day refund window. Full refund of £${input.effectivePrice}.`,
    }
  }

  // Partial refund: 31-90 days, pro-rata
  const remainingDays =
    input.billingCadence === "annual"
      ? 365 - input.subscriptionAgeInDays
      : 30 - (input.subscriptionAgeInDays % 30)
  const totalDays = input.billingCadence === "annual" ? 365 : 30
  const proRataAmount = Math.floor(input.effectivePrice * (remainingDays / totalDays))

  return {
    eligible: true,
    refundType: "partial",
    amount: proRataAmount,
    rationale:
      `Beyond 30-day window (${input.subscriptionAgeInDays} days). ` +
      `Pro-rata refund: £${proRataAmount} (${remainingDays}/${totalDays} days remaining).`,
  }
}
