// article_14_progress_check handler — S2 §6.5, §12, AC-42, AC-44
// Self-perpetuating daily check: computes Article 14 email send progress,
// alerts principal if <80% sent by day 20.

import { eq, and, sql } from "drizzle-orm"
import { listings } from "@/db/schema/data-and-listings"
import { correspondenceLog } from "@/db/schema/correspondence"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { AlertPrincipalFn } from "@/lib/scheduler/types"

const ALERT_THRESHOLD_PERCENT = 80
const ALERT_THRESHOLD_DAY = 20
const COMPLIANCE_DEADLINE_DAYS = 30
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type Article14Progress = {
  totalWithEmail: number
  sent: number
  percentSent: number
  daysElapsed: number
  shouldAlert: boolean
}

export function computeArticle14Progress(
  totalWithEmail: number,
  sent: number,
  importDate: string,
  now: Date,
): Article14Progress {
  const elapsed = now.getTime() - new Date(importDate).getTime()
  const daysElapsed = Math.floor(elapsed / ONE_DAY_MS)
  const percentSent = totalWithEmail === 0 ? 100 : Math.round((sent / totalWithEmail) * 100)
  const shouldAlert = daysElapsed >= ALERT_THRESHOLD_DAY && percentSent < ALERT_THRESHOLD_PERCENT

  return { totalWithEmail, sent, percentSent, daysElapsed, shouldAlert }
}

export function registerArticle14ProgressHandler(
  registry: ActionHandlerRegistry,
  deps: {
    db: Db
    schedulerDb: SchedulerDb
    decisionDb: DecisionLogDb
    alertPrincipal: AlertPrincipalFn
  },
): void {
  registry.register("article_14_progress_check", async (params) => {
    const { importBatchId, importDate } = params
    const now = new Date()

    // Count total 4rfv listings with contact email
    const [totalRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          eq(listings.source, importBatchId),
          sql`${listings.contactEmail} IS NOT NULL`,
        ),
      )
    const totalWithEmail = totalRow?.count ?? 0

    // Count successfully sent Article 14 emails via correspondence log
    const [sentRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(correspondenceLog)
      .where(
        and(
          eq(correspondenceLog.templateId, "article_14_notice"),
          sql`${correspondenceLog.status} NOT IN ('bounced', 'failed', 'suppressed')`,
        ),
      )
    const sent = sentRow?.count ?? 0

    const progress = computeArticle14Progress(totalWithEmail, sent, importDate, now)

    // AC-42: alert principal if behind schedule
    if (progress.shouldAlert) {
      await deps.alertPrincipal(
        "article_14_progress_check",
        importBatchId,
        `Article 14 compliance behind schedule: ${progress.percentSent}% sent by day ${progress.daysElapsed} (target: ${ALERT_THRESHOLD_PERCENT}% by day ${ALERT_THRESHOLD_DAY})`,
      )
    }

    // Log progress as decision for audit trail
    await logDecision(deps.decisionDb, {
      domain: "operations",
      decisionType: "article_14_progress_check",
      inputs: {
        importBatchId,
        importDate,
        daysElapsed: progress.daysElapsed,
        totalWithEmail: progress.totalWithEmail,
        sent: progress.sent,
        percentSent: progress.percentSent,
      },
      output: {
        shouldAlert: progress.shouldAlert,
        withinDeadline: progress.daysElapsed < COMPLIANCE_DEADLINE_DAYS,
      },
    })

    // Self-perpetuating: re-schedule if within compliance deadline [S0 §3.2]
    if (progress.daysElapsed < COMPLIANCE_DEADLINE_DAYS) {
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "article_14_progress_check",
        params: { importBatchId, importDate },
        executeAt: new Date(now.getTime() + ONE_DAY_MS),
        retryPolicy: "once",
        onFailure: "alert_principal",
        createdBy: "article_14_progress_handler",
      })
    }
  })
}
