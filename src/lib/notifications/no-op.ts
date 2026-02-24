// No-op NotificationDb — used until notifications table exists in production.
// Bounce threshold notifications are silently dropped. Replace with DB
// implementation when notifications table is created (S7).

import type { NotificationDb } from "./notifications"

export class NoOpNotificationDb implements NotificationDb {
  async insert(): Promise<string> { return "noop" }
  async countUnread(): Promise<number> { return 0 }
  async list(): Promise<never[]> { return [] }
  async markRead(): Promise<void> {}
  async markAllRead(): Promise<void> {}
  async deleteOlderThan(): Promise<number> { return 0 }
}
