// Support triage unit tests — CS-WORK-058 AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.8
import { describe, it, expect } from "vitest"
import {
  classifyTicket,
  computePriority,
  elevatePriority,
  computeSlaDeadline,
  getSlaHours,
  checkKbDeflection,
} from "../triage"
import type { TicketCategory, TicketPriority } from "../triage"

// --- AC-2.1: classifyTicket assigns one of 8 categories ---

describe("classifyTicket", () => {
  it("classifies data_request keywords", () => {
    expect(classifyTicket({ subject: "DSAR request", body: "" })).toBe("data_request")
    expect(classifyTicket({ subject: "", body: "please delete my data" })).toBe("data_request")
    expect(classifyTicket({ subject: "GDPR enquiry", body: "" })).toBe("data_request")
    expect(classifyTicket({ subject: "Erasure request", body: "" })).toBe("data_request")
  })

  it("classifies claim_dispute keywords", () => {
    expect(classifyTicket({ subject: "Claim dispute", body: "" })).toBe("claim_dispute")
    expect(classifyTicket({ subject: "", body: "I already own this" })).toBe("claim_dispute")
    expect(classifyTicket({ subject: "This is my company", body: "" })).toBe("claim_dispute")
  })

  it("classifies refund_request keywords", () => {
    expect(classifyTicket({ subject: "Refund please", body: "" })).toBe("refund_request")
    expect(classifyTicket({ subject: "", body: "I want my money back" })).toBe("refund_request")
  })

  it("classifies billing_support keywords", () => {
    expect(classifyTicket({ subject: "Billing issue", body: "" })).toBe("billing_support")
    expect(classifyTicket({ subject: "", body: "wrong charge on my account" })).toBe("billing_support")
    expect(classifyTicket({ subject: "Invoice query", body: "" })).toBe("billing_support")
  })

  it("classifies account_access keywords", () => {
    expect(classifyTicket({ subject: "Can't login", body: "" })).toBe("account_access")
    expect(classifyTicket({ subject: "", body: "I'm locked out" })).toBe("account_access")
    expect(classifyTicket({ subject: "Password reset not working", body: "" })).toBe("account_access")
  })

  it("classifies feature_gating_confusion keywords", () => {
    expect(classifyTicket({ subject: "I can't see who viewed", body: "" })).toBe("feature_gating_confusion")
    expect(classifyTicket({ subject: "", body: "how do I upgrade my tier" })).toBe("feature_gating_confusion")
    expect(classifyTicket({ subject: "Feature is gated", body: "" })).toBe("feature_gating_confusion")
  })

  it("classifies profile_support keywords", () => {
    expect(classifyTicket({ subject: "Help with my profile", body: "" })).toBe("profile_support")
    expect(classifyTicket({ subject: "", body: "how do I update my listing" })).toBe("profile_support")
    expect(classifyTicket({ subject: "Photo upload issue", body: "" })).toBe("profile_support")
  })

  it("returns other for unrecognised input", () => {
    expect(classifyTicket({ subject: "Hello", body: "General question" })).toBe("other")
    expect(classifyTicket({ subject: "", body: "" })).toBe("other")
  })

  it("is case-insensitive", () => {
    expect(classifyTicket({ subject: "DSAR REQUEST", body: "" })).toBe("data_request")
    expect(classifyTicket({ subject: "REFUND", body: "" })).toBe("refund_request")
  })

  it("matches keywords across subject + body combined", () => {
    expect(classifyTicket({ subject: "Request", body: "I need a refund" })).toBe("refund_request")
  })

  it("uses specificity ordering — data_request beats billing_support", () => {
    // "dsar" matches data_request before any billing keywords
    expect(classifyTicket({ subject: "DSAR billing query", body: "" })).toBe("data_request")
  })
})

// --- AC-2.2: base priority is deterministic per category ---

describe("computePriority", () => {
  const highCategories: TicketCategory[] = ["data_request", "claim_dispute", "refund_request"]
  const normalCategories: TicketCategory[] = ["billing_support", "account_access", "other"]
  const lowCategories: TicketCategory[] = ["feature_gating_confusion", "profile_support"]

  it("assigns high priority to urgent categories", () => {
    for (const cat of highCategories) {
      expect(computePriority(cat, null).priority).toBe("high")
    }
  })

  it("assigns normal priority to standard categories", () => {
    for (const cat of normalCategories) {
      expect(computePriority(cat, null).priority).toBe("normal")
    }
  })

  it("assigns low priority to informational categories", () => {
    for (const cat of lowCategories) {
      expect(computePriority(cat, null).priority).toBe("low")
    }
  })

  // --- AC-2.3: churn risk elevation ---

  it("elevates priority by one level for high_risk accounts", () => {
    const result = computePriority("billing_support", "high_risk")
    expect(result.priority).toBe("high")
    expect(result.elevated).toBe(true)
  })

  it("elevates low to normal for high_risk", () => {
    const result = computePriority("profile_support", "high_risk")
    expect(result.priority).toBe("normal")
    expect(result.elevated).toBe(true)
  })

  it("elevates high to critical for high_risk", () => {
    const result = computePriority("data_request", "high_risk")
    expect(result.priority).toBe("critical")
    expect(result.elevated).toBe(true)
  })

  it("does not elevate past critical (ceiling)", () => {
    // data_request base = high, high_risk elevates to critical
    // but if somehow already critical, stays critical
    expect(elevatePriority("critical")).toBe("critical")
  })

  it("does NOT elevate priority for at_risk accounts (badge only)", () => {
    const result = computePriority("billing_support", "at_risk")
    expect(result.priority).toBe("normal")
    expect(result.elevated).toBe(false)
  })

  it("does NOT elevate when churnRiskLevel is null", () => {
    const result = computePriority("billing_support", null)
    expect(result.priority).toBe("normal")
    expect(result.elevated).toBe(false)
  })
})

// --- AC-2.4: SLA deadline computation ---

describe("computeSlaDeadline", () => {
  const baseTime = new Date("2026-01-15T12:00:00Z")

  const cases: Array<[TicketPriority, number]> = [
    ["critical", 4],
    ["high", 24],
    ["normal", 72],
    ["low", 168],
  ]

  for (const [priority, hours] of cases) {
    it(`computes ${hours}h deadline for ${priority} priority`, () => {
      const deadline = computeSlaDeadline(priority, baseTime)
      const diffMs = deadline.getTime() - baseTime.getTime()
      expect(diffMs).toBe(hours * 60 * 60 * 1000)
    })
  }

  it("uses current time when no base provided", () => {
    const before = Date.now()
    const deadline = computeSlaDeadline("normal")
    const after = Date.now()
    const expectedMin = before + 72 * 60 * 60 * 1000
    const expectedMax = after + 72 * 60 * 60 * 1000
    expect(deadline.getTime()).toBeGreaterThanOrEqual(expectedMin)
    expect(deadline.getTime()).toBeLessThanOrEqual(expectedMax)
  })
})

describe("getSlaHours", () => {
  it("returns correct hours per priority", () => {
    expect(getSlaHours("critical")).toBe(4)
    expect(getSlaHours("high")).toBe(24)
    expect(getSlaHours("normal")).toBe(72)
    expect(getSlaHours("low")).toBe(168)
  })
})

// --- AC-2.8: KB deflection ---

describe("checkKbDeflection", () => {
  it("returns article for account_access", () => {
    const result = checkKbDeflection("account_access")
    expect(result.matched).toBe(true)
    expect(result.articleUrl).toBe("/help/account-access")
  })

  it("returns article for billing_support", () => {
    const result = checkKbDeflection("billing_support")
    expect(result.matched).toBe(true)
    expect(result.articleUrl).toBe("/help/billing-faq")
  })

  it("returns article for feature_gating_confusion", () => {
    const result = checkKbDeflection("feature_gating_confusion")
    expect(result.matched).toBe(true)
    expect(result.articleUrl).toBe("/help/tier-comparison")
  })

  it("returns article for profile_support", () => {
    const result = checkKbDeflection("profile_support")
    expect(result.matched).toBe(true)
    expect(result.articleUrl).toBe("/help/editing-your-listing")
  })

  it("returns article for refund_request", () => {
    const result = checkKbDeflection("refund_request")
    expect(result.matched).toBe(true)
    expect(result.articleUrl).toBe("/help/refund-policy")
  })

  it("returns no match for data_request", () => {
    expect(checkKbDeflection("data_request").matched).toBe(false)
  })

  it("returns no match for claim_dispute", () => {
    expect(checkKbDeflection("claim_dispute").matched).toBe(false)
  })

  it("returns no match for other", () => {
    expect(checkKbDeflection("other").matched).toBe(false)
  })
})
