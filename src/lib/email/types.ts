// Email transport types — SI §5

export type EmailCategory =
  | "transactional"
  | "enquiry_notification"
  | "listing_status"
  | "profile_nudge"
  | "subscription"
  | "conversion_marketing"

export type EmailSendResult = {
  messageId: string | null
  status: "sent" | "queued" | "suppressed" | "failed"
  threadId: string
}

// 31 template IDs — SI §5.2
export type EmailTemplateId =
  // Platform transactional
  | "email_verification"
  | "password_reset"
  | "welcome"
  | "listing_live"
  | "claim_approved"
  | "claim_rejected"
  | "claim_pending_review"
  | "new_enquiry"
  | "enquiry_forwarded"
  | "enquiry_reminder"
  | "profile_day1"
  | "profile_day3"
  | "profile_day7"
  | "listing_update_reminder"
  | "enquiry_response"
  | "claim_dispute_notification"
  // Operations compliance
  | "article_14_notice"
  | "dsar_acknowledgment"
  | "dsar_completion"
  | "listing_decay_warning"
  | "support_acknowledgment"
  // Subscription
  | "subscription_confirmed"
  // Commercial conversion
  | "conversion_analytics_teaser"
  | "conversion_social_proof"
  | "conversion_view_milestone"
  | "conversion_engagement_summary"
  | "winback"
  // Intelligence
  | "decay_final_notice"
  | "enrichment_confirmation_request"
  | "credit_confirmation_outreach"
  | "principal_briefing"

export type EmailPreferences = {
  enquiry_notification: boolean
  listing_status: boolean
  profile_nudge: boolean
  conversion_marketing: boolean
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  enquiry_notification: true,
  listing_status: true,
  profile_nudge: true,
  conversion_marketing: true,
}

export type EmailSendParams = {
  to: string
  template: EmailTemplateId
  data: Record<string, unknown>
  category: EmailCategory
  accountId?: string
  threadId?: string
  listingId?: string
}

export interface EmailService {
  send(params: EmailSendParams): Promise<EmailSendResult>
}

export type TemplateRenderer = (data: Record<string, unknown>) => {
  subject: string
  html: string
}
