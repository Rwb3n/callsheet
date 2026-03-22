// Integration test: intelligence EVENT_CONSUMER_MATRIX wiring
// AC-85, AC-94

import { describe, it, expect } from "vitest"
import { EVENT_CONSUMER_MATRIX } from "@/lib/events/types"

describe("intelligence consumer matrix wiring (AC-85, AC-94)", () => {
  it("AC-85/AC-94: EVENT_CONSUMER_MATRIX contains exactly 15 intelligence entries", () => {
    const intelligenceEntries: Array<{
      event: string
      consumer: string
      domain: string
      mode: string
    }> = []

    for (const [event, consumers] of Object.entries(EVENT_CONSUMER_MATRIX)) {
      for (const entry of consumers) {
        if (entry.domain === "intelligence") {
          intelligenceEntries.push({
            event,
            consumer: entry.consumer,
            domain: entry.domain,
            mode: entry.mode,
          })
        }
      }
    }

    expect(intelligenceEntries).toHaveLength(15)
  })

  it("AC-85: all intelligence entries are async mode", () => {
    for (const [, consumers] of Object.entries(EVENT_CONSUMER_MATRIX)) {
      for (const entry of consumers) {
        if (entry.domain === "intelligence") {
          expect(entry.mode).toBe("async")
        }
      }
    }
  })

  it("AC-85: 10 D&L perception consumers registered (from CS-WORK-081)", () => {
    const dlEvents = [
      "claim_approved",
      "decay_signal_detected",
      "search_performed",
      "profile_viewed",
      "enquiry_submitted",
      "shortlist_added",
      "listing_created",
      "profile_edited",
      "contact_attempt",
      "account_closed",
    ]

    for (const event of dlEvents) {
      const consumers = EVENT_CONSUMER_MATRIX[event as keyof typeof EVENT_CONSUMER_MATRIX]
      const intelEntries = consumers.filter((c) => c.domain === "intelligence")
      expect(
        intelEntries.length,
        `${event} should have at least 1 intelligence consumer`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it("AC-85: 5 CR/Ops consumers registered (CS-WORK-082)", () => {
    const crOpsEvents = [
      "subscription_tier_changed",
      "subscription_ended",
      "conversion_milestone",
      "winback_delivery_result",
      "enquiry_responded",
    ]

    for (const event of crOpsEvents) {
      const consumers = EVENT_CONSUMER_MATRIX[event as keyof typeof EVENT_CONSUMER_MATRIX]
      const intelEntries = consumers.filter((c) => c.domain === "intelligence")
      expect(
        intelEntries.length,
        `${event} should have at least 1 intelligence consumer`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it("AC-94: consumer IDs are unique within intelligence domain", () => {
    const consumerIds = new Set<string>()

    for (const [, consumers] of Object.entries(EVENT_CONSUMER_MATRIX)) {
      for (const entry of consumers) {
        if (entry.domain === "intelligence") {
          const key = `${entry.consumer}`
          expect(
            consumerIds.has(key),
            `Duplicate intelligence consumer ID: ${key}`,
          ).toBe(false)
          consumerIds.add(key)
        }
      }
    }
  })
})
