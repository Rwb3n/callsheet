// Verification upgrade evaluation + application — S3 §7, AC-37 through AC-41
// claimed → verified path. Score: CH active (+1), trade body (+1), client credits (max +4). Threshold: 6.
// Portfolio review required at score >= 6. Calibration deferred to S9.

import { eq, and, sql } from "drizzle-orm"
import {
  listings,
  verifications,
  accreditations,
  credits,
} from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions"
import { logDecision } from "@/lib/decisions"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { TaskSpec } from "@/domains/operations/types"
import type { UpgradeDecision } from "./types"

type Listing = typeof listings.$inferSelect
type Verification = typeof verifications.$inferSelect

// --- Deps ---

export type EvaluateUpgradeDeps = {
  db: Db
  companiesHouse: CompaniesHouseService
}

export type ApplyUpgradeDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

// --- Score computation helpers [S3-ST-11] ---

export async function checkTradeBodyMembership(
  db: Db,
  listingId: string,
): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accreditations)
    .where(eq(accreditations.listingId, listingId))
  return result[0].count > 0
}

export async function countClientConfirmedCredits(
  db: Db,
  listingId: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(credits)
    .where(
      and(
        eq(credits.listingId, listingId),
        eq(credits.sourcingMethod, "client_confirmed"),
      ),
    )
  return result[0].count
}

// --- Missing checks guidance ---

function missingChecks(checks: {
  chActive: boolean
  tradeBody: boolean
  clientCredits: number
}): string[] {
  const missing: string[] = []
  if (!checks.chActive) missing.push("Add Companies House number for +1 point")
  if (!checks.tradeBody) missing.push("Add trade body membership for +1 point")
  if (checks.clientCredits < 2) missing.push("Get client-confirmed credits for up to +4 points")
  return missing
}

// --- Portfolio review TaskSpec [S7-ST-11] ---

export function buildPortfolioReviewTaskSpec(
  listing: { id: string; name: string },
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

// --- Core evaluation [AC-37, AC-38] ---

export async function evaluateVerificationUpgrade(
  listing: Listing,
  verification: Verification,
  deps: EvaluateUpgradeDeps,
): Promise<UpgradeDecision> {

  // AC-37: must be claimed tier
  if (verification.tier !== "claimed") {
    return { eligible: false, score: 0, threshold: 6, guidance: ["listing must be claimed first"] }
  }

  // Score computation [AC-38]
  const chActive = listing.companiesHouseNumber
    ? await deps.companiesHouse.lookup(listing.companiesHouseNumber).then(
        r => r.found && r.status === "active",
      )
    : false

  const tradeBody = await checkTradeBodyMembership(deps.db, listing.id)
  const clientCredits = await countClientConfirmedCredits(deps.db, listing.id)

  let score = 0
  if (chActive) score += 1
  if (tradeBody) score += 1
  score += Math.min(clientCredits * 2, 4)

  // AC-39: score >= 6 routes to portfolio review
  if (score >= 6) {
    return {
      eligible: "pending_human_review",
      taskSpec: buildPortfolioReviewTaskSpec(listing, score),
    }
  }

  return {
    eligible: false,
    score,
    threshold: 6,
    guidance: missingChecks({ chActive, tradeBody, clientCredits }),
  }
}

// --- Upgrade application [AC-40, AC-41] ---

export async function applyVerificationUpgrade(
  deps: ApplyUpgradeDeps,
  listingId: string,
  newTier: "verified",
  score: number,
): Promise<void> {
  // Read current tier
  const [current] = await deps.db
    .select()
    .from(verifications)
    .where(eq(verifications.listingId, listingId))

  const previousTier = current.tier

  // Update verification row
  await deps.db.update(verifications).set({
    tier: newTier,
    verifiedAt: new Date(),
    verificationScore: score,
    lastVerificationCheck: new Date(),
  }).where(eq(verifications.listingId, listingId))

  // AC-40: emit verification_tier_changed
  await deps.eventBus.emit("verification_tier_changed", {
    _brand: "VerificationTierChangedEvent" as const,
    listingId,
    previousTier,
    newTier,
  }, deps.waitUntilFn)

  // Quality score recalculation — S9 provides real implementation.
  // Pre-S9: no-op. Verification tier change picked up when S9 wires scoring dimensions.

  // AC-41: log decision
  await logDecision(deps.decisionLogDb, {
    domain: "data-and-listings",
    decisionType: "verification_upgrade",
    inputs: { listingId, previousTier, score },
    output: { action: "verification_upgrade", newTier },
    listingId,
  })
}
