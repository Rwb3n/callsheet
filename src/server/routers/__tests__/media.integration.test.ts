// AC-23 through AC-26: Media upload pipeline integration tests
// AC-39/AC-41/AC-50: Image variant generation (S2 §4.3)
// Tests call media router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createTestListing, seedUsers, makeSession, ctx } from "@/db/test-fixtures"
import { listings, mediaItems } from "@/db/schema/data-and-listings"
import { InMemoryObjectStorageService } from "@/lib/storage/r2"
import type { AuthSession } from "@/lib/auth"
import { createMediaRouter } from "../media"
import { processListingImage } from "@/lib/image-processing/variants"
import type { ImageProcessor } from "@/lib/image-processing/variants"

const TEST_JPEG = readFileSync(
  join(__dirname, "../../..", "lib/image-processing/__tests__/fixtures/test-100x100.jpg"),
)

let db: ReturnType<typeof getTestDb>
let storage: InMemoryObjectStorageService

const ACCOUNT_ID = "test-account-media"
const OTHER_ACCOUNT = "test-account-media-other"

const userSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })

function mediaCaller(session: AuthSession, processImage?: ImageProcessor) {
  const mediaRouter = createMediaRouter({ db, storage, processImage })
  return mediaRouter.createCaller(ctx(session))
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  storage = new InMemoryObjectStorageService()
  await seedUsers(db, [
    { id: ACCOUNT_ID, name: "Media User", email: "media@example.com" },
    { id: OTHER_ACCOUNT, name: "Other User", email: "other@example.com" },
  ])
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-23: uploadImage verifies ownership, checks tier limit, uploads to R2, returns public URL ---

describe("media.uploadImage", () => {
  it("uploads image for owned listing and returns public URL", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const result = await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: Buffer.from("fake-jpeg-data"),
    })

    expect(result.url).toContain("cdn.callsheet.test")
    expect(result.url).toContain(listing.id)
    expect(result.mediaItem.listingId).toBe(listing.id)
    expect(result.mediaItem.type).toBe("portfolio")

    // Verify R2 received the file
    const keys = storage.getStoredKeys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(new RegExp(`listings/${listing.id}/images/.+\\.jpeg`))
  })

  it("rejects upload from non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(otherSession)

    await expect(
      caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "image/jpeg",
        data: Buffer.from("fake"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("rejects upload when tier media limit reached", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    // Fill up to free tier limit (5)
    for (let i = 0; i < 5; i++) {
      await caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "image/jpeg",
        data: Buffer.from(`fake-${i}`),
      })
    }

    // 6th should fail
    await expect(
      caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "image/jpeg",
        data: Buffer.from("one-too-many"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("allows more media on higher tier", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID, { subscriptionTier: "standard" })
    const caller = mediaCaller(userSession)

    // Upload 6 — exceeds free (5) but within standard (20)
    for (let i = 0; i < 6; i++) {
      await caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "image/jpeg",
        data: Buffer.from(`fake-${i}`),
      })
    }

    const items = await db.select().from(mediaItems).where(eq(mediaItems.listingId, listing.id))
    expect(items).toHaveLength(6)
  })

  it("rejects disallowed content type via Zod", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    await expect(
      caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "application/pdf" as "image/jpeg",
        data: Buffer.from("pdf-data"),
      }),
    ).rejects.toBeDefined()
  })

  it("rejects upload exceeding 10MB size limit", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1) // 10MB + 1 byte
    await expect(
      caller.uploadImage({
        listingId: listing.id,
        type: "portfolio",
        contentType: "image/jpeg",
        data: oversized,
      }),
    ).rejects.toBeDefined()
  })
})

// --- AC-24: deleteImage removes from R2 and DB ---

describe("media.deleteImage", () => {
  it("removes media from R2 and database", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const { mediaItem } = await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: Buffer.from("to-delete"),
    })

    await caller.deleteImage({ mediaItemId: mediaItem.id })

    const remaining = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItem.id))
    expect(remaining).toHaveLength(0)
    expect(storage.getStoredKeys()).toHaveLength(0)
  })

  it("rejects delete from non-owner with FORBIDDEN", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const ownerCaller = mediaCaller(userSession)

    const { mediaItem } = await ownerCaller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: Buffer.from("owned"),
    })

    const otherCaller = mediaCaller(otherSession)
    await expect(
      otherCaller.deleteImage({ mediaItemId: mediaItem.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("returns NOT_FOUND for nonexistent media item", async () => {
    const caller = mediaCaller(userSession)
    await expect(
      caller.deleteImage({ mediaItemId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

// --- AC-25: logo/headshot sync ---

describe("media logo/headshot sync", () => {
  it("updates listing.logoUrl on logo upload", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    await caller.uploadImage({
      listingId: listing.id,
      type: "logo",
      contentType: "image/png",
      data: Buffer.from("logo-data"),
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.logoUrl).toBeTruthy()
  })

  it("updates listing.headshotUrl on headshot upload", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    await caller.uploadImage({
      listingId: listing.id,
      type: "headshot",
      contentType: "image/jpeg",
      data: Buffer.from("headshot-data"),
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.headshotUrl).toBeTruthy()
  })

  it("nulls logoUrl when logo media item is deleted", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const { mediaItem } = await caller.uploadImage({
      listingId: listing.id,
      type: "logo",
      contentType: "image/png",
      data: Buffer.from("logo"),
    })

    await caller.deleteImage({ mediaItemId: mediaItem.id })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.logoUrl).toBeNull()
  })

  it("nulls headshotUrl when headshot media item is deleted", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const { mediaItem } = await caller.uploadImage({
      listingId: listing.id,
      type: "headshot",
      contentType: "image/jpeg",
      data: Buffer.from("headshot"),
    })

    await caller.deleteImage({ mediaItemId: mediaItem.id })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.headshotUrl).toBeNull()
  })
})

// --- AC-26: reorderImages ---

describe("media.reorderImages", () => {
  it("updates sortOrder for all items", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession)

    const { mediaItem: item1 } = await caller.uploadImage({
      listingId: listing.id, type: "portfolio", contentType: "image/jpeg", data: Buffer.from("a"),
    })
    const { mediaItem: item2 } = await caller.uploadImage({
      listingId: listing.id, type: "portfolio", contentType: "image/jpeg", data: Buffer.from("b"),
    })

    // Reverse order
    await caller.reorderImages({
      listingId: listing.id,
      mediaItemIds: [item2.id, item1.id],
    })

    const items = await db.select().from(mediaItems)
      .where(eq(mediaItems.listingId, listing.id))
      .orderBy(mediaItems.sortOrder)

    expect(items[0].id).toBe(item2.id)
    expect(items[0].sortOrder).toBe(0)
    expect(items[1].id).toBe(item1.id)
    expect(items[1].sortOrder).toBe(1)
  })
})

// --- AC-39/AC-41/AC-50: Image variant generation via processImage ---

describe("media.uploadImage with variant generation", () => {
  it("returns card variant URL when processImage succeeds (AC-39)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession, processListingImage)

    const result = await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: TEST_JPEG,
    })

    // URL should be the card variant, not the original
    expect(result.url).toContain("_card.webp")
    expect(result.mediaItem.url).toContain("_card.webp")

    // R2 should have 4 objects: original + 3 variants
    const keys = storage.getStoredKeys()
    expect(keys).toHaveLength(4)
    expect(keys.some((k) => k.endsWith(".jpeg"))).toBe(true)
    expect(keys.some((k) => k.includes("_thumbnail.webp"))).toBe(true)
    expect(keys.some((k) => k.includes("_card.webp"))).toBe(true)
    expect(keys.some((k) => k.includes("_full.webp"))).toBe(true)
  })

  it("updates media_items.url to card variant in DB (AC-39)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession, processListingImage)

    const { mediaItem } = await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: TEST_JPEG,
    })

    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItem.id))
    expect(row.url).toContain("_card.webp")
  })

  it("preserves original in R2 for admin access (AC-41)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession, processListingImage)

    await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: TEST_JPEG,
    })

    const originals = storage.getStoredKeys().filter((k) => k.endsWith(".jpeg"))
    expect(originals).toHaveLength(1)
    const buf = await storage.download(originals[0])
    expect(buf).toEqual(TEST_JPEG)
  })

  it("falls back to original URL when processImage fails (AC-50)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    // Inject a processImage that always fails
    const failingProcessor: ImageProcessor = async () => null
    const caller = mediaCaller(userSession, failingProcessor)

    const result = await caller.uploadImage({
      listingId: listing.id,
      type: "portfolio",
      contentType: "image/jpeg",
      data: Buffer.from("fake-data"),
    })

    // Should return original URL (no _card.webp)
    expect(result.url).not.toContain("_card.webp")
    expect(result.url).toContain(".jpeg")

    // Only original in storage
    expect(storage.getStoredKeys()).toHaveLength(1)
  })

  it("updates listing.logoUrl to card variant on logo upload", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession, processListingImage)

    await caller.uploadImage({
      listingId: listing.id,
      type: "logo",
      contentType: "image/jpeg",
      data: TEST_JPEG,
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.logoUrl).toContain("_card.webp")
  })

  it("updates listing.headshotUrl to card variant on headshot upload", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const caller = mediaCaller(userSession, processListingImage)

    await caller.uploadImage({
      listingId: listing.id,
      type: "headshot",
      contentType: "image/jpeg",
      data: TEST_JPEG,
    })

    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id))
    expect(updated.headshotUrl).toContain("_card.webp")
  })
})
