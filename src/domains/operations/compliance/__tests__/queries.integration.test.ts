// Compliance query interface integration tests — CS-WORK-060
// AC-5.1: checkComplianceHold returns correct hold status
// AC-5.2: getDSARStatus returns open DSARs, approaching deadlines, recent erasures
// AC-5.8: only dsar, complaint, investigation with status = 'open' create holds
// AC-5.9: billing holds NOT checked by checkComplianceHold

import { describe, it, expect, beforeEach } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, makeUUID } from "@/db/test-fixtures"
import { complianceRegister, billingHolds } from "@/db/schema/operations"
import { checkComplianceHold, getDSARStatus } from "../queries"

const db = getTestDb()
const USER_ID = makeUUID("user001")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, USER_ID)
})

describe("checkComplianceHold", () => {
  it("AC-5.1: returns holdExists: true with holdType: open_dsar when an open DSAR exists", async () => {
    await db.insert(complianceRegister).values({
      type: "dsar",
      accountId: USER_ID,
      status: "open",
      receivedAt: new Date(),
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    })

    const result = await checkComplianceHold(db, USER_ID)

    expect(result.holdExists).toBe(true)
    expect(result.holdType).toBe("open_dsar")
    expect(result.reason).toContain("dsar")
  })

  it("AC-5.1: returns holdExists: false when no open compliance entries exist", async () => {
    const result = await checkComplianceHold(db, USER_ID)

    expect(result.holdExists).toBe(false)
    expect(result.holdType).toBeUndefined()
    expect(result.reason).toBeUndefined()
  })

  it("AC-5.8: complaint with status = open creates hold", async () => {
    await db.insert(complianceRegister).values({
      type: "complaint",
      accountId: USER_ID,
      status: "open",
    })

    const result = await checkComplianceHold(db, USER_ID)

    expect(result.holdExists).toBe(true)
    expect(result.holdType).toBe("pending_complaint")
  })

  it("AC-5.8: investigation with status = open creates hold", async () => {
    await db.insert(complianceRegister).values({
      type: "investigation",
      accountId: USER_ID,
      status: "open",
    })

    const result = await checkComplianceHold(db, USER_ID)

    expect(result.holdExists).toBe(true)
    expect(result.holdType).toBe("active_investigation")
  })

  it("AC-5.8: erasure type never creates hold", async () => {
    await db.insert(complianceRegister).values({
      type: "erasure",
      accountId: USER_ID,
      status: "completed",
      completedAt: new Date(),
    })

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdExists).toBe(false)
  })

  it("AC-5.8: article_14 type never creates hold", async () => {
    await db.insert(complianceRegister).values({
      type: "article_14",
      accountId: USER_ID,
      status: "completed",
      completedAt: new Date(),
    })

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdExists).toBe(false)
  })

  it("AC-5.8: obligation type never creates hold", async () => {
    await db.insert(complianceRegister).values({
      type: "obligation",
      accountId: USER_ID,
      status: "open",
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdExists).toBe(false)
  })

  it("AC-5.8: completed DSAR does not create hold", async () => {
    await db.insert(complianceRegister).values({
      type: "dsar",
      accountId: USER_ID,
      status: "completed",
      completedAt: new Date(),
    })

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdExists).toBe(false)
  })

  it("AC-5.9: billing holds are NOT checked by checkComplianceHold", async () => {
    // Create a billing hold for a listing but no compliance entries
    const { createTestListing } = await import("@/db/test-fixtures")
    const listing = await createTestListing(db, USER_ID)
    await db.insert(billingHolds).values({
      listingId: listing.id,
      reason: "reconciliation_mismatch",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    })

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdExists).toBe(false)
  })

  it("returns highest-priority hold type when multiple exist (dsar > investigation > complaint)", async () => {
    await db.insert(complianceRegister).values([
      { type: "complaint", accountId: USER_ID, status: "open" as const },
      { type: "investigation", accountId: USER_ID, status: "open" as const },
      { type: "dsar", accountId: USER_ID, status: "open" as const, receivedAt: new Date() },
    ])

    const result = await checkComplianceHold(db, USER_ID)
    expect(result.holdType).toBe("open_dsar")
  })
})

describe("getDSARStatus", () => {
  it("AC-5.2: returns open DSARs with daysRemaining computed from deadline", async () => {
    const deadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
    await db.insert(complianceRegister).values({
      type: "dsar",
      accountId: USER_ID,
      status: "open",
      receivedAt: new Date(),
      deadline,
    })

    const result = await getDSARStatus(db)

    expect(result.openDSARs).toHaveLength(1)
    expect(result.openDSARs[0].daysRemaining).toBeGreaterThanOrEqual(14)
    expect(result.openDSARs[0].daysRemaining).toBeLessThanOrEqual(16)
    expect(result.openDSARs[0].status).toBe("identity_verification")
    expect(result.openDSARs[0].accountId).toBe(USER_ID)
  })

  it("AC-5.2: returns recent erasures from last 90 days", async () => {
    await db.insert(complianceRegister).values({
      type: "erasure",
      status: "completed",
      completedAt: new Date(),
    })

    const result = await getDSARStatus(db)
    expect(result.recentErasures).toHaveLength(1)
  })

  it("AC-5.2: does not return erasures older than 90 days", async () => {
    await db.insert(complianceRegister).values({
      type: "erasure",
      status: "completed",
      completedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    })

    const result = await getDSARStatus(db)
    expect(result.recentErasures).toHaveLength(0)
  })

  it("AC-5.2: returns upcoming deadlines within 30 days", async () => {
    const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    await db.insert(complianceRegister).values({
      type: "obligation",
      status: "open",
      deadline,
    })

    const result = await getDSARStatus(db)
    expect(result.upcomingDeadlines).toHaveLength(1)
    expect(result.upcomingDeadlines[0].obligation).toBe("obligation")
  })

  it("maps in_progress DSAR to data_compilation lifecycle status", async () => {
    await db.insert(complianceRegister).values({
      type: "dsar",
      accountId: USER_ID,
      status: "in_progress",
      receivedAt: new Date(),
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    })

    const result = await getDSARStatus(db)
    expect(result.openDSARs[0].status).toBe("data_compilation")
  })

  it("returns empty arrays when no compliance entries exist", async () => {
    const result = await getDSARStatus(db)

    expect(result.openDSARs).toHaveLength(0)
    expect(result.recentErasures).toHaveLength(0)
    expect(result.upcomingDeadlines).toHaveLength(0)
    expect(result.complianceCalendarStatus).toBe("clear")
  })
})
