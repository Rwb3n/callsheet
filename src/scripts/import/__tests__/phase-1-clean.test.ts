// Unit tests: Phase 1 automated cleaning — AC-22

import { describe, it, expect } from "vitest"
import {
  normalisePostcode,
  normaliseEmail,
  normaliseUrl,
  normalisePhone,
  titleCase,
  phase1AutomatedCleaning,
} from "../phase-1-clean"
import type { ImportRecord } from "../types"

describe("normalisePostcode", () => {
  it("normalises valid UK postcodes", () => {
    expect(normalisePostcode("SW1A 1AA")).toBe("SW1A 1AA")
    expect(normalisePostcode("sw1a1aa")).toBe("SW1A 1AA")
    expect(normalisePostcode("  EC1A 1BB ")).toBe("EC1A 1BB")
  })

  it("inserts missing space", () => {
    expect(normalisePostcode("SW1A1AA")).toBe("SW1A 1AA")
  })

  it("fixes common OCR errors (O→0, l→1)", () => {
    expect(normalisePostcode("SW1A OAA")).toBe("SW1A 0AA")
    expect(normalisePostcode("SWlA 1AA")).toBe("SW1A 1AA")
  })

  it("preserves valid postcodes with leading O (e.g. OX1)", () => {
    expect(normalisePostcode("OX1 1AB")).toBe("OX1 1AB")
  })

  it("returns null for invalid postcodes", () => {
    expect(normalisePostcode("INVALID")).toBeNull()
    expect(normalisePostcode("123")).toBeNull()
    expect(normalisePostcode("")).toBeNull()
  })
})

describe("normaliseEmail", () => {
  it("normalises valid emails to lowercase", () => {
    expect(normaliseEmail("Test@Example.COM")).toBe("test@example.com")
    expect(normaliseEmail("  user@domain.co.uk  ")).toBe("user@domain.co.uk")
  })

  it("returns null for invalid emails", () => {
    expect(normaliseEmail("not-an-email")).toBeNull()
    expect(normaliseEmail("@domain.com")).toBeNull()
    expect(normaliseEmail("user@")).toBeNull()
  })
})

describe("normaliseUrl", () => {
  it("adds https:// if missing", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com")
  })

  it("strips trailing slash", () => {
    expect(normaliseUrl("https://example.com/")).toBe("https://example.com")
  })

  it("preserves existing https", () => {
    expect(normaliseUrl("https://example.com/path")).toBe("https://example.com/path")
  })

  it("preserves http", () => {
    expect(normaliseUrl("http://example.com")).toBe("http://example.com")
  })

  it("returns null for empty string", () => {
    expect(normaliseUrl("")).toBeNull()
  })
})

describe("normalisePhone", () => {
  it("normalises UK numbers to +44 format", () => {
    expect(normalisePhone("07700900000")).toBe("+447700900000")
    expect(normalisePhone("020 7946 0958")).toBe("+442079460958")
  })

  it("preserves +44 prefix", () => {
    expect(normalisePhone("+447700900000")).toBe("+447700900000")
  })

  it("strips formatting characters", () => {
    expect(normalisePhone("(020) 7946-0958")).toBe("+442079460958")
  })

  it("returns null for invalid phone numbers", () => {
    expect(normalisePhone("123")).toBeNull()
    expect(normalisePhone("not a number")).toBeNull()
  })
})

describe("titleCase", () => {
  it("converts to title case", () => {
    expect(titleCase("john smith cameras")).toBe("John Smith Cameras")
  })

  it("trims and collapses whitespace", () => {
    expect(titleCase("  smith   cameras  ")).toBe("Smith Cameras")
  })
})

describe("phase1AutomatedCleaning", () => {
  function makeRecord(overrides: Partial<ImportRecord> = {}): ImportRecord {
    return {
      sourceId: "test-1",
      name: "Test Company",
      entityType: "company",
      services: [],
      ...overrides,
    }
  }

  it("cleans valid records without flagging", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({
        basePostcode: "SW1A 1AA",
        contactEmail: "Test@Example.com",
        websiteUrl: "example.com",
        contactPhone: "07700900000",
      }),
    ])
    expect(result.cleaned).toHaveLength(1)
    expect(result.flagged).toHaveLength(0)
    expect(result.cleaned[0].contactEmail).toBe("test@example.com")
    expect(result.cleaned[0].websiteUrl).toBe("https://example.com")
    expect(result.cleaned[0].contactPhone).toBe("+447700900000")
  })

  it("flags records with invalid email", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({ contactEmail: "not-valid" }),
    ])
    expect(result.flagged).toHaveLength(1)
    expect(result.flagged[0].flagReason).toBe("invalid_data")
  })

  it("flags records with invalid postcode and no region fallback", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({ basePostcode: "INVALID" }),
    ])
    expect(result.flagged).toHaveLength(1)
    expect(result.flagged[0].flagReason).toBe("invalid_data")
  })

  it("keeps records with invalid postcode when region exists", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({ basePostcode: "INVALID", baseRegion: "London" }),
    ])
    expect(result.cleaned).toHaveLength(1)
    expect(result.cleaned[0].flags).toHaveLength(1)
    expect(result.cleaned[0].flags[0].reason).toBe("invalid_postcode")
  })

  it("applies title case to names", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({ name: "smith cameras ltd" }),
    ])
    expect(result.cleaned[0].name).toBe("Smith Cameras Ltd")
  })

  it("reports correct stats", () => {
    const result = phase1AutomatedCleaning([
      makeRecord({ sourceId: "1" }),
      makeRecord({ sourceId: "2", contactEmail: "bad" }),
      makeRecord({ sourceId: "3" }),
    ])
    expect(result.stats).toEqual({ total: 3, cleaned: 2, flagged: 1 })
  })
})
