// Admin tasks router — CS-WORK-098
// 4 routes: list, getDetail, create, updateStatus
// All adminProcedure.

import { z } from "zod"
import { eq, and, desc, lte } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { taskSpecs } from "@/db/schema/operations"

export type AdminTasksRouterDeps = {
  db: Db
}

const taskListInput = z.object({
  domain: z.enum(["verification", "support", "moderation", "compliance", "data_maintenance", "outreach"]).optional(),
  status: z.enum(["pending", "assigned", "in_progress", "completed", "timed_out", "re_routed"]).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

const taskCreateInput = z.object({
  domain: z.enum(["verification", "support", "moderation", "compliance", "data_maintenance", "outreach"]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  task: z.string().min(1).max(500),
  context: z.record(z.string(), z.unknown()),
  checklist: z.array(z.string()),
  acceptanceCriteria: z.string().min(1).max(2000),
  estimatedTime: z.string().min(1).max(100),
  deadline: z.string().datetime().optional(),
  timeout: z.number().int().min(1),
  escalation: z.string().min(1).max(500),
  requiredSkills: z.array(z.string()),
  dataAccessScope: z.object({ tables: z.array(z.string()), filter: z.string().optional() }),
  learningCapture: z.object({ captureFields: z.array(z.string()), feedbackLoop: z.string().optional() }),
  maxReroutes: z.number().int().min(0),
})

const taskUpdateStatusInput = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["pending", "assigned", "in_progress", "completed", "timed_out", "re_routed"]),
  result: z.record(z.string(), z.unknown()).optional(),
})

export function createAdminTasksRouter(deps: AdminTasksRouterDeps) {
  return router({
    // AC-1: paginated list with filters
    list: adminProcedure
      .input(taskListInput)
      .query(async ({ input }) => {
        const conditions = []

        if (input.domain) {
          conditions.push(eq(taskSpecs.domain, input.domain))
        }
        if (input.status) {
          conditions.push(eq(taskSpecs.status, input.status))
        }
        if (input.priority) {
          conditions.push(eq(taskSpecs.priority, input.priority))
        }
        if (input.cursor) {
          conditions.push(lte(taskSpecs.createdAt, new Date(input.cursor)))
        }

        const rows = await deps.db
          .select()
          .from(taskSpecs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(taskSpecs.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const items = rows.slice(0, input.limit).map(toDto)

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].createdAt : undefined,
        }
      }),

    // AC-2: full task detail
    getDetail: adminProcedure
      .input(z.object({ taskId: z.string().uuid() }))
      .query(async ({ input }) => {
        const [row] = await deps.db
          .select()
          .from(taskSpecs)
          .where(eq(taskSpecs.id, input.taskId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" })
        }

        return toDto(row)
      }),

    // AC-3: create a task
    create: adminProcedure
      .input(taskCreateInput)
      .mutation(async ({ input }) => {
        const [created] = await deps.db
          .insert(taskSpecs)
          .values({
            domain: input.domain,
            priority: input.priority,
            task: input.task,
            context: input.context,
            checklist: input.checklist,
            acceptanceCriteria: input.acceptanceCriteria,
            estimatedTime: input.estimatedTime,
            deadline: input.deadline ? new Date(input.deadline) : null,
            timeout: input.timeout,
            escalation: input.escalation,
            requiredSkills: input.requiredSkills,
            dataAccessScope: input.dataAccessScope,
            learningCapture: input.learningCapture,
            maxReroutes: input.maxReroutes,
          })
          .returning({ id: taskSpecs.id })

        return { taskId: created.id }
      }),

    // AC-4: update task status
    updateStatus: adminProcedure
      .input(taskUpdateStatusInput)
      .mutation(async ({ input }) => {
        const [row] = await deps.db
          .select({ id: taskSpecs.id })
          .from(taskSpecs)
          .where(eq(taskSpecs.id, input.taskId))
          .limit(1)

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" })
        }

        const updates: Record<string, unknown> = { status: input.status }
        if (input.status === "completed") {
          updates.completedAt = new Date()
          if (input.result) updates.result = input.result
        }

        await deps.db
          .update(taskSpecs)
          .set(updates)
          .where(eq(taskSpecs.id, input.taskId))

        return { taskId: input.taskId, status: input.status }
      }),
  })
}

function toDto(row: typeof taskSpecs.$inferSelect) {
  return {
    id: row.id,
    domain: row.domain,
    priority: row.priority,
    status: row.status,
    task: row.task,
    context: row.context,
    checklist: row.checklist,
    acceptanceCriteria: row.acceptanceCriteria,
    estimatedTime: row.estimatedTime,
    deadline: row.deadline?.toISOString() ?? null,
    timeout: row.timeout,
    escalation: row.escalation,
    requiredSkills: row.requiredSkills,
    dataAccessScope: row.dataAccessScope,
    learningCapture: row.learningCapture,
    rerouteCount: row.rerouteCount,
    maxReroutes: row.maxReroutes,
    externalRef: row.externalRef,
    externalPlatform: row.externalPlatform,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    result: row.result,
  }
}
