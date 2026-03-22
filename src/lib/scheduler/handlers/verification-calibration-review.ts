// verification_calibration_review deferred action handler — S9 §4.1
// Quarterly ceremony: reviews claim evaluation accuracy, recommends threshold adjustments.
// AC-59: prerequisite check on claim_evaluation decision logs.

import { eq, and, gte, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { verifications } from "@/db/schema/data-and-listings"
import { decisionLogs } from "@/db/schema/shared"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  evaluateCeremonyOutcome,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentQuarter,
  startOfQuarter,
} from "@/domains/intelligence/ceremony/infrastructure"

const VERIFICATION_ACCURACY_TIGHTEN = 0.90
const VERIFICATION_ACCURACY_LOOSEN = 0.98

export type VerificationCalibrationReviewDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerVerificationCalibrationReviewHandler(
  registry: ActionHandlerRegistry,
  deps: VerificationCalibrationReviewDeps,
): void {
  registry.register("verification_calibration_review", async (_params) => {
    const ceremonyType = "verification_calibration" as const
    const hash = computeInputsHash({ quarter: currentQuarter() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard
    const idempotency = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idempotency.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. Prerequisite: claim_evaluation decisions this quarter — AC-59
    const quarterStart = startOfQuarter(new Date())
    const claimDecisions = await deps.db
      .select({
        id: decisionLogs.id,
        inputs: decisionLogs.inputs,
        output: decisionLogs.output,
      })
      .from(decisionLogs)
      .where(
        and(
          eq(decisionLogs.decisionType, "claim_evaluation"),
          gte(decisionLogs.createdAt, quarterStart),
        ),
      )

    if (claimDecisions.length === 0) {
      // Pattern #15: insufficient_data early return
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: { status: "insufficient_data", reason: "no claim_evaluation decision logs this quarter" },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 3. Classify decisions
    const totalClaims = claimDecisions.length
    const autoApproved: Array<{ listingId: string }> = []
    let manualReviewCount = 0

    for (const decision of claimDecisions) {
      const output = decision.output as Record<string, unknown>
      const inputs = decision.inputs as Record<string, unknown>

      if (output.action === "auto_approve") {
        const listingId = inputs.listingId as string | undefined
        if (listingId) {
          autoApproved.push({ listingId })
        }
      } else if (
        output.action === "queue_manual_review" ||
        output.action === "queue_dispute_resolution"
      ) {
        manualReviewCount++
      }
    }

    // 4. Compute accuracy: check if auto-approved listings are still verified
    let stillVerifiedCount = 0
    for (const item of autoApproved) {
      const [verification] = await deps.db
        .select({ tier: verifications.tier })
        .from(verifications)
        .where(eq(verifications.listingId, item.listingId))
        .limit(1)

      if (
        verification &&
        (verification.tier === "claimed" ||
          verification.tier === "verified" ||
          verification.tier === "premium_verified")
      ) {
        stillVerifiedCount++
      }
    }

    const autoApproveCount = autoApproved.length
    const autoApproveAccuracy = autoApproveCount > 0
      ? stillVerifiedCount / autoApproveCount
      : 1.0

    // False positive rate: auto-approved but no longer verified
    const falsePositiveRate = autoApproveCount > 0
      ? (autoApproveCount - stillVerifiedCount) / autoApproveCount
      : 0

    // False negative rate approximation: manual reviews relative to total
    // (simplified — true false negative detection requires ground truth)
    const falseNegativeRate = totalClaims > 0
      ? manualReviewCount / totalClaims
      : 0

    // 5. Evaluate calibration recommendations
    let decisionsLogged = 0
    let recommendation: string | null = null

    if (autoApproveAccuracy < VERIFICATION_ACCURACY_TIGHTEN) {
      recommendation = "tighten"
      await evaluateCeremonyOutcome(deps.decisionLogDb, {
        ceremonyType,
        recommendation: {
          action: "tighten_auto_approve_threshold",
          hasFinancialImpact: false,
          hasUserVisibleChange: true,
          precedentExists: false,
        },
      })
      decisionsLogged += 1
    } else if (autoApproveAccuracy > VERIFICATION_ACCURACY_LOOSEN) {
      recommendation = "loosen"
      await evaluateCeremonyOutcome(deps.decisionLogDb, {
        ceremonyType,
        recommendation: {
          action: "loosen_auto_approve_threshold",
          hasFinancialImpact: false,
          hasUserVisibleChange: true,
          precedentExists: false,
        },
      })
      decisionsLogged += 1
    }

    // 6. Build report
    const report = {
      totalClaims,
      autoApproveCount,
      manualReviewCount,
      stillVerifiedCount,
      autoApproveAccuracy,
      falsePositiveRate,
      falseNegativeRate,
      recommendation,
    }

    // 7. Log ceremony run and schedule next
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged,
      nextScheduledAt: nextRunAt,
    })
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
