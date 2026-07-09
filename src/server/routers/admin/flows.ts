// Admin flows router — S7 §6, CS-WORK-061, CS-WORK-091
// 7 routes: list, getDetail, retryStep, skipStep, escalate, initiateErasure, initiateClosureForAccount
// All adminProcedure.

import { z } from "zod"
import { eq, sql, and, desc, asc, inArray, ne } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { FlowDb } from "@/lib/flows"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { ObjectStorageService } from "@/lib/storage/types"
import type { PaymentService } from "@/lib/services/types"
import { logDecision } from "@/lib/decisions/logger"
import { createNotification } from "@/lib/notifications"
import { orchestratedFlows } from "@/db/schema/shared"
import { complianceRegister } from "@/db/schema/operations"
import { initiateErasureFlow, initiateAccountClosure, resumeFlow, buildErasureSteps, buildClosureSteps } from "@/lib/flows"
import type { OrchestratedFlowStep, FlowStepDefinition } from "@/lib/flows"

export type AdminFlowsRouterDeps = {
  db: Db
  flowDb: FlowDb
  decisionLogDb: DecisionLogDb
  notificationDb: NotificationDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
  storage: ObjectStorageService
  payment: PaymentService
}

// Skip constraint matrix — SI §3.5, S7 §6.4
// false = CANNOT SKIP (5 steps total)
const SKIP_CONSTRAINTS: Record<string, Record<string, boolean>> = {
  erasure: {
    "verify_identity": false,
    "extract_account_data": true,
    "close_active_tickets": true,
    "process_erasure": false,
    "close_dsar_case": false,
    "emit_erasure_completed": true,
  },
  closure: {
    "archive_listings": false,
    "cancel_paddle_subscriptions": true,
    "anonymise_enquiry_data": true,
    "delete_defer_buyer_data": true,
    "deactivate_account": false,
    "emit_account_closed": true,
  },
}

function isStepSkippable(flowType: string, stepName: string): boolean {
  const matrix = SKIP_CONSTRAINTS[flowType]
  if (!matrix) return true
  return matrix[stepName] ?? true
}

// Reconstructs step definitions for a flow type. Add new flow types here when
// the flowTypeEnum is extended. The pgEnum constraint prevents unknown types from
// being stored, but this function must match all enum values for retry to work.
function buildStepDefinitions(flowType: string, deps: AdminFlowsRouterDeps): FlowStepDefinition[] | null {
  if (flowType === "erasure") {
    return buildErasureSteps({ db: deps.db, flowDb: deps.flowDb, bus: deps.bus, waitUntilFn: deps.waitUntilFn, schedulerDb: deps.schedulerDb, storage: deps.storage }) as FlowStepDefinition[]
  }
  if (flowType === "closure") {
    return buildClosureSteps({ db: deps.db, flowDb: deps.flowDb, bus: deps.bus, waitUntilFn: deps.waitUntilFn, payment: deps.payment, schedulerDb: deps.schedulerDb }) as FlowStepDefinition[]
  }
  return null
}

const flowListInput = z.object({
  flowType: z.enum(["erasure", "closure"]).optional(),
  status: z.enum(["initiated", "in_progress", "completed", "failed", "escalated"]).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["deadline", "started_at", "updated_at"]).default("started_at"),
})

export function createAdminFlowsRouter(deps: AdminFlowsRouterDeps) {
  return router({
    // AC-6.1: filtered by flowType and status, sorted, cursor-based pagination
    list: adminProcedure
      .input(flowListInput)
      .query(async ({ input }) => {
        const conditions = []
        if (input.flowType) {
          conditions.push(eq(orchestratedFlows.flowType, input.flowType))
        }
        if (input.status) {
          conditions.push(eq(orchestratedFlows.status, input.status))
        }

        const sortColumn = input.sort === "deadline"
          ? orchestratedFlows.deadline
          : input.sort === "updated_at"
            ? orchestratedFlows.updatedAt
            : orchestratedFlows.startedAt

        if (input.cursor) {
          conditions.push(sql`${sortColumn} < ${input.cursor}`)
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const rows = await deps.db
          .select({
            flowId: orchestratedFlows.id,
            flowType: orchestratedFlows.flowType,
            status: orchestratedFlows.status,
            currentStep: orchestratedFlows.currentStep,
            totalSteps: sql<number>`jsonb_array_length(${orchestratedFlows.steps})`,
            startedAt: orchestratedFlows.startedAt,
            updatedAt: orchestratedFlows.updatedAt,
            deadline: orchestratedFlows.deadline,
            daysRemaining: sql<number | null>`
              CASE WHEN ${orchestratedFlows.deadline} IS NOT NULL
                THEN EXTRACT(EPOCH FROM (${orchestratedFlows.deadline} - now())) / 86400
                ELSE NULL
              END
            `,
          })
          .from(orchestratedFlows)
          .where(whereClause)
          .orderBy(desc(sortColumn))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const flows = rows.slice(0, input.limit).map((r) => ({
          flowId: r.flowId,
          flowType: r.flowType,
          status: r.status,
          currentStep: r.currentStep,
          totalSteps: parseInt(String(r.totalSteps), 10),
          startedAt: r.startedAt.toISOString(),
          updatedAt: r.updatedAt?.toISOString() ?? null,
          deadline: r.deadline?.toISOString() ?? null,
          // AC-6.2: daysRemaining computed, null for closure flows
          daysRemaining: r.daysRemaining != null
            ? Math.round(parseFloat(String(r.daysRemaining)) * 10) / 10
            : null,
        }))

        const cursorField = input.sort === "deadline" ? "deadline"
          : input.sort === "updated_at" ? "updatedAt"
          : "startedAt"

        return {
          flows,
          nextCursor: hasMore
            ? flows[flows.length - 1]?.[cursorField] ?? undefined
            : undefined,
        }
      }),

    // AC-6.3: flow detail with step progress
    getDetail: adminProcedure
      .input(z.object({ flowId: z.string().uuid() }))
      .query(async ({ input }) => {
        const row = await deps.flowDb.findById(input.flowId)
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Flow not found" })
        }

        const steps = row.steps as OrchestratedFlowStep[]
        const totalSteps = steps.length

        return {
          flowId: row.id,
          flowType: row.flowType,
          status: row.status,
          currentStep: row.currentStep,
          totalSteps,
          startedAt: row.startedAt.toISOString(),
          updatedAt: row.updatedAt?.toISOString() ?? null,
          deadline: row.deadline?.toISOString() ?? null,
          daysRemaining: row.deadline
            ? Math.round(((row.deadline.getTime() - Date.now()) / 86400000) * 10) / 10
            : null,
          triggeredBy: row.triggeredBy,
          completedAt: row.completedAt?.toISOString() ?? null,
          escalatedAt: row.escalatedAt?.toISOString() ?? null,
          escalationReason: row.escalationReason,
          steps: steps.map((s) => ({
            name: s.name,
            domain: s.domain,
            status: s.status,
            attempt: s.attempt,
            completedAt: s.completedAt ?? null,
            error: s.error ?? null,
            retryable: s.retryable,
            skippable: isStepSkippable(row.flowType, s.name),
            skipReason: s.skipReason ?? null,
            skippedBy: s.skippedBy ?? null,
          })),
        }
      }),

    // AC-6.4: retry re-executes failed step via resumeFlow()
    retryStep: adminProcedure
      .input(z.object({ flowId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const row = await deps.flowDb.findById(input.flowId)
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Flow not found" })
        }
        if (row.status !== "failed") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Flow is not in failed state" })
        }

        if (row.currentStep >= row.steps.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "currentStep out of bounds — flow data may be corrupted" })
        }

        const currentStep = row.steps[row.currentStep]

        // Reconstruct step definitions based on flow type
        const stepDefs = buildStepDefinitions(row.flowType, deps)
        if (!stepDefs) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown flow type: ${row.flowType}` })
        }

        // AC-6.10: decision log for retry (logged before execution so it persists even if step fails again)
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "flow_step_retry",
          inputs: { flowId: input.flowId, stepName: currentStep.name, attempt: currentStep.attempt + 1 },
          output: { action: "retry_initiated" },
          accountId: ctx.session!.accountId,
        })

        // resumeFlow() handles state transitions (in_progress, attempt increment) and executes from currentStep
        const result = await resumeFlow(deps.flowDb, input.flowId, stepDefs)

        return { flowId: result.flowId, status: result.status }
      }),

    // AC-6.5, AC-6.6, AC-6.7: skip with constraint enforcement
    skipStep: adminProcedure
      .input(z.object({
        flowId: z.string().uuid(),
        reason: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const row = await deps.flowDb.findById(input.flowId)
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Flow not found" })
        }

        const steps = [...row.steps] as OrchestratedFlowStep[]
        const currentStep = steps[row.currentStep]

        // AC-6.6: skip constraint enforcement — FORBIDDEN for non-skippable
        if (!isStepSkippable(row.flowType, currentStep.name)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Step is not skippable: ${currentStep.name}`,
          })
        }

        // AC-6.7: reason must be non-empty
        if (!input.reason.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Skip reason is required",
          })
        }

        // Apply skip
        steps[row.currentStep] = {
          ...currentStep,
          status: "skipped",
          skipReason: input.reason,
          skippedBy: ctx.session!.accountId,
        }

        // Advance flow
        const nextStepIndex = row.currentStep + 1
        const isLastStep = nextStepIndex >= steps.length

        await deps.flowDb.update(row.id, {
          steps,
          currentStep: isLastStep ? row.currentStep : nextStepIndex,
          status: isLastStep ? "completed" : "in_progress",
          completedAt: isLastStep ? new Date() : null,
          updatedAt: new Date(),
        })

        // AC-6.10: decision log for skip
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "flow_step_skip",
          inputs: { flowId: input.flowId, stepName: currentStep.name, flowType: row.flowType },
          output: { action: "skipped", reason: input.reason, skippedBy: ctx.session!.accountId },
          accountId: ctx.session!.accountId,
        })
      }),

    // AC-6.8: escalate sets flow to escalated, creates notification
    escalate: adminProcedure
      .input(z.object({
        flowId: z.string().uuid(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const row = await deps.flowDb.findById(input.flowId)
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Flow not found" })
        }

        const steps = row.steps as OrchestratedFlowStep[]
        const currentStepName = steps[row.currentStep]?.name ?? "unknown"

        await deps.flowDb.update(row.id, {
          status: "escalated",
          escalatedAt: new Date(),
          escalationReason: input.reason,
          updatedAt: new Date(),
        })

        // Create notification for principal — reuses compliance_deadline type [D4]
        await createNotification(deps.notificationDb, {
          accountId: ctx.session!.accountId,
          type: "compliance_deadline",
          title: `Orchestrated flow escalated: ${row.flowType}`,
          body: input.reason,
          link: `/admin/flows/${row.id}`,
        })

        // AC-6.10: decision log for escalation
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "flow_escalation",
          inputs: { flowId: input.flowId, flowType: row.flowType },
          output: { action: "escalated", reason: input.reason, escalatedBy: ctx.session!.accountId },
          accountId: ctx.session!.accountId,
        })
      }),

    // CS-WORK-091 AC-1, AC-2, AC-4, AC-6, AC-7: admin-initiated GDPR erasure flow
    initiateErasure: adminProcedure
      .input(z.object({
        dsarCaseId: z.string().uuid(),
        accountId: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // AC-2: validate DSAR case exists and is open/in_progress
        const [dsarCase] = await deps.db
          .select({
            id: complianceRegister.id,
            accountId: complianceRegister.accountId,
            status: complianceRegister.status,
          })
          .from(complianceRegister)
          .where(
            and(
              eq(complianceRegister.id, input.dsarCaseId),
              inArray(complianceRegister.status, ["open", "in_progress"]),
            ),
          )

        if (!dsarCase) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DSAR case not found or not in open/in_progress status",
          })
        }

        // AC-6: validate accountId matches DSAR case
        if (dsarCase.accountId !== input.accountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "accountId does not match the DSAR case",
          })
        }

        // AC-7: check for existing non-terminal erasure flow
        const [existingFlow] = await deps.db
          .select({ id: orchestratedFlows.id })
          .from(orchestratedFlows)
          .where(
            and(
              eq(orchestratedFlows.flowType, "erasure"),
              eq(orchestratedFlows.triggeredBy, input.accountId),
              inArray(orchestratedFlows.status, ["initiated", "in_progress"]),
            ),
          )
          .limit(1)

        if (existingFlow) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An active erasure flow already exists for this account",
          })
        }

        // AC-1: initiate the flow
        const result = await initiateErasureFlow(
          {
            db: deps.db,
            flowDb: deps.flowDb,
            bus: deps.bus,
            waitUntilFn: deps.waitUntilFn,
            schedulerDb: deps.schedulerDb,
            storage: deps.storage,
          },
          input.dsarCaseId,
          input.accountId,
        )

        // AC-4: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "flow_initiation",
          inputs: { flowType: "erasure", dsarCaseId: input.dsarCaseId, accountId: input.accountId },
          output: { flowId: result.flowId, status: result.status },
          accountId: ctx.session!.accountId,
        })

        return { flowId: result.flowId, status: result.status }
      }),

    // CS-WORK-091 AC-3, AC-4, AC-7: admin-initiated account closure flow
    initiateClosureForAccount: adminProcedure
      .input(z.object({
        accountId: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // AC-7: check for existing non-terminal closure flow
        const [existingFlow] = await deps.db
          .select({ id: orchestratedFlows.id })
          .from(orchestratedFlows)
          .where(
            and(
              eq(orchestratedFlows.flowType, "closure"),
              eq(orchestratedFlows.triggeredBy, input.accountId),
              inArray(orchestratedFlows.status, ["initiated", "in_progress"]),
            ),
          )
          .limit(1)

        if (existingFlow) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An active closure flow already exists for this account",
          })
        }

        // AC-3: initiate the flow
        const result = await initiateAccountClosure(
          {
            db: deps.db,
            flowDb: deps.flowDb,
            bus: deps.bus,
            waitUntilFn: deps.waitUntilFn,
            payment: deps.payment,
            schedulerDb: deps.schedulerDb,
          },
          input.accountId,
        )

        // AC-4: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "flow_initiation",
          inputs: { flowType: "closure", accountId: input.accountId },
          output: { flowId: result.flowId, status: result.status },
          accountId: ctx.session!.accountId,
        })

        return { flowId: result.flowId, status: result.status }
      }),
  })
}
