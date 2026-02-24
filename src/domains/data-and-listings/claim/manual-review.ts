// Manual review TaskSpec builders + onManualReviewComplete — S3 §5, AC-26 through AC-30
// TaskSpec type from Ops §4.1. buildManualReviewTaskSpec/buildDisputeTaskSpec/buildPortfolioReviewTaskSpec.
// onManualReviewComplete: admin resolves a pending_review or disputed claim.

import { eq } from "drizzle-orm"
import { listings, preClaimSnapshots } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions"
import { logDecision } from "@/lib/decisions"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"
import { createNotification } from "@/lib/notifications"
import type { SchedulerDb } from "@/lib/scheduler"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { onClaimApproved } from "./claim-approved"
import { onClaimRejected } from "./claim-rejected"
import type { TaskSpec } from "@/domains/operations/types"

export type { TaskSpec }

// --- Listing shape for TaskSpec context ---

type ListingForTaskSpec = {
  id: string
  name: string
  entityType: string
  companiesHouseNumber: string | null
  accountId: string | null
}

type ClaimRequestForTaskSpec = {
  accountId: string
  claimEmail: string
  evidenceUrls: string[]
}

// --- TaskSpec builders [AC-26] ---

export function buildManualReviewTaskSpec(
  listing: ListingForTaskSpec,
  request: ClaimRequestForTaskSpec,
  reason: "sole_trader" | "partial_match" | "insufficient_evidence",
): TaskSpec {
  return {
    id: crypto.randomUUID(),
    domain: "verification",
    priority: "normal",
    task: `Verify claim authenticity for listing: ${listing.name}`,
    context: {
      listingId: listing.id,
      listingName: listing.name,
      entityType: listing.entityType,
      companiesHouseNumber: listing.companiesHouseNumber,
      claimantAccountId: request.accountId,
      claimEmail: request.claimEmail,
      evidenceUrls: request.evidenceUrls,
      reason,
    },
    checklist: [
      "Verify claimant is a director, partner, or authorised representative",
      "If CH number provided: cross-reference claimant name against CH director list",
      "If sole trader: check VAT registration, trade body membership, or portfolio evidence",
      "If partial match: verify domain ownership via WHOIS or request authorisation letter on company letterhead",
      "Check for red flags: Gmail/Hotmail claiming a corporate listing, mismatched location, no professional presence",
    ],
    acceptanceCriteria: "Approve only if claimant demonstrates legitimate authority over the business entity",
    estimatedTime: "10–15 minutes",
    timeout: 48 * 60 * 60 * 1000,
    escalation: "If evidence is ambiguous, reject claim with explanation and invite resubmission with additional evidence",
    requiredSkills: ["identity_verification", "companies_house"],
    dataAccessScope: {
      entities: ["listing", "account"],
      fields: ["name", "companiesHouseNumber", "contactEmail", "websiteUrl", "entityType"],
      excludeFields: [],
      personalDataAccess: true,
      justification: "Claim verification requires cross-referencing claimant identity with listing data",
    },
    learningCapture: {
      outcomeCategories: ["approved", "rejected", "escalated"],
      hypothesisToTest: "Email domain match + CH director match predicts legitimate claim",
      feedbackFields: {
        reviewerConfidence: "How confident are you in this decision? (1–5)",
        evidenceQuality: "Was the submitted evidence sufficient? (yes/partial/no)",
        redFlags: "Any red flags observed?",
      },
    },
  }
}

export function buildDisputeTaskSpec(
  listing: ListingForTaskSpec,
  request: ClaimRequestForTaskSpec,
): TaskSpec {
  return {
    id: crypto.randomUUID(),
    domain: "verification",
    priority: "high",
    task: `Resolve competing claim for listing: ${listing.name}`,
    context: {
      listingId: listing.id,
      existingClaimantAccountId: listing.accountId,
      newClaimantAccountId: request.accountId,
      newClaimEmail: request.claimEmail,
      evidenceUrls: request.evidenceUrls,
    },
    checklist: [
      "Verify which claimant is the authorised representative",
      "Cross-reference both claimants against CH director list (if available)",
      "Check domain ownership for both parties",
      "If both legitimate (e.g., business partners): offer designation of primary contact or separate listings",
      "Request authorisation letter if evidence is ambiguous",
    ],
    acceptanceCriteria: "Determine which claimant has legitimate authority. If unresolvable, escalate to principal.",
    estimatedTime: "20–30 minutes",
    timeout: 14 * 24 * 60 * 60 * 1000,
    escalation: "If unresolvable within 14 days, escalate to principal. Freeze listing visibility until resolved.",
    requiredSkills: ["identity_verification", "dispute_resolution", "companies_house"],
    dataAccessScope: {
      entities: ["listing", "account"],
      fields: ["name", "companiesHouseNumber", "contactEmail", "websiteUrl", "entityType"],
      excludeFields: [],
      personalDataAccess: true,
      justification: "Dispute resolution requires cross-referencing both claimant identities",
    },
    learningCapture: {
      outcomeCategories: ["existing_claimant_upheld", "new_claimant_approved", "both_legitimate", "escalated_to_principal"],
      hypothesisToTest: "Competing claims correlate with high-value listings",
      feedbackFields: {
        resolutionMethod: "How was the dispute resolved?",
        timeToResolve: "Days from dispute creation to resolution",
      },
    },
  }
}

export function buildPortfolioReviewTaskSpec(
  listing: ListingForTaskSpec,
  score: number,
): TaskSpec {
  return {
    id: crypto.randomUUID(),
    domain: "verification",
    priority: "normal",
    task: `Portfolio review for verification upgrade: ${listing.name}`,
    context: {
      listingId: listing.id,
      score,
      callbackType: "verification_upgrade",
      newTier: "verified",
    },
    checklist: [
      "Review portfolio quality and relevance",
      "Verify credited work is genuine",
      "Check for professional presentation standards",
    ],
    acceptanceCriteria: "Portfolio demonstrates professional-quality work in claimed specialisations",
    estimatedTime: "15–20 minutes",
    timeout: 72 * 60 * 60 * 1000,
    escalation: "If portfolio evidence is insufficient, reject with guidance on required improvements",
    requiredSkills: ["identity_verification"],
    dataAccessScope: {
      entities: ["listing"],
      fields: ["name", "credits", "portfolio"],
      excludeFields: [],
      personalDataAccess: false,
      justification: "Portfolio review for verification tier upgrade",
    },
    learningCapture: {
      outcomeCategories: ["approved", "rejected"],
      feedbackFields: {
        portfolioQuality: "Portfolio quality assessment (1–5)",
      },
    },
  }
}

// --- onManualReviewComplete [AC-27, AC-28, AC-29, AC-30] ---

export type ManualReviewDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  notificationDb: NotificationDb
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

type SnapshotData = {
  claimantAccountId: string
  originalListing: Record<string, unknown>
  pendingEdits: Record<string, unknown> | null
}

export async function onManualReviewComplete(
  deps: ManualReviewDeps,
  listingId: string,
  decision: "approve" | "reject",
  reviewNotes: string | undefined,
  reviewerAccountId: string,
): Promise<void> {
  const [listing] = await deps.db
    .select()
    .from(listings)
    .where(eq(listings.id, listingId))

  if (!listing) {
    throw new Error(`listing ${listingId} not found`)
  }

  // AC-29: guard — must be pending_review or disputed
  if (listing.claimStatus !== "pending_review" && listing.claimStatus !== "disputed") {
    const err = new Error(`listing claimStatus is ${listing.claimStatus}, expected pending_review or disputed`)
    ;(err as Error & { code: string }).code = "BAD_REQUEST"
    throw err
  }

  // Read claimant from snapshot
  const [snapshot] = await deps.db
    .select()
    .from(preClaimSnapshots)
    .where(eq(preClaimSnapshots.listingId, listingId))

  const snapshotData = snapshot?.snapshot as SnapshotData | undefined
  const claimantAccountId = snapshotData?.claimantAccountId

  if (!claimantAccountId) {
    throw new Error("no claimant accountId in snapshot")
  }

  const method: "manual" | "disputed_resolved" =
    listing.claimStatus === "disputed" ? "disputed_resolved" : "manual"

  if (decision === "approve") {
    // AC-27: full onClaimApproved pipeline
    await onClaimApproved(
      { db: deps.db, schedulerDb: deps.schedulerDb, decisionLogDb: deps.decisionLogDb, emailService: deps.emailService, notificationDb: deps.notificationDb },
      listingId, claimantAccountId, method,
    )

    await deps.eventBus.emit("claim_approved", {
      _brand: "ClaimApprovedEvent" as const,
      listingId,
      accountId: claimantAccountId,
      method,
      timestamp: new Date().toISOString(),
    }, deps.waitUntilFn)
  } else {
    // AC-28: full onClaimRejected pipeline
    await onClaimRejected(
      { db: deps.db, decisionLogDb: deps.decisionLogDb, emailService: deps.emailService, notificationDb: deps.notificationDb },
      listingId, claimantAccountId,
      [reviewNotes ?? "Manual review rejection"],
      listing.claimStatus,
    )

    await deps.eventBus.emit("claim_rejected", {
      _brand: "ClaimRejectedEvent" as const,
      listingId,
      claimantAccountId,
      reason: reviewNotes ?? "Manual review rejection",
      timestamp: new Date().toISOString(),
    }, deps.waitUntilFn)
  }

  // AC-30: log decision with reviewer's accountId
  await logDecision(deps.decisionLogDb, {
    domain: "data-and-listings",
    decisionType: "claim_evaluation",
    inputs: { listingId, decision, reviewNotes, reviewerAccountId, method },
    output: { action: decision === "approve" ? "approved" : "rejected" },
    listingId,
    accountId: claimantAccountId,
  })
}
