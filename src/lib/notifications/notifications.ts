// Notification system — SI §8, S0 §9
// In-app only at V1. Persisted in DB, displayed in provider dashboard.

import { NOTIFICATION_RETENTION_DAYS } from "./types"
import type { CreateNotificationParams, Notification } from "./types"

export interface NotificationDb {
  insert(notification: Omit<Notification, "readAt" | "dismissedAt">): Promise<string>
  countUnread(accountId: string): Promise<number>
  list(accountId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]>
  markRead(notificationId: string): Promise<void>
  markAllRead(accountId: string): Promise<void>
  deleteOlderThan(date: Date): Promise<number>
}

export async function createNotification(
  db: NotificationDb,
  params: CreateNotificationParams,
): Promise<string> {
  return db.insert({
    id: crypto.randomUUID(),
    accountId: params.accountId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
    dismissed: false,
    createdAt: new Date().toISOString(),
  })
}

export async function getUnreadCount(db: NotificationDb, accountId: string): Promise<number> {
  return db.countUnread(accountId)
}

export async function markRead(db: NotificationDb, notificationId: string): Promise<void> {
  return db.markRead(notificationId)
}

export async function markAllRead(db: NotificationDb, accountId: string): Promise<void> {
  return db.markAllRead(accountId)
}

export async function cleanupOldNotifications(db: NotificationDb): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - NOTIFICATION_RETENTION_DAYS)
  return db.deleteOlderThan(cutoff)
}
