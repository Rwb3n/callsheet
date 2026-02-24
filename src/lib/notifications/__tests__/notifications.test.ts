// Notification tests — AC-37 through AC-39

import { describe, it, expect, beforeEach } from "vitest"
import {
  createNotification,
  getUnreadCount,
  markRead,
  markAllRead,
  cleanupOldNotifications,
} from "../notifications"
import { InMemoryNotificationDb } from "@/db/test-fixtures"

describe("Notifications", () => {
  let db: InMemoryNotificationDb

  beforeEach(() => {
    db = new InMemoryNotificationDb()
  })

  // AC-37: createNotification persists; getUnreadCount correct
  it("creates notification and reports correct unread count", async () => {
    const id = await createNotification(db, {
      accountId: "account-1",
      type: "enquiry_received",
      title: "New enquiry",
      body: "You received a new enquiry from Alice",
      link: "/dashboard/enquiries/123",
    })

    expect(id).toBeDefined()
    expect(typeof id).toBe("string")

    const count = await getUnreadCount(db, "account-1")
    expect(count).toBe(1)

    // Second notification
    await createNotification(db, {
      accountId: "account-1",
      type: "claim_approved",
      title: "Claim approved",
      body: "Your claim has been approved",
    })

    expect(await getUnreadCount(db, "account-1")).toBe(2)

    // Different account should have 0
    expect(await getUnreadCount(db, "account-2")).toBe(0)
  })

  // AC-38: markRead / markAllRead work correctly
  it("markRead marks a single notification as read", async () => {
    const id1 = await createNotification(db, {
      accountId: "account-1",
      type: "enquiry_received",
      title: "Enquiry 1",
      body: "Body 1",
    })
    await createNotification(db, {
      accountId: "account-1",
      type: "claim_approved",
      title: "Claim",
      body: "Body 2",
    })

    expect(await getUnreadCount(db, "account-1")).toBe(2)

    await markRead(db, id1)
    expect(await getUnreadCount(db, "account-1")).toBe(1)
  })

  it("markAllRead marks all notifications for account as read", async () => {
    await createNotification(db, { accountId: "account-1", type: "enquiry_received", title: "A", body: "a" })
    await createNotification(db, { accountId: "account-1", type: "claim_approved", title: "B", body: "b" })
    await createNotification(db, { accountId: "account-2", type: "system", title: "C", body: "c" })

    await markAllRead(db, "account-1")

    expect(await getUnreadCount(db, "account-1")).toBe(0)
    expect(await getUnreadCount(db, "account-2")).toBe(1) // other account unaffected
  })

  // AC-39: Cleanup deletes >90 days
  it("cleanup deletes notifications older than 90 days", async () => {
    // Insert a notification with old timestamp
    await db.insert({
      id: "old-1",
      accountId: "account-1",
      type: "system",
      title: "Old notification",
      body: "This is old",
      dismissed: false,
      createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
    })

    // Insert a recent notification
    await createNotification(db, {
      accountId: "account-1",
      type: "system",
      title: "Recent",
      body: "This is recent",
    })

    const deleted = await cleanupOldNotifications(db)
    expect(deleted).toBe(1)

    const remaining = db.getAll()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].title).toBe("Recent")
  })
})
