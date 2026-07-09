// Admin notifications router integration tests — CS-WORK-095

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  seedTestUser,
  expectTRPCError,
} from "@/db/test-fixtures"
import { createAdminNotificationsRouter } from "@/server/routers/admin/notifications"
import { notifications } from "@/db/schema/shared"

const db = getTestDb()
const adminId = makeUUID("admin001")

const router = createAdminNotificationsRouter({ db })
const caller = router.createCaller(ctx(makeAdminSession(adminId)))
const userCaller = router.createCaller(ctx(makeSession({ accountId: makeUUID("user001") })))

async function insertNotification(overrides: Partial<{
  accountId: string
  type: string
  dismissed: boolean
}> = {}) {
  const [row] = await db
    .insert(notifications)
    .values({
      accountId: overrides.accountId ?? makeUUID("user001a"),
      type: overrides.type ?? "system",
      title: "Test notification",
      body: "Test body",
      dismissed: overrides.dismissed ?? false,
    })
    .returning()
  return row
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, adminId)
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.notifications.list", () => {
  it("AC-1: returns notifications across accounts with filters", async () => {
    await insertNotification({ accountId: makeUUID("user001a") })
    await insertNotification({ accountId: makeUUID("user002a"), type: "enquiry_received" })
    await insertNotification({ accountId: makeUUID("user001a"), dismissed: true })

    const all = await caller.list({ limit: 20 })
    expect(all.items).toHaveLength(3)

    const byAccount = await caller.list({ accountId: makeUUID("user001a"), limit: 20 })
    expect(byAccount.items).toHaveLength(2)

    const byType = await caller.list({ type: "enquiry_received", limit: 20 })
    expect(byType.items).toHaveLength(1)

    const dismissed = await caller.list({ dismissed: true, limit: 20 })
    expect(dismissed.items).toHaveLength(1)
  })

  it("AC-1: supports cursor-based pagination", async () => {
    await insertNotification()
    await insertNotification()
    await insertNotification()

    const page1 = await caller.list({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeUndefined()
  })
})

describe("admin.notifications.dismiss", () => {
  it("AC-2: admin can dismiss any notification", async () => {
    const n = await insertNotification()

    await caller.dismiss({ notificationId: n.id })

    const result = await caller.list({ dismissed: true, limit: 20 })
    expect(result.items.some((i) => i.id === n.id && i.dismissed === true)).toBe(true)
  })

  it("AC-2: throws NOT_FOUND for missing notification", async () => {
    await expectTRPCError(
      caller.dismiss({ notificationId: makeUUID("nonexist") }),
      "NOT_FOUND",
    )
  })
})

describe("AC-3: admin auth enforcement", () => {
  it("list requires adminProcedure", async () => {
    await expect(userCaller.list({ limit: 20 }))
      .rejects.toThrow("Admin access required")
  })

  it("dismiss requires adminProcedure", async () => {
    await expect(userCaller.dismiss({ notificationId: makeUUID("any00001") }))
      .rejects.toThrow("Admin access required")
  })
})
