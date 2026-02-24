// CS-WORK-019: Generic taxonomy suggestions integration test — AC-38

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTaxonomy, seedUsers, createTestListing } from "@/db/test-fixtures"
import { listingTaxonomyTags, taxonomyServiceAreas } from "@/db/schema/data-and-listings"
import { getGenericSuggestions } from "../suggestions"

let db: ReturnType<typeof getTestDb>

const USER_ID = "suggest-user-001"

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedUsers(db, [{ id: USER_ID, name: "Suggester", email: "suggest@test.com" }])
})

afterAll(async () => {
  await closeTestDb()
})

async function createListingWithTag(sectorId: number, serviceAreaId: number) {
  const listing = await createTestListing(db, USER_ID)
  await db.insert(listingTaxonomyTags).values({
    listingId: listing.id,
    sectorId,
    serviceAreaId,
  })
  return listing.id
}

describe("AC-38: generic fallback suggestions", () => {
  it("returns top 5 service areas by listing count within sector", async () => {
    const { camera, cinematography, cameraOp } = await seedTaxonomy(db)

    // 3 listings tagged to cinematography, 1 to camera-op
    await createListingWithTag(camera.id, cinematography.id)
    await createListingWithTag(camera.id, cinematography.id)
    await createListingWithTag(camera.id, cinematography.id)
    await createListingWithTag(camera.id, cameraOp.id)

    const results = await getGenericSuggestions(db, camera.id)

    expect(results).toHaveLength(2)
    expect(results[0].serviceAreaSlug).toBe("cinematography")
    expect(results[0].listingCount).toBe(3)
    expect(results[1].serviceAreaSlug).toBe("camera-op")
    expect(results[1].listingCount).toBe(1)
  })

  it("returns empty when no listings exist for the sector", async () => {
    const { camera } = await seedTaxonomy(db)

    const results = await getGenericSuggestions(db, camera.id)
    expect(results).toEqual([])
  })

  it("limits to 5 results even when more service areas exist", async () => {
    const { sound } = await seedTaxonomy(db)

    // Create 6 distinct service areas under sound
    const saIds: number[] = []
    for (let i = 0; i < 6; i++) {
      const [sa] = await db
        .insert(taxonomyServiceAreas)
        .values({
          sectorId: sound.id,
          name: `Sound Area ${i}`,
          slug: `sound-area-${i}`,
          sortOrder: i + 10,
        })
        .returning({ id: taxonomyServiceAreas.id })
      saIds.push(sa.id)
    }

    for (const saId of saIds) {
      await createListingWithTag(sound.id, saId)
    }

    const results = await getGenericSuggestions(db, sound.id)
    expect(results).toHaveLength(5)
  })

  it("does not include listings from other sectors", async () => {
    const { camera, cinematography, sound, soundRecording } = await seedTaxonomy(db)

    await createListingWithTag(camera.id, cinematography.id)
    await createListingWithTag(camera.id, cinematography.id)
    await createListingWithTag(sound.id, soundRecording.id)

    const cameraResults = await getGenericSuggestions(db, camera.id)
    expect(cameraResults).toHaveLength(1)
    expect(cameraResults[0].serviceAreaSlug).toBe("cinematography")
    expect(cameraResults[0].listingCount).toBe(2)

    const soundResults = await getGenericSuggestions(db, sound.id)
    expect(soundResults).toHaveLength(1)
    expect(soundResults[0].serviceAreaSlug).toBe("sound-recording")
    expect(soundResults[0].listingCount).toBe(1)
  })
})
