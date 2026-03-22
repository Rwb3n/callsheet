// compliance_self_audit handler — S7 §5.5, CS-WORK-060 AC-5.4
// Daily recurring. Checks data retention, GDPR register completeness, DSAR status.
// Escalates on failure. Self-perpetuates with 24h delay.

import { and, eq, sql, inArray, isNotNull, lt } from "drizzle-orm"
import { complianceRegister } from "@/db/schema/operations"
import { deferredActions } from "@/db/schema/shared"
import { listings } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

export function registerComplianceSelfAuditHandler(
  registry: ActionHandlerRegistry,
  deps: {
    db: Db
    schedulerDb: SchedulerDb
    decisionLogDb: DecisionLogDb
    notificationDb: NotificationDb
    adminAccountId: string
  },
): void {
  registry.register("compliance_self_audit", async () => {
    const now = new Date()
    const failures: string[] = []

    // 1. Data retention policy check — verify search_history_cleanup ran within last 48h
    const fortyEightAgo = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS)
    const [lastCleanup] = await deps.db
      .select({ completedAt: deferredActions.completedAt })
      .from(deferredActions)
      .where(
        and(
          eq(deferredActions.action, "search_history_cleanup"),
          eq(deferredActions.status, "completed"),
        ),
      )
      .orderBy(sql`${deferredActions.completedAt} DESC NULLS LAST`)
      .limit(1)

    if (!lastCleanup?.completedAt || lastCleanup.completedAt < fortyEightAgo) {
      failures.push("search_history_cleanup has not run in 48h")
    }

    // 2. GDPR register completeness — seeded listings (source = '4rfv_import') should have Article 14 records
    const [seededWithoutNotice] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(
        and(
          eq(listings.source, "4rfv_import"),
          sql`${listings.lifecycleStatus} != 'archived'`,
          sql`NOT EXISTS (
            SELECT 1 FROM compliance_register cr
            WHERE cr.type = 'article_14'
              AND cr.details->>'listingId' = ${listings.id}::text
          )`,
        ),
      )

    if (seededWithoutNotice && seededWithoutNotice.count > 0) {
      failures.push(`${seededWithoutNotice.count} seeded listings missing Article 14 records`)
    }

    // 3. Active DSAR deadline check — DSARs with < 5 days remaining and status still 'open'
    const fiveDaysAhead = new Date(now.getTime() + FIVE_DAYS_MS)
    const [urgentDSARs] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(complianceRegister)
      .where(
        and(
          eq(complianceRegister.type, "dsar"),
          eq(complianceRegister.status, "open"),
          isNotNull(complianceRegister.deadline),
          lt(complianceRegister.deadline, fiveDaysAhead),
        ),
      )

    if (urgentDSARs && urgentDSARs.count > 0) {
      failures.push(`${urgentDSARs.count} DSARs approaching deadline without in_progress status`)
    }

    // Log results
    await logDecision(deps.decisionLogDb, {
      domain: "operations",
      decisionType: "compliance_self_audit",
      inputs: { checksRun: 3 },
      output: { failures, passed: failures.length === 0 },
    })

    // Escalate on failure
    if (failures.length > 0) {
      await createNotification(deps.notificationDb, {
        accountId: deps.adminAccountId,
        type: "compliance_deadline",
        title: "Compliance self-audit failures detected",
        body: failures.join("; "),
      })
    }

    // Self-perpetuate
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "compliance_self_audit",
      params: {},
      executeAt: new Date(now.getTime() + TWENTY_FOUR_HOURS_MS),
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      createdBy: "compliance_self_audit.self_perpetuate",
    })
  })
}
