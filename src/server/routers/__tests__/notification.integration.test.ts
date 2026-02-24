// CS-WORK-046 AC-23 through AC-26: Notification centre integration tests
// Tests call notification router via createCaller() against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { seedTestUser, makeSession, ctx } from "@/db/test-fixtures"
import { notifications } from "@/db/schema/shared"
import { createNotificationRouter } from "../notification"
import type { AuthSession } from "@/lib/auth"

let db: ReturnType<typeof getTestDb>

const ACCOUNT_ID = "test-notif-owner"
const OTHER_ACCOUNT = "test-notif-other"

function caller(session: AuthSession) {
  const router = createNotificationRouter({ db })
  return router.createCaller(ctx(session))
}

const ownerSession = makeSession({ accountId: ACCOUNT_ID })
const otherSession = makeSession({ accountId: OTHER_ACCOUNT })

async function insertNotification(
  overrides: Partial<typeof notifications.$inferInsert> & { id: string },
) {
  const [row] = await db
    .insert(notifications)
    .values({
      accountId: ACCOUNT_ID,
      type: "system",
      title: "Test",
      body: "Test body",
      ...overrides,
    })
    .returning()
  return row
}

beforeAll(async () => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ACCOUNT_ID)
  await seedTestUser(db, OTHER_ACCOUNT)
})

afterAll(async () => {
  await closeTestDb()
})

// --- AC-23: cursor-based pagination, newest first, excludes dismissed ---

describe("notification.list", () => {
  it("returns notifications ordered newest first", async () => {
    const past = new Date("2026-01-01T00:00:00Z")
    const recent = new Date("2026-02-01T00:00:00Z")
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001", title: "Old", createdAt: past })
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000002", title: "New", createdAt: recent })

    const result = await caller(ownerSession).list({ limit: 50 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe("New")
    expect(result.items[1].title).toBe("Old")
  })

  it("excludes dismissed notifications", async () => {
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001", title: "Visible" })
    await insertNotification({
      id: "a0000000-0000-4000-8000-000000000002",
      title: "Dismissed",
      dismissed: true,
      dismissedAt: new Date(),
    })

    const result = await caller(ownerSession).list({ limit: 50 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe("Visible")
  })

  it("paginates with cursor", async () => {
    // Insert 5 notifications with staggered timestamps
    for (let i = 1; i <= 5; i++) {
      await insertNotification({
        id: `a0000000-0000-4000-8000-00000000000${i}`,
        title: `N${i}`,
        createdAt: new Date(`2026-01-0${i}T00:00:00Z`),
      })
    }

    const page1 = await caller(ownerSession).list({ limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0].title).toBe("N5")
    expect(page1.items[1].title).toBe("N4")
    expect(page1.nextCursor).toBe("a0000000-0000-4000-8000-000000000004")

    const page2 = await caller(ownerSession).list({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(2)
    expect(page2.items[0].title).toBe("N3")
    expect(page2.items[1].title).toBe("N2")
    expect(page2.nextCursor).toBe("a0000000-0000-4000-8000-000000000002")

    const page3 = await caller(ownerSession).list({ limit: 2, cursor: page2.nextCursor! })
    expect(page3.items).toHaveLength(1)
    expect(page3.items[0].title).toBe("N1")
    expect(page3.nextCursor).toBeNull()
  })

  it("does not return notifications from other accounts", async () => {
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001", accountId: OTHER_ACCOUNT })

    const result = await caller(ownerSession).list({ limit: 50 })
    expect(result.items).toHaveLength(0)
  })
})

// --- AC-24: dismiss soft-deletes ---

describe("notification.dismiss", () => {
  it("soft-deletes notification (excluded from list, retained in DB)", async () => {
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001", title: "ToDismiss" })

    await caller(ownerSession).dismiss({ notificationId: "a0000000-0000-4000-8000-000000000001" })

    // Not in list
    const result = await caller(ownerSession).list({ limit: 50 })
    expect(result.items).toHaveLength(0)

    // Still in DB (query raw)
    const [raw] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "a0000000-0000-4000-8000-000000000001"))
    expect(raw.dismissed).toBe(true)
    expect(raw.dismissedAt).toBeTruthy()
  })

  it("does not dismiss another account's notification", async () => {
    await insertNotification({
      id: "a0000000-0000-4000-8000-000000000001",
      accountId: OTHER_ACCOUNT,
    })

    await caller(ownerSession).dismiss({ notificationId: "a0000000-0000-4000-8000-000000000001" })

    // Still visible to other account
    const result = await caller(otherSession).list({ limit: 50 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].dismissed).toBe(false)
  })
})

// --- AC-25: unread count updates on mark-read and new notification ---

describe("notification.markRead + getUnreadCount", () => {
  it("unread count decreases after mark-read", async () => {
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001" })
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000002" })

    const before = await caller(ownerSession).getUnreadCount()
    expect(before.count).toBe(2)

    await caller(ownerSession).markRead({ notificationId: "a0000000-0000-4000-8000-000000000001" })

    const after = await caller(ownerSession).getUnreadCount()
    expect(after.count).toBe(1)
  })

  it("unread count increases when new notification is inserted", async () => {
    const before = await caller(ownerSession).getUnreadCount()
    expect(before.count).toBe(0)

    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001" })

    const after = await caller(ownerSession).getUnreadCount()
    expect(after.count).toBe(1)
  })

  it("dismissed notifications are excluded from unread count", async () => {
    await insertNotification({ id: "a0000000-0000-4000-8000-000000000001" })
    await insertNotification({
      id: "a0000000-0000-4000-8000-000000000002",
      dismissed: true,
      dismissedAt: new Date(),
    })

    const result = await caller(ownerSession).getUnreadCount()
    expect(result.count).toBe(1)
  })
})

// --- AC-26: unread count query performance ---

describe("notification.getUnreadCount performance", () => {
  it("returns within 50ms for 50 notifications", async () => {
    // Insert 25 read notifications
    for (let i = 0; i < 25; i++) {
      await insertNotification({
        id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        readAt: new Date("2026-01-01"),
      })
    }
    // Insert 25 unread notifications (no readAt override — column defaults to null)
    for (let i = 25; i < 50; i++) {
      await insertNotification({
        id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })
    }

    const start = performance.now()
    const result = await caller(ownerSession).getUnreadCount()
    const elapsed = performance.now() - start

    expect(result.count).toBe(25)
    // p95 target is 50ms — single run should be well under
    expect(elapsed).toBeLessThan(50)
  })
})
