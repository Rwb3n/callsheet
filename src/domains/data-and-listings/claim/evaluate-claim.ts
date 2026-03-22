// evaluateClaim decision engine — S3 §1.3, §1.4
// Core D&L decision architecture: CH dissolution guard → email domain match → routing

import { eq, and } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { ClaimDecision, ClaimRequest } from "./types"

type Listing = typeof listings.$inferSelect

export type EvaluateClaimDeps = {
  db: Db
  companiesHouse: CompaniesHouseService
}

export async function evaluateClaim(
  request: ClaimRequest,
  listing: Listing,
  deps: EvaluateClaimDeps,
): Promise<ClaimDecision> {

  // Guard: suspended listing cannot be claimed [S3 §12, AC-8]
  if (listing.lifecycleStatus === "suspended") {
    return {
      action: "auto_reject",
      confidence: 1.0,
      reasons: ["listing is suspended — cannot be claimed"],
    }
  }

  // Guard: pending_review blocks concurrent claims [AC-6]
  if (listing.claimStatus === "pending_review") {
    return { action: "retry", reasons: ["claim already under manual review"] }
  }

  // Competing claim detection [AC-7]
  if (listing.claimStatus === "claimed") {
    const locked = await acquireClaimLock(deps.db, listing.id, "claimed", "disputed")
    if (!locked) {
      return { action: "retry", reasons: ["concurrent claim modification detected"] }
    }
    return {
      action: "queue_dispute_resolution",
      confidence: 0,
      reasons: ["listing already claimed — competing claim received"],
    }
  }

  // Optimistic lock: unclaimed → pending_review [AC-5]
  const locked = await acquireClaimLock(deps.db, listing.id, "unclaimed", "pending_review")
  if (!locked) {
    return { action: "retry", reasons: ["concurrent claim modification detected"] }
  }

  // Step 1: CH dissolution guard (must precede email domain match) [S3-ST-1, AC-45]
  if (request.companiesHouseNumber) {
    const chResult = await deps.companiesHouse.lookup(request.companiesHouseNumber)

    if (chResult.found && chResult.status === "dissolved") {
      return {
        action: "auto_reject",
        confidence: 0.95,
        reasons: ["entity dissolved per Companies House"],
      }
    }

    if (chResult.found && chResult.status === "active") {
      // Step 2: Email domain match (with active CH confirmation)
      if (listing.websiteUrl && emailDomainMatches(request.claimEmail, listing.websiteUrl)) {
        return { action: "auto_approve", confidence: 0.95, tier: "claimed", verificationPoints: 5 }
      }
      // CH active but no domain match → manual review [AC-3]
      return {
        action: "queue_manual_review",
        confidence: 0.5,
        reasons: ["CH match but no domain confirmation"],
      }
    }

    // CH number provided but not found or unrecognised status → manual review
    return {
      action: "queue_manual_review",
      confidence: 0.4,
      reasons: ["CH number provided but lookup inconclusive"],
    }
  }

  // Step 3: No CH number — email domain match (freelancers + companies without CH) [AC-1]
  if (listing.websiteUrl && emailDomainMatches(request.claimEmail, listing.websiteUrl)) {
    return { action: "auto_approve", confidence: 0.9, tier: "claimed", verificationPoints: 5 }
  }

  // Step 4: No CH number + freelancer → manual review [AC-4]
  if (listing.entityType === "freelancer") {
    return {
      action: "queue_manual_review",
      confidence: 0.4,
      reasons: ["sole trader — no CH record, need alternative verification"],
    }
  }

  // Step 5: Fallback — queue for manual review
  return {
    action: "queue_manual_review",
    confidence: 0.5,
    reasons: ["insufficient automated verification evidence"],
  }
}

// Optimistic locking via conditional UPDATE [S3 §1.4, AC-5]
export async function acquireClaimLock(
  db: Db,
  listingId: string,
  expectedStatus: string,
  newStatus: string,
): Promise<boolean> {
  const result = await db.update(listings)
    .set({
      claimStatus: newStatus as typeof listings.$inferSelect.claimStatus,
      updatedAt: new Date(),
      // S9 §1.5: track when claim entered pending_review for abandonment check
      ...(newStatus === "pending_review" ? { claimSubmittedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(listings.id, listingId),
        eq(listings.claimStatus, expectedStatus as typeof listings.$inferSelect.claimStatus),
      ),
    )
    .returning({ id: listings.id })

  return result.length > 0
}

// Email domain comparison — S3 §1.3 [S3-ST-1, S3-ST-8]
// Case-insensitive, strips www. prefix. Static string comparison only.
export function emailDomainMatches(email: string, websiteUrl: string): boolean {
  const emailDomain = extractEmailDomain(email)
  const urlDomain = extractUrlDomain(websiteUrl)
  if (!emailDomain || !urlDomain) return false
  return emailDomain === urlDomain
}

function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  return stripWww(email.slice(at + 1).toLowerCase())
}

function extractUrlDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return stripWww(parsed.hostname.toLowerCase())
  } catch {
    return null
  }
}

function stripWww(domain: string): string {
  return domain.startsWith("www.") ? domain.slice(4) : domain
}
