// Unit tests for search term analytics types — AC-50, AC-39
// Full DB-level integration tests live in separate integration test files.

import { describe, it, expect } from "vitest"
import type {
  SearchTermsData,
  SearchTermEntry,
  UnmatchedTerm,
} from "../types"

describe("SearchTermsData shape (AC-50)", () => {
  it("has terms array with term, count, and lastSeen fields", () => {
    const entry: SearchTermEntry = {
      term: "camera operator",
      count: 5,
      lastSeen: "2026-03-07T12:00:00.000Z",
    }

    expect(entry.term).toBe("camera operator")
    expect(entry.count).toBe(5)
    expect(entry.lastSeen).toBe("2026-03-07T12:00:00.000Z")
  })

  it("has zeroResultTerms as string array", () => {
    const data: SearchTermsData = {
      terms: [],
      zeroResultTerms: ["nonexistent service", "fake provider"],
      taxonomyGaps: [],
    }

    expect(data.zeroResultTerms).toEqual(["nonexistent service", "fake provider"])
    expect(Array.isArray(data.zeroResultTerms)).toBe(true)
  })

  it("has taxonomyGaps as UnmatchedTerm array", () => {
    const gap: UnmatchedTerm = {
      term: "drone pilot",
      frequency: 7,
      potentialSector: "Camera",
      potentialServiceArea: undefined,
    }

    const data: SearchTermsData = {
      terms: [{ term: "gaffer", count: 3, lastSeen: "2026-03-07T00:00:00Z" }],
      zeroResultTerms: ["drone pilot"],
      taxonomyGaps: [gap],
    }

    expect(data.taxonomyGaps).toHaveLength(1)
    expect(data.taxonomyGaps[0].term).toBe("drone pilot")
    expect(data.taxonomyGaps[0].frequency).toBe(7)
    expect(data.taxonomyGaps[0].potentialSector).toBe("Camera")
    expect(data.taxonomyGaps[0].potentialServiceArea).toBeUndefined()
  })

  it("represents a complete SearchTermsData object with all fields populated", () => {
    const data: SearchTermsData = {
      terms: [
        { term: "camera operator", count: 12, lastSeen: "2026-03-07T10:00:00Z" },
        { term: "lighting", count: 8, lastSeen: "2026-03-06T15:00:00Z" },
      ],
      zeroResultTerms: ["quantum editor", "hologram designer"],
      taxonomyGaps: [
        { term: "quantum editor", frequency: 5 },
        { term: "hologram designer", frequency: 3, potentialSector: "Post Production" },
      ],
    }

    // Structural assertions
    expect(data.terms).toHaveLength(2)
    expect(data.zeroResultTerms).toHaveLength(2)
    expect(data.taxonomyGaps).toHaveLength(2)

    // terms entries have required shape
    for (const entry of data.terms) {
      expect(typeof entry.term).toBe("string")
      expect(typeof entry.count).toBe("number")
      expect(typeof entry.lastSeen).toBe("string")
    }

    // taxonomyGaps entries have required shape
    for (const gap of data.taxonomyGaps) {
      expect(typeof gap.term).toBe("string")
      expect(typeof gap.frequency).toBe("number")
    }
  })
})

describe("UnmatchedTerm shape (AC-39)", () => {
  it("requires term and frequency", () => {
    const term: UnmatchedTerm = {
      term: "virtual production",
      frequency: 4,
    }

    expect(term.term).toBe("virtual production")
    expect(term.frequency).toBe(4)
    expect(term.potentialSector).toBeUndefined()
    expect(term.potentialServiceArea).toBeUndefined()
  })

  it("allows optional potentialSector and potentialServiceArea", () => {
    const term: UnmatchedTerm = {
      term: "LED volume operator",
      frequency: 6,
      potentialSector: "Camera",
      potentialServiceArea: "Virtual Production",
    }

    expect(term.potentialSector).toBe("Camera")
    expect(term.potentialServiceArea).toBe("Virtual Production")
  })

  it("supports an array of unmatched terms as taxonomy gaps output", () => {
    const gaps: UnmatchedTerm[] = [
      { term: "drone pilot", frequency: 10 },
      { term: "LED wall tech", frequency: 7, potentialSector: "Lighting" },
      { term: "AI colorist", frequency: 3, potentialServiceArea: "Post Production" },
    ]

    expect(gaps).toHaveLength(3)
    // All have required fields
    for (const gap of gaps) {
      expect(gap.term).toBeDefined()
      expect(gap.frequency).toBeGreaterThanOrEqual(3)
    }
  })
})
