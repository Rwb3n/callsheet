// Production DB adapters for injected interfaces.
// Thin wrappers over Drizzle queries — used by both production routes and test fixtures.

import { eq } from "drizzle-orm"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"

export function createSchedulerDb(db: Db): SchedulerDb {
  return {
    async insert(row) {
      const [created] = await db
        .insert(deferredActions)
        .values({
          action: row.action,
          params: row.params,
          executeAt: row.executeAt,
          retryPolicy: row.retryPolicy,
          onFailure: row.onFailure,
          createdBy: row.createdBy,
          status: row.status,
          attempts: row.attempts,
        })
        .returning({ id: deferredActions.id })
      return created.id
    },
    async cancelMatching() {
      return 0
    },
    async findPending(action) {
      const rows = await db
        .select()
        .from(deferredActions)
        .where(eq(deferredActions.action, action))
        .limit(1)
      return rows[0] ?? null
    },
  }
}

export function createDecisionLogDb(db: Db): DecisionLogDb {
  return {
    async insert(row) {
      const [created] = await db
        .insert(decisionLogs)
        .values({
          domain: row.domain,
          decisionType: row.decisionType,
          inputs: row.inputs,
          output: row.output,
          confidence: row.confidence,
          listingId: row.listingId,
          accountId: row.accountId,
          additionalContext: row.additionalContext,
        })
        .returning({ id: decisionLogs.id })
      return created.id
    },
    async findByDomainAndType(domain) {
      return db
        .select({ id: decisionLogs.id, domain: decisionLogs.domain, decisionType: decisionLogs.decisionType })
        .from(decisionLogs)
        .where(eq(decisionLogs.domain, domain))
    },
  }
}
