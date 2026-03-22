// Event bus types — SI §1.2, §1.3, §1.5
// Payload types are placeholder interfaces at S0. Domain slices define the real types.
// EVENT_CONSUMER_MATRIX entries are empty — each slice populates its consumers.

export type Domain =
  | "data-and-listings"
  | "operations"
  | "platform"
  | "commercial"
  | "intelligence"

// All 25 event type string literals [SI §1.2]
export type EventType =
  | "claim_approved"
  | "claim_rejected"
  | "listing_archived"
  | "listing_suspended"
  | "listing_reactivated"
  | "verification_tier_changed"
  | "decay_signal_detected"
  | "quality_score_changed"
  | "erasure_completed"
  | "subscription_tier_changed"
  | "subscription_ended"
  | "winback_delivery_result"
  | "search_performed"
  | "profile_viewed"
  | "enquiry_submitted"
  | "enquiry_responded"
  | "shortlist_added"
  | "listing_created"
  | "profile_edited"
  | "contact_attempt"
  | "account_closed"
  | "conversion_milestone"
  | "churn_risk_detected"
  | "winback_eligible"
  | "pending_cancellation_created"

// Placeholder payload interfaces — domain slices replace these
// Each is a distinct interface so the compiler catches misuse across event types
export interface ClaimApprovedEvent {
  readonly _brand: "ClaimApprovedEvent"
  listingId: string
  accountId: string
  method: "auto" | "manual" | "disputed_resolved"
  timestamp: string
}
export interface ClaimRejectedEvent {
  readonly _brand: "ClaimRejectedEvent"
  listingId: string
  claimantAccountId: string
  reason: string
  timestamp: string
}
export interface ListingArchivedEvent {
  readonly _brand: "ListingArchivedEvent"
  listingId: string
  accountId: string | null
  subscriptionTier: SubscriptionTier
  entityType: string
  slug: string
}
export interface ListingSuspendedEvent {
  readonly _brand: "ListingSuspendedEvent"
  listingId: string
  reason: string
  previousStatus: string
}
export interface ListingReactivatedEvent {
  readonly _brand: "ListingReactivatedEvent"
  listingId: string
  accountId: string
  entityType: string
  slug: string
}
export interface VerificationTierChangedEvent {
  readonly _brand: "VerificationTierChangedEvent"
  listingId: string
  previousTier: string
  newTier: string
}
export interface DecaySignalDetectedEvent {
  readonly _brand: "DecaySignalDetectedEvent"
  listingId: string
  signal: { type: string; severity: "low" | "medium" | "high" | "critical" }
  activeSupportTicket?: string // UUID of active ticket, if present [X-6]
}
export interface QualityScoreChangedEvent {
  readonly _brand: "QualityScoreChangedEvent"
  listingId: string
  previousComposite: number
  newComposite: number
  changedDimensions: string[]
}
export interface ErasureCompletedEvent {
  readonly _brand: "ErasureCompletedEvent"
  accountHash: string
  senderAccountId: string
  listingIdsAnonymised: string[]
  listingIdsDeleted: string[]
  freelancerListingsDeleted: number
  timestamp: string
}
export type SubscriptionTier = "free" | "standard" | "premium" | "partner"

export interface SubscriptionTierChangedEvent {
  readonly _brand: "SubscriptionTierChangedEvent"
  listingId: string
  accountId: string
  newTier: SubscriptionTier
  previousTier: SubscriptionTier
}
export interface SubscriptionEndedEvent {
  readonly _brand: "SubscriptionEndedEvent"
  listingId: string
  accountId: string
  previousTier: SubscriptionTier
  reason: "cancellation" | "grace_period_expired" | "account_closure" | "paddle_reconciliation"
  origin: "paddle" | "archival" | "closure"
  timestamp: string
}
export interface WinbackDeliveryResultEvent {
  readonly _brand: "WinbackDeliveryResultEvent"
  listingId: string
  accountId: string
  status: "delivered" | "failed"
  timestamp: string
}
export interface SearchPerformedEvent {
  readonly _brand: "SearchPerformedEvent"
  query: string
  filters: Record<string, unknown>
  resultCount: number
  resultListingIds: string[] // S9 §3.1 — per-listing search term aggregation
  sessionId: string | null
  timestamp: string
}
export interface ProfileViewedEvent {
  readonly _brand: "ProfileViewedEvent"
  listingId: string
  viewerAccountId: string | null
  source: "search" | "direct" | "shortlist"
  timestamp: string
}
export interface EnquirySubmittedEvent {
  readonly _brand: "EnquirySubmittedEvent"
  enquiryId: string
  listingId: string
  timestamp: string
}
export interface EnquiryRespondedEvent {
  readonly _brand: "EnquiryRespondedEvent"
  listingId: string
  enquiryId: string
  responseTimeMinutes: number
}
export interface ShortlistAddedEvent {
  readonly _brand: "ShortlistAddedEvent"
  listingId: string
  accountId: string
  timestamp: string
}
export interface ListingCreatedEvent {
  readonly _brand: "ListingCreatedEvent"
  listingId: string
  accountId: string
  entityType: string
  slug: string
}
export interface ProfileEditedEvent {
  readonly _brand: "ProfileEditedEvent"
  listingId: string
  accountId: string
  changedFields: string[]
}
export interface ContactAttemptEvent {
  readonly _brand: "ContactAttemptEvent"
  listingId: string
  result: "reached" | "unreachable"
  reporterAccountId: string | null
  timestamp: string
}
export interface AccountClosedEvent {
  readonly _brand: "AccountClosedEvent"
  accountId: string
  listingsArchived: string[]
  complianceHoldActive?: boolean
}
export type ConversionMilestoneId =
  | "first_subscription"
  | "first_upgrade"
  | "premium_reached"
  | "partner_reached"

export interface ConversionMilestoneEvent {
  readonly _brand: "ConversionMilestoneEvent"
  listingId: string
  accountId: string
  milestone: ConversionMilestoneId
  milestoneLabel: string
  timestamp: string
}
export type ChurnRiskFactor =
  | "quality_declining"
  | "engagement_dropping"
  | "payment_at_risk"
  | "low_quality_paid"
  | "billing_cadence_switch_to_monthly"

export interface ChurnRiskDetectedEvent {
  readonly _brand: "ChurnRiskDetectedEvent"
  listingId: string
  accountId: string
  riskFactors: ChurnRiskFactor[]
  timestamp: string
}
export interface WinbackEligibleEvent {
  readonly _brand: "WinbackEligibleEvent"
  listingId: string
  cancelledAccountId: string
  mergeFields: {
    subject: string
    body: string
    listingName: string
    enquiryCount?: number
    viewCount?: number
  }
  timestamp: string
}
export type CancellationReasonLiteral =
  | "voluntary"
  | "payment_failure"
  | "paddle_reconciliation"
  | "account_closed"
  | "listing_archived"

export interface PendingCancellationCreatedEvent {
  readonly _brand: "PendingCancellationCreatedEvent"
  listingId: string
  paddleSubscriptionId: string
  reason: CancellationReasonLiteral
  timestamp: string
}

export type EventPayloadMap = {
  claim_approved: ClaimApprovedEvent
  claim_rejected: ClaimRejectedEvent
  listing_archived: ListingArchivedEvent
  listing_suspended: ListingSuspendedEvent
  listing_reactivated: ListingReactivatedEvent
  verification_tier_changed: VerificationTierChangedEvent
  decay_signal_detected: DecaySignalDetectedEvent
  quality_score_changed: QualityScoreChangedEvent
  erasure_completed: ErasureCompletedEvent
  subscription_tier_changed: SubscriptionTierChangedEvent
  subscription_ended: SubscriptionEndedEvent
  winback_delivery_result: WinbackDeliveryResultEvent
  search_performed: SearchPerformedEvent
  profile_viewed: ProfileViewedEvent
  enquiry_submitted: EnquirySubmittedEvent
  enquiry_responded: EnquiryRespondedEvent
  shortlist_added: ShortlistAddedEvent
  listing_created: ListingCreatedEvent
  profile_edited: ProfileEditedEvent
  contact_attempt: ContactAttemptEvent
  account_closed: AccountClosedEvent
  conversion_milestone: ConversionMilestoneEvent
  churn_risk_detected: ChurnRiskDetectedEvent
  winback_eligible: WinbackEligibleEvent
  pending_cancellation_created: PendingCancellationCreatedEvent
}

export interface ConsumerEntry {
  consumer: string
  domain: Domain
  mode: "sync" | "async"
}

export interface EventHandler<T extends EventType> {
  domain: Domain
  eventType: T
  mode: "sync" | "async"
  handler: (payload: EventPayloadMap[T]) => Promise<void>
}

export interface EventConsumerError {
  eventType: EventType
  consumerDomain: string
  consumerId: string
  payload: unknown
  error: string
  stack: string
  timestamp: string
  mode: "sync" | "async"
}

export interface ScalingMetrics {
  syncDurationMs: number
  asyncConsumerCount: number
  asyncPercentage: number
}

// Type structure only — entries empty at S0. Each slice populates its consumers. [SI §1.5]
export const EVENT_CONSUMER_MATRIX = {
  claim_approved: [
    { consumer: "searchIndexUpdate", domain: "platform" as const, mode: "sync" as const },
    { consumer: "claimVolumeTracking", domain: "operations", mode: "async" },
    { consumer: "conversionReset", domain: "commercial", mode: "async" },
    { consumer: "claimEnrichmentUpgrade", domain: "intelligence", mode: "async" },
  ],
  claim_rejected: [
    { consumer: "claimVolumeTracking", domain: "operations", mode: "async" },
  ],
  listing_archived: [
    { consumer: "closeTickets", domain: "operations", mode: "async" },
    { consumer: "archivalChurn", domain: "commercial", mode: "async" },
  ],
  listing_suspended: [
    { consumer: "updateTickets", domain: "operations", mode: "async" },
  ],
  listing_reactivated: [
    { consumer: "resumeOutreach", domain: "operations", mode: "async" },
  ],
  verification_tier_changed: [],
  decay_signal_detected: [
    { consumer: "decayOutreach", domain: "operations", mode: "async" },
    { consumer: "ticketAnnotation", domain: "intelligence", mode: "async" },
  ],
  quality_score_changed: [
    { consumer: "lowQualityIntervention", domain: "commercial", mode: "async" },
  ],
  erasure_completed: [
    { consumer: "erasureCleanup", domain: "commercial", mode: "async" },
  ],
  subscription_tier_changed: [
    { consumer: "tierUpdate", domain: "data-and-listings", mode: "async" },
    { consumer: "featureAccessUpdate", domain: "platform", mode: "async" },
    { consumer: "providerNotification", domain: "platform", mode: "async" },
    { consumer: "revenueMetrics", domain: "commercial", mode: "async" },
    { consumer: "revenuePerception", domain: "intelligence", mode: "async" },
  ],
  subscription_ended: [
    { consumer: "downgradeFeatureAccess", domain: "platform", mode: "async" },
    { consumer: "resubscribeCTA", domain: "platform", mode: "async" },
    { consumer: "churnAndWinback", domain: "commercial", mode: "async" },
    { consumer: "churnAnalysis", domain: "intelligence", mode: "async" },
  ],
  winback_delivery_result: [
    { consumer: "winbackEffectiveness", domain: "intelligence", mode: "async" },
  ],
  search_performed: [
    { consumer: "zeroResultTracking", domain: "data-and-listings", mode: "async" },
    { consumer: "searchTermAggregation", domain: "intelligence", mode: "async" },
  ],
  profile_viewed: [
    { consumer: "engagementIncrement", domain: "data-and-listings", mode: "async" },
    { consumer: "viewDedup", domain: "intelligence", mode: "async" },
  ],
  enquiry_submitted: [
    { consumer: "engagementIncrement", domain: "data-and-listings", mode: "async" },
    { consumer: "firstEnquiryTrigger", domain: "commercial", mode: "async" },
    { consumer: "enquiryAnalytics", domain: "intelligence", mode: "async" },
  ],
  enquiry_responded: [
    { consumer: "responseMetrics", domain: "data-and-listings", mode: "async" },
    { consumer: "responseInsights", domain: "intelligence", mode: "async" },
  ],
  shortlist_added: [
    { consumer: "qualityCalibration", domain: "intelligence", mode: "async" },
  ],
  listing_created: [
    { consumer: "initialQualityScore", domain: "data-and-listings", mode: "async" },
    { consumer: "onboardingTracking", domain: "operations", mode: "async" },
    { consumer: "initialEnrichment", domain: "intelligence", mode: "async" },
  ],
  profile_edited: [
    { consumer: "qualityScoreRecalc", domain: "data-and-listings", mode: "async" },
    { consumer: "qualityRecalcSchedule", domain: "intelligence", mode: "async" },
  ],
  contact_attempt: [
    { consumer: "dataQualityFlag", domain: "data-and-listings", mode: "async" },
    { consumer: "outreachPrioritisation", domain: "operations", mode: "async" },
    { consumer: "decaySignalEvaluation", domain: "intelligence", mode: "async" },
  ],
  account_closed: [
    { consumer: "suspendEnrichment", domain: "data-and-listings", mode: "async" },
    { consumer: "closeTicketsAndCompliance", domain: "operations", mode: "async" },
    { consumer: "closureChurn", domain: "commercial", mode: "async" },
    { consumer: "enrichmentSuspensionNoop", domain: "intelligence", mode: "async" },
  ],
  conversion_milestone: [
    { consumer: "conversionAttribution", domain: "intelligence", mode: "async" },
  ],
  churn_risk_detected: [
    { consumer: "churnRiskUpsert", domain: "operations", mode: "async" },
  ],
  winback_eligible: [
    { consumer: "winbackDelivery", domain: "operations", mode: "async" },
  ],
  pending_cancellation_created: [
    { consumer: "storeAndCancel", domain: "operations", mode: "async" },
  ],
} satisfies Record<EventType, ConsumerEntry[]>
