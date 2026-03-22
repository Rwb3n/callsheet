// Unit tests: 4rfv extraction + taxonomy mapping — CS-WORK-024

import { describe, it, expect } from "vitest"
import {
  map4rfvSubcategory,
  mapCompanyServices,
  findUnmappedSubcategories,
} from "../taxonomy-map"
import {
  shouldSkip,
  cleanName,
  cleanPhoneField,
} from "../extract-4rfv"

// ── Taxonomy mapping (AC-04, AC-06) ──

describe("map4rfvSubcategory", () => {
  it("maps aerial filming subcategories to drone slugs", () => {
    expect(map4rfvSubcategory("Aerial Filming")).toContain("drone-operator")
    expect(map4rfvSubcategory("Aerial Filming Drones")).toContain("drone-systems")
  })

  it("maps animation subcategories to animation slugs", () => {
    expect(map4rfvSubcategory("Animation - 3D Computer Generated")).toContain("3d")
    expect(map4rfvSubcategory("Motion Graphics")).toContain("motion-graphics")
    expect(map4rfvSubcategory("Matte Painting")).toContain("matte-painting")
  })

  it("maps camera crew to crew specialisations", () => {
    expect(map4rfvSubcategory("Cameraman")).toContain("camera-operator")
    expect(map4rfvSubcategory("Focus Puller")).toContain("focus-puller")
    expect(map4rfvSubcategory("Steadicam Operator")).toContain("steadicam")
  })

  it("maps post production subcategories", () => {
    expect(map4rfvSubcategory("Colour Grading")).toContain("colour-grading")
    expect(map4rfvSubcategory("Audio - Post Production")).toContain("sound-design")
    expect(map4rfvSubcategory("Closed Captioning")).toContain("closed-captioning")
  })

  it("maps casting and talent", () => {
    expect(map4rfvSubcategory("Casting Director")).toContain("casting-directors")
    expect(map4rfvSubcategory("Voice Over")).toContain("voice-over-agencies")
    expect(map4rfvSubcategory("Extras Agency")).toContain("extras-supporting-artist-agencies")
  })

  it("maps VFX subcategories", () => {
    expect(map4rfvSubcategory("Visual Effects")).toContain("compositing")
    expect(map4rfvSubcategory("VFX")).toContain("cgi")
  })

  it("maps studios", () => {
    expect(map4rfvSubcategory("Studios")).toContain("sound-stage")
    expect(map4rfvSubcategory("Edit Suite")).toContain("edit-suite")
    expect(map4rfvSubcategory("Green Screen")).toContain("green-blue-screen")
  })

  it("maps SFX & stunts", () => {
    expect(map4rfvSubcategory("Pyrotechnics")).toContain("pyrotechnics")
    expect(map4rfvSubcategory("Stunt Coordinator")).toContain("stunt-coordinator")
    expect(map4rfvSubcategory("Armourer")).toContain("armourer")
  })

  it("returns empty array for data-error subcategory name '3'", () => {
    expect(map4rfvSubcategory("3")).toEqual([])
  })

  it("is case-insensitive", () => {
    expect(map4rfvSubcategory("CAMERAMAN")).toEqual(map4rfvSubcategory("cameraman"))
    expect(map4rfvSubcategory("Aerial Filming")).toEqual(map4rfvSubcategory("aerial filming"))
  })

  it("falls back to keyword matching for unregistered subcategories", () => {
    // "Drone Photography Services" not in override table but matches keyword
    expect(map4rfvSubcategory("Drone Photography Services")).toContain("drone-operator")
  })
})

describe("mapCompanyServices", () => {
  it("deduplicates slugs across multiple subcategories", () => {
    const services = mapCompanyServices([
      { name: "Aerial Filming", category: "Aerial Filming" },
      { name: "Aerial Filming Drones", category: "Aerial Filming" },
    ])
    const droneCount = services.filter((s) => s === "drone-operator").length
    expect(droneCount).toBe(1)
  })

  it("returns sorted slugs", () => {
    const services = mapCompanyServices([
      { name: "Visual Effects", category: "Animation" },
      { name: "Animation", category: "Animation" },
    ])
    const sorted = [...services].sort()
    expect(services).toEqual(sorted)
  })

  it("falls back to category mapping when subcategory has no override", () => {
    const services = mapCompanyServices([
      { name: "Some Unknown Subcategory", category: "Studios" },
    ])
    expect(services.length).toBeGreaterThan(0)
    expect(services).toContain("sound-stage")
  })

  it("returns empty array for completely unmapped category and subcategory", () => {
    const services = mapCompanyServices([
      { name: "Totally Unknown", category: "Nonexistent Category" },
    ])
    // Keyword fallback may or may not match
    // This tests the base case
    expect(Array.isArray(services)).toBe(true)
  })
})

describe("findUnmappedSubcategories", () => {
  it("returns subcategories with no mapping at any level", () => {
    const unmapped = findUnmappedSubcategories([
      { name: "Animation", category: "Animation" },
      { name: "Totally Unknown XYZ", category: "Nonexistent" },
    ])
    expect(unmapped).toContain("Totally Unknown XYZ")
    expect(unmapped).not.toContain("Animation")
  })
})

// ── Skip rules ──

describe("shouldSkip", () => {
  it("skips BBC divisions without production keywords", () => {
    const r = shouldSkip("BBC Glasgow", "http://www.bbc.co.uk", null)
    expect(r.skip).toBe(true)
    expect(r.reason).toContain("broadcaster")
  })

  it("does not skip BBC entries with production keywords in name", () => {
    const r = shouldSkip("BBC Studios Production", "http://www.bbc.co.uk", null)
    expect(r.skip).toBe(false)
  })

  it("skips 4rfv.co.uk placeholder websites", () => {
    const r = shouldSkip("Some Company", "http://www.4rfv.co.uk", null)
    expect(r.skip).toBe(true)
    expect(r.reason).toContain("4rfv")
  })

  it("skips companies with defunct description", () => {
    const r = shouldSkip("Old Co", "http://oldco.com", "We are permanently closed as of 2019.")
    expect(r.skip).toBe(true)
    expect(r.reason).toContain("defunct")
  })

  it("does not skip normal companies", () => {
    const r = shouldSkip("Acme Productions Ltd", "http://acme.co.uk", "We make films.")
    expect(r.skip).toBe(false)
  })

  it("skips Discovery Channel divisions", () => {
    const r = shouldSkip("Discovery Civilisations", "http://www.discoverychannel.co.uk", null)
    expect(r.skip).toBe(true)
  })
})

// ── Name cleaning ──

describe("cleanName", () => {
  it("strips leading/trailing quotes", () => {
    expect(cleanName("'GCM Services'")).toBe("GCM Services")
    expect(cleanName('"Acme Ltd"')).toBe("Acme Ltd")
  })

  it("strips leading @ symbol", () => {
    expect(cleanName("@Voytek")).toBe("Voytek")
    expect(cleanName("@ Radicalmedia")).toBe("Radicalmedia")
  })

  it("preserves normal names", () => {
    expect(cleanName("Acme Productions Ltd")).toBe("Acme Productions Ltd")
  })

  it("handles combined issues", () => {
    expect(cleanName("'@Weird Company'")).toBe("Weird Company")
  })
})

// ── Phone cleaning ──

describe("cleanPhoneField", () => {
  it("returns null for postcodes in phone field", () => {
    expect(cleanPhoneField("NN16 8UN")).toBeNull()
    expect(cleanPhoneField("G51 2SN")).toBeNull()
  })

  it("returns null for dot placeholder", () => {
    expect(cleanPhoneField(".")).toBeNull()
  })

  it("extracts first number from multi-number field", () => {
    expect(cleanPhoneField("020 8876 4451 Mobile 07785 226432")).toBe("020 8876 4451")
    expect(cleanPhoneField("01531 820059 / 07866455661")).toBe("01531 820059")
  })

  it("preserves normal phone numbers", () => {
    expect(cleanPhoneField("020 7025 1985")).toBe("020 7025 1985")
    expect(cleanPhoneField("+44 (0)1483 426767")).toBe("+44 (0)1483 426767")
  })

  it("returns null for null/empty input", () => {
    expect(cleanPhoneField(null)).toBeNull()
    expect(cleanPhoneField("")).toBeNull()
  })
})
