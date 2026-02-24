// Notification types — SI §8

export type NotificationType =
  | "enquiry_received"
  | "claim_approved"
  | "claim_rejected"
  | "claim_pending_review"
  | "subscription_confirmed"
  | "subscription_ending"
  | "quality_score_changed"
  | "conversion_milestone"
  | "churn_risk_suggestion"
  | "decay_warning"
  | "listing_archived_shortlist"
  | "account_closure_initiated"
  | "system"
  | "task_overdue"
  | "billing_anomaly"
  | "compliance_deadline"
  | "enrichment_confirmation_due"
  | "onboarding_prompt"
  | "ceremony_action_required"

export type Notification = {
  id: string
  accountId: string
  type: NotificationType
  title: string
  body: string
  link?: string
  readAt?: string
  dismissed: boolean
  dismissedAt?: string
  createdAt: string
}

export type CreateNotificationParams = {
  accountId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

export const NOTIFICATION_RETENTION_DAYS = 90
