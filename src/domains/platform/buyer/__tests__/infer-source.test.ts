// AC-19: inferSource maps referer to search, shortlist, or direct correctly

import { describe, it, expect } from "vitest"
import { inferSource } from "../infer-source"

describe("inferSource", () => {
  it('returns "search" when referer contains /search', () => {
    expect(inferSource("https://callsheet.co.uk/search?q=camera")).toBe("search")
  })

  it('returns "search" for /search at path root', () => {
    expect(inferSource("https://callsheet.co.uk/search")).toBe("search")
  })

  it('returns "shortlist" when referer contains /dashboard/shortlists', () => {
    expect(inferSource("https://callsheet.co.uk/dashboard/shortlists")).toBe("shortlist")
  })

  it('returns "shortlist" with shortlist item path', () => {
    expect(inferSource("https://callsheet.co.uk/dashboard/shortlists/abc-123")).toBe("shortlist")
  })

  it('returns "direct" for null referer', () => {
    expect(inferSource(null)).toBe("direct")
  })

  it('returns "direct" for undefined referer', () => {
    expect(inferSource(undefined)).toBe("direct")
  })

  it('returns "direct" for empty string referer', () => {
    expect(inferSource("")).toBe("direct")
  })

  it('returns "direct" for external referer', () => {
    expect(inferSource("https://google.com/")).toBe("direct")
  })

  it('returns "direct" for other internal pages', () => {
    expect(inferSource("https://callsheet.co.uk/dashboard")).toBe("direct")
  })

  it('returns "search" when /search appears before /dashboard/shortlists', () => {
    expect(inferSource("https://callsheet.co.uk/search?from=/dashboard/shortlists")).toBe("search")
  })
})
