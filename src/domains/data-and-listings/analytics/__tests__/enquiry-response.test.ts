// Unit tests for enquiry response insights — AC-52, AC-53
import { describe, it, expect } from "vitest"
import type { EnquiryResponseInsights } from "../types"
import { median, ANALYTICS_CONSTANTS } from "../types"
import { computeInsightsFromData } from "../enquiry-response"

describe("EnquiryResponseInsights shape", () => {
  it("has the correct structure with all required fields", () => {
    const insights: EnquiryResponseInsights = {
      responseRate: 0.8,
      medianResponseTimeHours: 2.5,
      conversionEstimate: 0.75,
      totalEnquiries: 10,
      respondedEnquiries: 8,
    }

    expect(insights).toHaveProperty("responseRate")
    expect(insights).toHaveProperty("medianResponseTimeHours")
    expect(insights).toHaveProperty("conversionEstimate")
    expect(insights).toHaveProperty("totalEnquiries")
    expect(insights).toHaveProperty("respondedEnquiries")
  })

  it("allows null for medianResponseTimeHours when no responses", () => {
    const insights: EnquiryResponseInsights = {
      responseRate: 0,
      medianResponseTimeHours: null,
      conversionEstimate: 0,
      totalEnquiries: 5,
      respondedEnquiries: 0,
    }

    expect(insights.medianResponseTimeHours).toBeNull()
  })
})

describe("computeInsightsFromData", () => {
  it("returns null when totalEnquiries is 0 (AC-53)", () => {
    const result = computeInsightsFromData(0, [])
    expect(result).toBeNull()
  })

  it("computes response rate from total and responded counts", () => {
    const result = computeInsightsFromData(10, [60, 120, 180, 240, 300])
    expect(result).not.toBeNull()
    expect(result!.responseRate).toBe(0.5) // 5 responded out of 10
    expect(result!.totalEnquiries).toBe(10)
    expect(result!.respondedEnquiries).toBe(5)
  })

  it("computes 100% response rate when all enquiries responded", () => {
    const result = computeInsightsFromData(3, [60, 120, 180])
    expect(result).not.toBeNull()
    expect(result!.responseRate).toBe(1.0)
  })

  it("computes median response time in hours from minutes", () => {
    // Response times in minutes: 60, 120, 180 → median = 120 minutes = 2.0 hours
    const result = computeInsightsFromData(3, [60, 120, 180])
    expect(result).not.toBeNull()
    expect(result!.medianResponseTimeHours).toBe(2.0)
  })

  it("computes median with even number of response times", () => {
    // Response times: 60, 120, 180, 240 → median = (120 + 180) / 2 = 150 minutes = 2.5 hours
    const result = computeInsightsFromData(4, [60, 120, 180, 240])
    expect(result).not.toBeNull()
    expect(result!.medianResponseTimeHours).toBe(2.5)
  })

  it("returns null medianResponseTimeHours when no response times", () => {
    // 5 total enquiries but no responded (empty array)
    const result = computeInsightsFromData(5, [])
    expect(result).not.toBeNull()
    expect(result!.medianResponseTimeHours).toBeNull()
    expect(result!.respondedEnquiries).toBe(0)
    expect(result!.responseRate).toBe(0)
  })

  it("computes conversion estimate from fast responses", () => {
    const threshold = ANALYTICS_CONSTANTS.FAST_RESPONSE_THRESHOLD_MINUTES // 1440 = 24h

    // 3 fast (within 24h), 2 slow (over 24h)
    const times = [60, 720, 1200, 1500, 2880]
    const result = computeInsightsFromData(5, times)

    expect(result).not.toBeNull()
    // Fast = 60, 720, 1200 (all <= 1440) → 3 fast out of 5 responded
    expect(result!.conversionEstimate).toBe(0.6)
  })

  it("conversion estimate is 1.0 when all responses are fast", () => {
    const result = computeInsightsFromData(3, [30, 60, 120])
    expect(result).not.toBeNull()
    expect(result!.conversionEstimate).toBe(1.0)
  })

  it("conversion estimate is 0.0 when all responses are slow", () => {
    const result = computeInsightsFromData(2, [1500, 2880])
    expect(result).not.toBeNull()
    expect(result!.conversionEstimate).toBe(0)
  })

  it("conversion estimate is 0 when no responses (zero division guard)", () => {
    const result = computeInsightsFromData(3, [])
    expect(result).not.toBeNull()
    expect(result!.conversionEstimate).toBe(0)
  })

  it("includes exactly-threshold response time as fast", () => {
    const threshold = ANALYTICS_CONSTANTS.FAST_RESPONSE_THRESHOLD_MINUTES
    const result = computeInsightsFromData(1, [threshold])
    expect(result).not.toBeNull()
    expect(result!.conversionEstimate).toBe(1.0)
  })
})

describe("median helper", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0)
  })

  it("returns the value for single element", () => {
    expect(median([42])).toBe(42)
  })

  it("returns middle value for odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3)
  })

  it("returns average of two middle values for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("handles unsorted input", () => {
    expect(median([5, 1, 3])).toBe(3)
  })
})
