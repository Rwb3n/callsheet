// CS-WORK-019: Taxonomy suggestions unit tests — AC-36, AC-37

import { describe, it, expect } from "vitest"
import { getSuggestions, SUGGESTION_MAP } from "../suggestions"
import type { TaxonomyTag } from "../suggestions"

// --- AC-36: Curated suggestions return for Camera, Post-Production, Sound sectors ---

describe("AC-36: curated suggestions", () => {
  it("returns suggestions for camera / director-of-photography", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.triggerTag.sectorSlug === "camera")).toBe(true)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).toContain("drone-operation")
    expect(slugs).toContain("steadicam")
    expect(slugs).toContain("lighting-camera")
  })

  it("returns suggestions for camera / camera-operator", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "camera-operator" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeGreaterThan(0)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).toContain("drone-operation")
    expect(slugs).toContain("jimmy-jib")
  })

  it("returns suggestions for post-production / offline-editor", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "post-production", serviceAreaSlug: "offline-editor" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeGreaterThan(0)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).toContain("online-editing")
    expect(slugs).toContain("colour-grading")
  })

  it("returns suggestions for post-production / colourist", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "post-production", serviceAreaSlug: "colourist" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeGreaterThan(0)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).toContain("online-editing")
    expect(slugs).toContain("hdr-mastering")
  })

  it("returns suggestions for sound / sound-recordist", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "sound", serviceAreaSlug: "sound-recordist" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeGreaterThan(0)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).toContain("boom-operator")
    expect(slugs).toContain("sound-mixer")
  })

  it("returns empty for an uncurated sector", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "lighting", serviceAreaSlug: "gaffer" },
    ]
    expect(getSuggestions(tags)).toEqual([])
  })

  it("returns empty for an uncurated service area within a curated sector", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "unknown-service-area" },
    ]
    expect(getSuggestions(tags)).toEqual([])
  })

  it("caps results at 5", () => {
    // Both camera triggers produce 6 unique suggestions total
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
      { sectorSlug: "camera", serviceAreaSlug: "camera-operator" },
    ]
    const results = getSuggestions(tags)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it("deduplicates drone-operation across DP and camera-operator triggers", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
      { sectorSlug: "camera", serviceAreaSlug: "camera-operator" },
    ]
    const results = getSuggestions(tags)
    const droneResults = results.filter((r) => r.specialisationSlug === "drone-operation")
    expect(droneResults.length).toBe(1)
  })

  it("sorts by confidence descending", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
      { sectorSlug: "post-production", serviceAreaSlug: "offline-editor" },
    ]
    const results = getSuggestions(tags)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].confidence).toBeLessThanOrEqual(results[i - 1].confidence)
    }
  })

  it("covers all 3 curated sectors in SUGGESTION_MAP", () => {
    const sectors = new Set(SUGGESTION_MAP.map((r) => r.trigger.sectorSlug))
    expect(sectors).toEqual(new Set(["camera", "post-production", "sound"]))
  })
})

// --- AC-37: Suggestions exclude already-selected tags ---

describe("AC-37: exclude already-selected tags", () => {
  it("excludes a specialisation already in selectedTags", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography", specialisationSlug: "drone-operation" },
    ]
    const results = getSuggestions(tags)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).not.toContain("drone-operation")
  })

  it("excludes multiple already-selected specialisations", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography", specialisationSlug: "drone-operation" },
      { sectorSlug: "camera", serviceAreaSlug: "director-of-photography", specialisationSlug: "steadicam" },
    ]
    const results = getSuggestions(tags)
    const slugs = results.map((r) => r.specialisationSlug)
    expect(slugs).not.toContain("drone-operation")
    expect(slugs).not.toContain("steadicam")
  })

  it("returns empty when all curated suggestions are already selected", () => {
    const tags: TaxonomyTag[] = [
      { sectorSlug: "sound", serviceAreaSlug: "sound-recordist", specialisationSlug: "boom-operator" },
      { sectorSlug: "sound", serviceAreaSlug: "sound-recordist", specialisationSlug: "sound-mixer" },
    ]
    const results = getSuggestions(tags)
    expect(results).toEqual([])
  })
})
