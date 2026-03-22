// Drizzle-backed NotificationDb — SI §8, S5 §6

import { eq, and, isNull, lt, desc, sql } from "drizzle-orm"
import { notifications } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { NotificationDb } from "./notifications"
import type { Notification } from "./types"

export class DrizzleNotificationDb implements NotificationDb {
  constructor(private db: Db) {}

  async insert(notification: Omit<Notification, "readAt" | "dismissedAt">): Promise<string> {
    const [row] = await this.db
      .insert(notifications)
      .values({
        id: notification.id,
        accountId: notification.accountId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        dismissed: notification.dismissed,
      })
      .returning({ id: notifications.id })
    return row.id
  }

  async countUnread(accountId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.accountId, accountId),
        isNull(notifications.readAt),
        eq(notifications.dismissed, false),
      ))
    return row.count
  }

  async list(accountId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.accountId, accountId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)
    return rows.map(toNotification)
  }

  async markRead(notificationId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId))
  }

  async markAllRead(accountId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.accountId, accountId),
        isNull(notifications.readAt),
      ))
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const deleted = await this.db
      .delete(notifications)
      .where(lt(notifications.createdAt, date))
      .returning({ id: notifications.id })
    return deleted.length
  }
}

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type as Notification["type"],
    title: row.title,
    body: row.body,
    link: row.link ?? undefined,
    readAt: row.readAt?.toISOString(),
    dismissed: row.dismissed,
    dismissedAt: row.dismissedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}
