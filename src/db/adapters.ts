// Production DB adapters for injected interfaces.
// Thin wrappers over Drizzle queries — used by both production routes and test fixtures.

import { eq, and, sql } from "drizzle-orm"
import { deferredActions, decisionLogs, orchestratedFlows } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import { DrizzleNotificationDb } from "@/lib/notifications/drizzle-notification-db"
import type { FlowDb } from "@/lib/flows"
import type { FlowRow, OrchestratedFlowStep } from "@/lib/flows"

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
    async cancelMatching(action, filterParams, cancelledBy, cancelledAt) {
      // Match pending actions by action type + JSONB params containment
      const result = await db
        .update(deferredActions)
        .set({
          status: "cancelled",
          cancelledBy,
          cancelledAt,
        })
        .where(
          and(
            eq(deferredActions.action, action),
            eq(deferredActions.status, "pending"),
            sql`${deferredActions.params} @> ${JSON.stringify(filterParams)}::jsonb`,
          ),
        )
        .returning({ id: deferredActions.id })
      return result.length
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

export function createNotificationDb(db: Db): NotificationDb {
  return new DrizzleNotificationDb(db)
}

export function createFlowDb(db: Db): FlowDb {
  return {
    async insert(row) {
      const [created] = await db
        .insert(orchestratedFlows)
        .values({
          flowType: row.flowType,
          triggeredBy: row.triggeredBy,
          status: row.status,
          steps: row.steps as unknown as Record<string, unknown>[],
          currentStep: row.currentStep,
          context: row.context,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          deadline: row.deadline,
          escalatedAt: row.escalatedAt,
          escalationReason: row.escalationReason,
        })
        .returning({ id: orchestratedFlows.id })
      return created.id
    },
    async update(id, fields) {
      const set: Record<string, unknown> = {}
      if (fields.flowType !== undefined) set.flowType = fields.flowType
      if (fields.triggeredBy !== undefined) set.triggeredBy = fields.triggeredBy
      if (fields.status !== undefined) set.status = fields.status
      if (fields.steps !== undefined) set.steps = fields.steps
      if (fields.currentStep !== undefined) set.currentStep = fields.currentStep
      if (fields.context !== undefined) set.context = fields.context
      if (fields.completedAt !== undefined) set.completedAt = fields.completedAt
      if (fields.deadline !== undefined) set.deadline = fields.deadline
      if (fields.escalatedAt !== undefined) set.escalatedAt = fields.escalatedAt
      if (fields.escalationReason !== undefined) set.escalationReason = fields.escalationReason
      if (fields.updatedAt !== undefined) set.updatedAt = fields.updatedAt
      await db
        .update(orchestratedFlows)
        .set(set)
        .where(eq(orchestratedFlows.id, id))
    },
    async findById(id) {
      const [row] = await db
        .select()
        .from(orchestratedFlows)
        .where(eq(orchestratedFlows.id, id))
        .limit(1)
      if (!row) return null
      return {
        id: row.id,
        flowType: row.flowType,
        triggeredBy: row.triggeredBy,
        status: row.status,
        steps: row.steps as unknown as OrchestratedFlowStep[],
        currentStep: row.currentStep,
        context: row.context as Record<string, unknown>,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        deadline: row.deadline,
        escalatedAt: row.escalatedAt,
        escalationReason: row.escalationReason,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies FlowRow
    },
  }
}
