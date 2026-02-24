// Object storage tests — AC-30 through AC-34

import { describe, it, expect } from "vitest"
import { InMemoryObjectStorageService, validateUpload } from "../r2"
import { MAX_UPLOAD_SIZE_BYTES } from "../types"

describe("Object Storage", () => {
  // AC-30: Public upload returns URL; private returns null
  it("public upload returns URL", async () => {
    const storage = new InMemoryObjectStorageService()
    const result = await storage.upload({
      key: "listings/123/images/hero.jpg",
      data: Buffer.from("image-data"),
      contentType: "image/jpeg",
      maxSizeBytes: 1024,
      access: "public",
    })
    expect(result.url).toBe("https://cdn.callsheet.test/listings/123/images/hero.jpg")
  })

  it("private upload returns null", async () => {
    const storage = new InMemoryObjectStorageService()
    const result = await storage.upload({
      key: "claims/456/evidence/doc.jpg",
      data: Buffer.from("evidence-data"),
      contentType: "image/jpeg",
      maxSizeBytes: 2048,
      access: "private",
    })
    expect(result.url).toBeNull()
  })

  // AC-31: getSignedUrl returns time-limited URL
  it("getSignedUrl returns time-limited URL for private object", async () => {
    const storage = new InMemoryObjectStorageService()
    await storage.upload({
      key: "claims/456/evidence/doc.jpg",
      data: Buffer.from("evidence"),
      contentType: "image/jpeg",
      maxSizeBytes: 1024,
      access: "private",
    })

    const url = await storage.getSignedUrl("claims/456/evidence/doc.jpg", 3600)
    expect(url).toContain("claims/456/evidence/doc.jpg")
    expect(url).toContain("token=")
    expect(url).toContain("expires=3600")
  })

  // AC-32: deleteByPrefix removes all matching objects
  it("deleteByPrefix removes all matching objects", async () => {
    const storage = new InMemoryObjectStorageService()
    await storage.upload({ key: "listings/123/images/a.jpg", data: Buffer.from("a"), contentType: "image/jpeg", maxSizeBytes: 100, access: "public" })
    await storage.upload({ key: "listings/123/images/b.png", data: Buffer.from("b"), contentType: "image/png", maxSizeBytes: 100, access: "public" })
    await storage.upload({ key: "listings/999/images/c.jpg", data: Buffer.from("c"), contentType: "image/jpeg", maxSizeBytes: 100, access: "public" })

    const result = await storage.deleteByPrefix("listings/123/")
    expect(result.deleted).toBe(2)

    const remaining = storage.getStoredKeys()
    expect(remaining).toEqual(["listings/999/images/c.jpg"])
  })

  // AC-33: >10MB upload rejected
  it("rejects upload exceeding 10MB", () => {
    expect(() => validateUpload("image/jpeg", MAX_UPLOAD_SIZE_BYTES + 1, MAX_UPLOAD_SIZE_BYTES))
      .toThrow(`Upload size ${MAX_UPLOAD_SIZE_BYTES + 1} exceeds limit of ${MAX_UPLOAD_SIZE_BYTES} bytes`)
  })

  it("accepts upload at exactly 10MB", () => {
    expect(() => validateUpload("image/jpeg", MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_BYTES)).not.toThrow()
  })

  // AC-34: Disallowed content type rejected
  it("rejects disallowed content type", () => {
    expect(() => validateUpload("image/svg+xml", 100, 1024)).toThrow("Disallowed content type: image/svg+xml")
  })

  it("rejects application/pdf content type", () => {
    expect(() => validateUpload("application/pdf", 100, 1024)).toThrow("Disallowed content type: application/pdf")
  })

  it("accepts allowed content types", () => {
    expect(() => validateUpload("image/jpeg", 100, 1024)).not.toThrow()
    expect(() => validateUpload("image/png", 100, 1024)).not.toThrow()
    expect(() => validateUpload("image/webp", 100, 1024)).not.toThrow()
  })
})
