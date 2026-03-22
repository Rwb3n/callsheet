// Low-quality intervention — S8 §7, AC-50, AC-51
// Creates notification + schedules 30-day quality re-check for paid listings below quality 40.

import type { NotificationDb } from "@/lib/notifications"
import type { SchedulerDb } from "@/lib/scheduler"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications/notifications"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"

export type LowQualityInterventionInput = {
  listingId: string
  accountId: string
  currentComposite: number
  subscriptionTier: string
}

export type LowQualityInterventionDeps = {
  notificationDb: NotificationDb
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export async function triggerLowQualityIntervention(
  input: LowQualityInterventionInput,
  deps: LowQualityInterventionDeps,
): Promise<void> {
  // 1. Create notification
  await createNotification(deps.notificationDb, {
    accountId: input.accountId,
    type: "quality_score_changed",
    title: "Your listing quality needs attention",
    body:
      `Your quality score dropped to ${input.currentComposite}. ` +
      `Improve it to maintain visibility and ranking benefits.`,
    link: `/dashboard/listings/${input.listingId}/quality`,
  })

  // 2. Schedule 30-day quality re-check
  const executeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await scheduleDeferredAction(deps.schedulerDb, {
    action: "check_quality_improvement",
    params: {
      listingId: input.listingId,
      baselineScore: input.currentComposite,
    },
    executeAt,
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "commercial",
  })

  // 3. Log decision
  await logDecision(deps.decisionLogDb, {
    domain: "commercial",
    decisionType: "churn_intervention",
    inputs: {
      subType: "low_quality_intervention",
      listingId: input.listingId,
      currentComposite: input.currentComposite,
      subscriptionTier: input.subscriptionTier,
    },
    output: {
      action: "intervention_triggered",
      baselineScore: input.currentComposite,
    },
    listingId: input.listingId,
    accountId: input.accountId,
  })
}
