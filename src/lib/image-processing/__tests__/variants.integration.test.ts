// AC-39: 3 WebP variants (150px, 400px, 1200px)
// AC-41: Original image preserved in R2 for admin access
// AC-50: Variant generation failure falls back to null; original preserved

import { describe, it, expect, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { InMemoryObjectStorageService } from "@/lib/storage/r2"
import { processListingImage } from "../variants"
import { VARIANT_SIZES, VARIANTS } from "../naming"

const FIXTURE_PATH = join(__dirname, "fixtures", "test-100x100.jpg")
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH)

const LISTING_ID = "list-001"
const IMAGE_ID = "img-001"
const ORIGINAL_KEY = `listings/${LISTING_ID}/images/${IMAGE_ID}.jpeg`

let storage: InMemoryObjectStorageService

beforeEach(() => {
  storage = new InMemoryObjectStorageService()
})

async function seedOriginal(): Promise<void> {
  await storage.upload({
    key: ORIGINAL_KEY,
    data: FIXTURE_BUFFER,
    contentType: "image/jpeg",
    maxSizeBytes: 10 * 1024 * 1024,
    access: "public",
  })
}

describe("processListingImage", () => {
  // AC-39: generates 3 WebP variants at correct widths
  it("generates 3 WebP variants at 150px, 400px, 1200px", async () => {
    await seedOriginal()

    const result = await processListingImage(ORIGINAL_KEY, storage)
    expect(result).not.toBeNull()

    // Verify 3 variant keys in storage (+ 1 original = 4 total)
    const keys = storage.getStoredKeys()
    expect(keys).toHaveLength(4)

    // Verify each variant is a valid WebP with correct width
    for (const variant of VARIANTS) {
      const varKey = `listings/${LISTING_ID}/images/${IMAGE_ID}_${variant}.webp`
      expect(keys).toContain(varKey)

      const buf = await storage.download(varKey)
      const meta = await sharp(buf).metadata()
      expect(meta.format).toBe("webp")
      // withoutEnlargement: fixture is 100px, so thumbnail (150) and card (400) and full (1200) cap at 100
      const expectedWidth = Math.min(VARIANT_SIZES[variant], 100)
      expect(meta.width).toBe(expectedWidth)
    }
  })

  it("returns correct URLs for all 3 variants", async () => {
    await seedOriginal()

    const result = await processListingImage(ORIGINAL_KEY, storage)
    expect(result).not.toBeNull()
    expect(result!.thumbnailUrl).toContain(`${IMAGE_ID}_thumbnail.webp`)
    expect(result!.cardUrl).toContain(`${IMAGE_ID}_card.webp`)
    expect(result!.fullUrl).toContain(`${IMAGE_ID}_full.webp`)
  })

  // AC-41: original image preserved in R2 for admin access
  it("preserves original image in R2 after variant generation", async () => {
    await seedOriginal()

    await processListingImage(ORIGINAL_KEY, storage)

    // Original still accessible
    const original = await storage.download(ORIGINAL_KEY)
    expect(original).toEqual(FIXTURE_BUFFER)
  })

  // AC-50: failure fallback — corrupt buffer
  it("returns null on corrupt image input without throwing", async () => {
    await storage.upload({
      key: ORIGINAL_KEY,
      data: Buffer.from("not-a-real-image"),
      contentType: "image/jpeg",
      maxSizeBytes: 10 * 1024 * 1024,
      access: "public",
    })

    // Should not throw — returns null
    const result = await processListingImage(ORIGINAL_KEY, storage)
    expect(result).toBeNull()
  })

  // AC-50: original preserved on failure
  it("preserves original in R2 on variant generation failure", async () => {
    const corruptData = Buffer.from("not-a-real-image")
    await storage.upload({
      key: ORIGINAL_KEY,
      data: corruptData,
      contentType: "image/jpeg",
      maxSizeBytes: 10 * 1024 * 1024,
      access: "public",
    })

    await processListingImage(ORIGINAL_KEY, storage)

    // Original still accessible
    const original = await storage.download(ORIGINAL_KEY)
    expect(original).toEqual(corruptData)
  })
})
