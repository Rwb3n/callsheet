// Deferred action scheduler types — SI §2.1, S0 §3

import type { EmailSendParams } from "@/lib/email/types"

// Placeholder types referenced in params — domain slices define the real types
type UUID = string
type ISO8601 = string
type CheckoutCompletedEvent = Record<string, unknown>
type EnrichmentCheckType = string

// All 35 action types [SI §2.2]. Grows as slices register handlers.
export type DeferredActionParamsMap = {
  expire_enquiry_queue: { listingId: UUID }
  compliance_schedule_check: Record<string, never>
  billing_reconciliation: Record<string, never>
  compliance_hold_recheck: { accountId: UUID; flowId: UUID }
  win_back_evaluation: { listingId: UUID; accountId: UUID }
  auto_escalation_check: { flowId: UUID; flowType: "erasure" | "closure" }
  notification_cleanup: Record<string, never>
  grace_period_expiry: { listingId: UUID; gracePeriodId: UUID }
  checkout_precondition_retry: { paddleEvent: CheckoutCompletedEvent; attemptCount: number; maxAttempts: number }
  listing_update_reminder: { listingId: UUID }
  enquiry_response_reminder: { enquiryId: UUID; listingId: UUID }
  search_history_cleanup: Record<string, never>
  sla_breach_warning: { ticketId: UUID; slaDeadline: ISO8601 }
  task_timeout_check: { taskId: UUID }
  billing_hold_expiry: { listingId: UUID; holdId: UUID }
  compliance_self_audit: Record<string, never>
  check_quality_improvement: { listingId: UUID; baselineScore: number }
  quality_score_recalculation: { listingId: UUID }
  decay_liveness_check: { listingId: UUID; checkType: EnrichmentCheckType }
  enrichment_full_cycle: { listingId: UUID }
  claim_abandonment_check: Record<string, never>
  taxonomy_review_preparation: Record<string, never>
  data_health_review: Record<string, never>
  verification_calibration_review: Record<string, never>
  provider_outreach_ranking: Record<string, never>
  conversion_funnel_analysis: Record<string, never>
  revenue_health_extended: Record<string, never>
  multi_listing_pricing_evaluation: Record<string, never>
  sponsored_placement_learning: Record<string, never>
  operational_health_review: Record<string, never>
  contractor_performance_review: Record<string, never>
  principal_briefing_generation: Record<string, never>
  proactive_churn_detection: Record<string, never>
  learning_hypothesis_analysis: Record<string, never>
  send_progressive_email: { listingId: UUID; template: string; accountId: UUID }
  onboarding_day14_prompt: { listingId: UUID; accountId: UUID }
  article_14_progress_check: { importBatchId: string; importDate: string }
  retry_bounced_email: { correspondenceLogId: string; originalParams: EmailSendParams }
  pre_claim_snapshot_cleanup: { listingId: UUID }
  dispute_escalation_check: { listingId: UUID; disputeTaskSpecId: UUID }
}

export type DeferredActionType = keyof DeferredActionParamsMap

export type RetryPolicy = "once" | "retry_3"
export type OnFailure = "log" | "alert_principal"
export type DeferredActionStatus = "pending" | "executing" | "completed" | "failed" | "exhausted" | "cancelled"

export interface ScheduleActionParams<T extends DeferredActionType> {
  action: T
  params: DeferredActionParamsMap[T]
  executeAt: Date
  retryPolicy: RetryPolicy
  onFailure: OnFailure
  createdBy: string
}

export interface CancelActionParams<T extends DeferredActionType> {
  action: T
  filterParams: Partial<DeferredActionParamsMap[T]>
  cancelledBy: string
}

// Stored row shape — matches Drizzle select result
export interface DeferredActionRow {
  id: string
  action: string
  params: Record<string, unknown>
  executeAt: Date
  retryPolicy: RetryPolicy
  onFailure: OnFailure
  createdBy: string
  status: DeferredActionStatus
  attempts: number
  lastError: string | null
  cancelledAt: Date | null
  cancelledBy: string | null
  createdAt: Date
  completedAt: Date | null
}

export type ActionHandler<T extends DeferredActionType> = (
  params: DeferredActionParamsMap[T],
) => Promise<void>

// Type-erased handler for internal storage (same pattern as event bus StoredHandler)
export type StoredActionHandler = (params: never) => Promise<void>

export type AlertPrincipalFn = (actionType: string, actionId: string, error: string) => Promise<void>

// Recurring action seed config [S0 §3.2, AC-48]
export interface RecurringActionConfig {
  action: DeferredActionType
  intervalMs: number
  retryPolicy: RetryPolicy
  onFailure: OnFailure
  createdBy: string
}

// [S0-16, AC-49]
export const NOTIFICATION_CLEANUP_BATCH_LIMIT = 10_000
