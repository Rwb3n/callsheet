import { describe, it, expect } from "vitest"
import { PRICING } from "../pricing-config"

describe("PRICING", () => {
  it("is typed as Record<SubscriptionTier, { annual; monthly }> and satisfies at compile time (AC-60)", () => {
    // Compile-time check: if PRICING doesn't satisfy the type, this file won't compile.
    // Runtime check: all four tiers present with both fields.
    const tiers = Object.keys(PRICING)
    expect(tiers).toEqual(["free", "standard", "premium", "partner"])

    for (const tier of tiers) {
      const p = PRICING[tier as keyof typeof PRICING]
      expect(typeof p.annual).toBe("number")
      expect(typeof p.monthly).toBe("number")
    }
  })

  it("matches spec values: free 0/0, standard 199/19, premium 399/39, partner 699/69 (AC-61)", () => {
    expect(PRICING.free).toEqual({ annual: 0, monthly: 0 })
    expect(PRICING.standard).toEqual({ annual: 199, monthly: 19 })
    expect(PRICING.premium).toEqual({ annual: 399, monthly: 39 })
    expect(PRICING.partner).toEqual({ annual: 699, monthly: 69 })
  })

  it("prices each listing independently — no multi-listing discount fields exist (AC-63)", () => {
    // PRICING is a flat record keyed by tier. No discount, quantity, or bundle fields.
    for (const tier of Object.keys(PRICING)) {
      const entry = PRICING[tier as keyof typeof PRICING]
      const keys = Object.keys(entry)
      expect(keys).toEqual(["annual", "monthly"])
    }
  })
})
