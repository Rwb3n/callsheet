// Event bus singleton — CH-CS-014 W1 AC-02

import { describe, it, expect, afterEach } from "vitest"
import { getEventBus, _resetEventBusSingleton } from "../singleton"

afterEach(() => {
  _resetEventBusSingleton()
})

describe("getEventBus", () => {
  it("returns the same InProcessEventBus instance on repeated calls (AC-02)", () => {
    const first = getEventBus()
    const second = getEventBus()
    expect(first).toBe(second)
  })

  it("returns a bus with registered consumers", () => {
    const bus = getEventBus()
    const handlers = bus.getRegisteredHandlers()
    // D&L registers 9 handlers, intelligence registers 15 (some overlap on same events)
    expect(handlers.get("profile_viewed")).toHaveLength(2) // D&L + intelligence
    expect(handlers.get("enquiry_submitted")).toHaveLength(2) // D&L + intelligence
    expect(handlers.get("search_performed")).toHaveLength(2) // D&L + intelligence
  })

  it("registers ops consumer when payment override is provided", () => {
    const mockPayment = {
      createCheckoutSession: async () => ({ checkoutUrl: "" }),
      cancelSubscription: async () => ({ status: "cancelled" as const }),
      listSubscriptions: async () => [],
      listAllActiveSubscriptions: async () => [],
      getCustomerPortalUrl: async () => "",
      refundTransaction: async () => ({ status: "refunded" as const }),
    }
    const bus = getEventBus({ payment: mockPayment })
    const handlers = bus.getRegisteredHandlers()
    expect(handlers.get("pending_cancellation_created")).toHaveLength(1)
  })
})
