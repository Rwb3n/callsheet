// principal_briefing_generation ceremony handler — S9 §4.4, AC-55/56/64/65/69
// Monthly. Aggregates ceremony outputs, compiles Principal Operations Briefing,
// sends briefing email. Self-perpetuating deferred action pattern.

import "@/domains/intelligence/ceremony/email-templates"

import { eq, gte, and, desc, sql } from "drizzle-orm"
import {
  ceremonyRuns,
  learningHypotheses,
  principalBriefings,
} from "@/db/schema/intelligence"
import { decisionLogs } from "@/db/schema/shared"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentMonth,
  startOfMonth,
} from "@/domains/intelligence/ceremony/infrastructure"

export type PrincipalBriefingGenerationDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  emailService: EmailService
}

export function registerPrincipalBriefingGenerationHandler(
  registry: ActionHandlerRegistry,
  deps: PrincipalBriefingGenerationDeps,
): void {
  registry.register("principal_briefing_generation", async (_params) => {
    const ceremonyType = "principal_briefing" as const
    const hash = computeInputsHash({ month: currentMonth() })
    const nextRunAt = getNextRunDate(ceremonyType)
    const now = new Date()
    const periodStart = startOfMonth(now)
    const periodEnd = now

    // 1. Idempotency guard — AC-56
    const idem = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idem.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. AC-64: Aggregate outputs from all ceremony types that ran this month
    const monthRuns = await deps.db
      .select({
        id: ceremonyRuns.id,
        ceremonyType: ceremonyRuns.ceremonyType,
        startedAt: ceremonyRuns.startedAt,
        status: ceremonyRuns.status,
        outputs: ceremonyRuns.outputs,
        decisionsLogged: ceremonyRuns.decisionsLogged,
      })
      .from(ceremonyRuns)
      .where(
        and(
          gte(ceremonyRuns.startedAt, periodStart),
          eq(ceremonyRuns.status, "completed"),
        ),
      )
      .orderBy(ceremonyRuns.ceremonyType, desc(ceremonyRuns.startedAt))

    // Deduplicate: take latest run per ceremony_type
    const latestByCeremony = new Map<
      string,
      { status: string; outputs: Record<string, unknown> | null; decisionsLogged: number }
    >()
    for (const run of monthRuns) {
      if (!latestByCeremony.has(run.ceremonyType)) {
        latestByCeremony.set(run.ceremonyType, {
          status: run.status,
          outputs: run.outputs,
          decisionsLogged: run.decisionsLogged,
        })
      }
    }

    const ceremonies: Record<string, unknown> = {}
    for (const [type, data] of latestByCeremony.entries()) {
      ceremonies[type] = data
    }

    // 3. Query learning hypotheses
    const hypotheses = await deps.db
      .select()
      .from(learningHypotheses)

    const learningHypothesesMap: Record<string, unknown> = {}
    for (const h of hypotheses) {
      learningHypothesesMap[h.id] = {
        hypothesis: h.hypothesis,
        currentValue: h.currentValue,
        previousValue: h.previousValue,
        trend: h.trend,
        lastMeasuredAt: h.lastMeasuredAt,
      }
    }

    // 4. Count escalations — decisions with disposition = "escalate_to_principal" this period
    const [escalationCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisionLogs)
      .where(
        and(
          eq(decisionLogs.decisionType, "ceremony_outcome_evaluation"),
          gte(decisionLogs.createdAt, periodStart),
          sql`${decisionLogs.output}->>'disposition' = 'escalate_to_principal'`,
        ),
      )
    const escalationCount = escalationCountRow?.count ?? 0

    // 5. Build briefing content
    const briefingContent = {
      operationalHealth: {},
      revenueHealth: {},
      learningHypotheses: learningHypothesesMap,
      ceremonies,
      escalations: { count: escalationCount, critical: [] as unknown[] },
    }

    // 6. Log ceremony run — AC-69 (get the ID back)
    const ceremonyRunId = await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: {
        ceremoniesAggregated: latestByCeremony.size,
        escalationCount,
        hypothesesIncluded: hypotheses.length,
      },
      decisionsLogged: 0,
      nextScheduledAt: nextRunAt,
    })

    // 7. Insert into principal_briefings
    const [briefingRow] = await deps.db
      .insert(principalBriefings)
      .values({
        generatedAt: now,
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        content: briefingContent,
        ceremonyRunId,
      })
      .returning({ id: principalBriefings.id })

    // 8. AC-65: Send principal_briefing email
    await deps.emailService.send({
      to: "principal@callsheet.co.uk",
      template: "principal_briefing",
      data: {
        period: currentMonth(),
        activeListings: 0,
        escalationCount,
        pendingApprovals: 0,
      },
      category: "transactional",
    })

    // 9. Update sentAt on success
    await deps.db
      .update(principalBriefings)
      .set({ sentAt: new Date() })
      .where(eq(principalBriefings.id, briefingRow.id))

    // 10. Self-perpetuate — AC-55
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}
