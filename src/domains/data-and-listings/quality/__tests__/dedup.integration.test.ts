// Profile view deduplication integration test — AC-11
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, createTestListing, makeUUID } from "@/db/test-fixtures"
import { engagements } from "@/db/schema/data-and-listings"
import { deduplicateProfileView } from "../dedup"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = makeUUID("dedup-owner")
const VIEWER_ID = makeUUID("dedup-viewer")

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, VIEWER_ID, "viewer@example.com")
})

afterAll(async () => {
  await closeTestDb()
})

describe("deduplicateProfileView", () => {
  it("AC-11: same viewer + same listing within 1 hour = 1 count", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const now = new Date()

    // First view — should increment
    const first = await deduplicateProfileView(db, listing.id, VIEWER_ID, now)
    expect(first).toBe(true)

    // Same viewer within 1 hour — should NOT increment
    const thirtyMinLater = new Date(now.getTime() + 30 * 60 * 1000)
    const second = await deduplicateProfileView(db, listing.id, VIEWER_ID, thirtyMinLater)
    expect(second).toBe(false)

    // Check engagement counter
    const [eng] = await db
      .select({ profileViews: engagements.profileViews })
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))

    expect(eng.profileViews).toBe(1)
  })

  it("AC-11: same viewer after 1 hour = new count", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const now = new Date()

    const first = await deduplicateProfileView(db, listing.id, VIEWER_ID, now)
    expect(first).toBe(true)

    // Same viewer AFTER 1 hour — should increment
    const seventyMinLater = new Date(now.getTime() + 70 * 60 * 1000)
    const second = await deduplicateProfileView(db, listing.id, VIEWER_ID, seventyMinLater)
    expect(second).toBe(true)

    const [eng] = await db
      .select({ profileViews: engagements.profileViews })
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))

    expect(eng.profileViews).toBe(2)
  })

  it("different viewers within 1 hour = separate counts", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const now = new Date()
    const otherViewer = makeUUID("dedup-view2")
    await seedTestUser(db, otherViewer, "other-viewer@example.com")

    await deduplicateProfileView(db, listing.id, VIEWER_ID, now)
    await deduplicateProfileView(db, listing.id, otherViewer, now)

    const [eng] = await db
      .select({ profileViews: engagements.profileViews })
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))

    // First viewer increments, then second viewer updates lastViewerAccountId
    // to otherViewer, so counter = 2
    expect(eng.profileViews).toBe(2)
  })

  it("anonymous viewers always counted (no dedup)", async () => {
    const listing = await createTestListing(db, ACCOUNT_ID)
    const now = new Date()

    const first = await deduplicateProfileView(db, listing.id, null, now)
    expect(first).toBe(true)

    const second = await deduplicateProfileView(db, listing.id, null, now)
    expect(second).toBe(true)

    const [eng] = await db
      .select({ profileViews: engagements.profileViews })
      .from(engagements)
      .where(eq(engagements.listingId, listing.id))

    expect(eng.profileViews).toBe(2)
  })
})
