// AC-40: Variant URLs follow deterministic naming convention

import { describe, it, expect } from "vitest"
import { variantKey, parseOriginalKey, VARIANT_SIZES, VARIANTS } from "../naming"

describe("variantKey", () => {
  const listingId = "aaaa-bbbb-cccc"
  const imageId = "dddd-eeee-ffff"

  it("produces correct thumbnail key", () => {
    expect(variantKey(listingId, imageId, "thumbnail")).toBe(
      `listings/${listingId}/images/${imageId}_thumbnail.webp`,
    )
  })

  it("produces correct card key", () => {
    expect(variantKey(listingId, imageId, "card")).toBe(
      `listings/${listingId}/images/${imageId}_card.webp`,
    )
  })

  it("produces correct full key", () => {
    expect(variantKey(listingId, imageId, "full")).toBe(
      `listings/${listingId}/images/${imageId}_full.webp`,
    )
  })

  it("all variants produce .webp extension", () => {
    for (const v of VARIANTS) {
      expect(variantKey(listingId, imageId, v)).toMatch(/\.webp$/)
    }
  })
})

describe("parseOriginalKey", () => {
  it("extracts listingId, imageId, and ext from valid key", () => {
    const result = parseOriginalKey("listings/abc-123/images/img-456.jpeg")
    expect(result).toEqual({
      listingId: "abc-123",
      imageId: "img-456",
      ext: "jpeg",
    })
  })

  it("handles png extension", () => {
    const result = parseOriginalKey("listings/abc/images/img.png")
    expect(result).toEqual({ listingId: "abc", imageId: "img", ext: "png" })
  })

  it("handles webp extension", () => {
    const result = parseOriginalKey("listings/abc/images/img.webp")
    expect(result).toEqual({ listingId: "abc", imageId: "img", ext: "webp" })
  })

  it("throws on invalid key format", () => {
    expect(() => parseOriginalKey("invalid/key")).toThrow("Invalid original key format")
  })

  it("throws on key with variant suffix", () => {
    // Variant keys have underscores before the extension — should not parse as original
    expect(() => parseOriginalKey("listings/abc/images/img_thumbnail.webp")).toThrow()
  })
})

describe("VARIANT_SIZES", () => {
  it("defines 3 sizes", () => {
    expect(Object.keys(VARIANT_SIZES)).toHaveLength(3)
  })

  it("thumbnail is 150px", () => {
    expect(VARIANT_SIZES.thumbnail).toBe(150)
  })

  it("card is 400px", () => {
    expect(VARIANT_SIZES.card).toBe(400)
  })

  it("full is 1200px", () => {
    expect(VARIANT_SIZES.full).toBe(1200)
  })
})

describe("round-trip: parseOriginalKey → variantKey", () => {
  it("produces correct variant keys from parsed original", () => {
    const original = "listings/list-001/images/img-001.jpeg"
    const { listingId, imageId } = parseOriginalKey(original)
    expect(variantKey(listingId, imageId, "card")).toBe(
      "listings/list-001/images/img-001_card.webp",
    )
  })
})
