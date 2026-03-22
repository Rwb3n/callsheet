// Unit tests for evaluateWinBack pure function + WinbackEligibleEvent payload shape
// AC-23, AC-24, AC-25

import { describe, it, expect } from "vitest"
import { evaluateWinBack, type WinBackInput } from "../winback-evaluation"
import type { WinbackEligibleEvent } from "@/lib/events/types"

function makeInput(overrides: Partial<WinBackInput> = {}): WinBackInput {
  return {
    listingId: "list-001",
    cancelledAccountId: "user-001",
    listing: {
      lifecycleStatus: "active",
      accountId: "user-001",
      name: "Test Production Co",
    },
    engagement: {
      enquiriesReceived: 0,
      profileViews: 0,
    },
    ...overrides,
  }
}

describe("evaluateWinBack", () => {
  // AC-23: no_action when listing not active
  it("returns no_action with reason listing_not_active when lifecycleStatus !== active", () => {
    const result = evaluateWinBack(makeInput({
      listing: { lifecycleStatus: "archived", accountId: "user-001", name: "Test" },
    }))
    expect(result).toEqual({ action: "no_action", reason: "listing_not_active" })
  })

  it("returns no_action with reason listing_not_active when lifecycleStatus is suspended", () => {
    const result = evaluateWinBack(makeInput({
      listing: { lifecycleStatus: "suspended", accountId: "user-001", name: "Test" },
    }))
    expect(result).toEqual({ action: "no_action", reason: "listing_not_active" })
  })

  // AC-23: no_action when ownership changed
  it("returns no_action with reason listing_ownership_changed when owner differs", () => {
    const result = evaluateWinBack(makeInput({
      listing: { lifecycleStatus: "active", accountId: "user-002", name: "Test" },
    }))
    expect(result).toEqual({ action: "no_action", reason: "listing_ownership_changed" })
  })

  it("returns no_action with reason listing_ownership_changed when accountId is null", () => {
    const result = evaluateWinBack(makeInput({
      listing: { lifecycleStatus: "active", accountId: null, name: "Test" },
    }))
    expect(result).toEqual({ action: "no_action", reason: "listing_ownership_changed" })
  })

  // AC-24: send_email when enquiries > 3
  it("returns send_email with mergeFields when enquiries > 3", () => {
    const result = evaluateWinBack(makeInput({
      engagement: { enquiriesReceived: 5, profileViews: 10 },
    }))
    expect(result.action).toBe("send_email")
    if (result.action === "send_email") {
      expect(result.mergeFields.subject).toContain("Test Production Co")
      expect(result.mergeFields.body).toContain("5 enquiries")
      expect(result.mergeFields.listingName).toBe("Test Production Co")
      expect(result.mergeFields.enquiryCount).toBe(5)
      expect(result.mergeFields.viewCount).toBeUndefined()
    }
  })

  // AC-24: send_email when views > 100
  it("returns send_email with mergeFields when views > 100", () => {
    const result = evaluateWinBack(makeInput({
      engagement: { enquiriesReceived: 1, profileViews: 150 },
    }))
    expect(result.action).toBe("send_email")
    if (result.action === "send_email") {
      expect(result.mergeFields.body).toContain("150 times")
      expect(result.mergeFields.viewCount).toBe(150)
      expect(result.mergeFields.enquiryCount).toBeUndefined()
    }
  })

  // AC-24: send_email with both triggers
  it("returns send_email with both enquiryCount and viewCount when both thresholds met", () => {
    const result = evaluateWinBack(makeInput({
      engagement: { enquiriesReceived: 5, profileViews: 200 },
    }))
    expect(result.action).toBe("send_email")
    if (result.action === "send_email") {
      expect(result.mergeFields.enquiryCount).toBe(5)
      expect(result.mergeFields.viewCount).toBe(200)
    }
  })

  // Boundary: exactly at thresholds (not exceeded)
  it("returns no_action when enquiries === 3 and views === 100", () => {
    const result = evaluateWinBack(makeInput({
      engagement: { enquiriesReceived: 3, profileViews: 100 },
    }))
    expect(result).toEqual({ action: "no_action", reason: "insufficient_engagement" })
  })

  it("returns no_action when engagement is zero", () => {
    const result = evaluateWinBack(makeInput())
    expect(result).toEqual({ action: "no_action", reason: "insufficient_engagement" })
  })
})

// AC-25: winback_eligible emission payload shape
describe("WinbackEligibleEvent payload compliance", () => {
  it("matches EventPayloadMap shape with all required fields", () => {
    const result = evaluateWinBack(makeInput({
      engagement: { enquiriesReceived: 5, profileViews: 10 },
    }))
    expect(result.action).toBe("send_email")
    if (result.action !== "send_email") return

    // Build the event payload as the handler would
    const event: WinbackEligibleEvent = {
      _brand: "WinbackEligibleEvent" as const,
      listingId: "list-001",
      cancelledAccountId: "user-001",
      mergeFields: result.mergeFields,
      timestamp: new Date().toISOString(),
    }

    expect(event._brand).toBe("WinbackEligibleEvent")
    expect(event.listingId).toBe("list-001")
    expect(event.cancelledAccountId).toBe("user-001")
    expect(event.mergeFields.subject).toBeDefined()
    expect(event.mergeFields.body).toBeDefined()
    expect(event.mergeFields.listingName).toBeDefined()
    expect(event.timestamp).toBeDefined()
  })
})
