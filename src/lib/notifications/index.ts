export {
  createNotification,
  getUnreadCount,
  markRead,
  markAllRead,
  cleanupOldNotifications,
} from "./notifications"
export type { NotificationDb } from "./notifications"
export { NOTIFICATION_RETENTION_DAYS } from "./types"
export type { Notification, NotificationType, CreateNotificationParams } from "./types"
export { DrizzleNotificationDb } from "./drizzle-notification-db"
