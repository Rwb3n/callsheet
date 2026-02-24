// Claim-path progressive disclosure — S2 §7.2, AC-20, AC-49
// Same Day 1/3/7 pattern as standard path but with path="claim".
// NOT called during submitClaim — exported for S3's claim_approved handler [S2-ST-17].

import { scheduleDeferredAction } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler"

const DAY_MS = 24 * 60 * 60 * 1000

const CLAIM_SCHEDULE = [
  { dayOffset: 1, template: "profile_day1" },
  { dayOffset: 3, template: "profile_day3" },
  { dayOffset: 7, template: "profile_day7" },
] as const

const DAY_14_OFFSET = 14

export async function scheduleClaimProgressiveDisclosure(
  schedulerDb: SchedulerDb,
  params: { listingId: string; accountId: string },
  now?: Date,
): Promise<string[]> {
  const baseTime = now ?? new Date()
  const ids: string[] = []

  for (const entry of CLAIM_SCHEDULE) {
    const id = await scheduleDeferredAction(schedulerDb, {
      action: "send_progressive_email",
      params: {
        listingId: params.listingId,
        template: entry.template,
        accountId: params.accountId,
      },
      executeAt: new Date(baseTime.getTime() + entry.dayOffset * DAY_MS),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "onboarding_claim",
    })
    ids.push(id)
  }

  // Day 14 in-app prompt [AC-49, S2-ST-2]
  const day14Id = await scheduleDeferredAction(schedulerDb, {
    action: "onboarding_day14_prompt",
    params: {
      listingId: params.listingId,
      accountId: params.accountId,
    },
    executeAt: new Date(baseTime.getTime() + DAY_14_OFFSET * DAY_MS),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding_claim",
  })
  ids.push(day14Id)

  return ids
}
