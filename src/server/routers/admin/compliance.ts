// Admin compliance router — S7 §5.7, CS-WORK-060
// 4 routes: list, getDetail, create, updateStatus
// All adminProcedure. AC-5.5 through AC-5.10.

import { z } from "zod"
import { eq, and, desc, sql, inArray, isNotNull } from "drizzle-orm"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import { logDecision } from "@/lib/decisions/logger"
import { complianceRegister } from "@/db/schema/operations"
import { user } from "@/db/schema/auth"

export type AdminComplianceRouterDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const complianceListInput = z.object({
  type: z.enum(["dsar", "erasure", "article_14", "complaint", "investigation", "obligation"]).optional(),
  status: z.enum(["open", "in_progress", "completed", "overdue"]).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["deadline", "created_at", "status"]).default("deadline"),
})

const createComplianceInput = z.object({
  type: z.enum(["dsar", "erasure", "article_14", "complaint", "investigation", "obligation"]),
  accountId: z.string().optional(),
  deadline: z.string().datetime().optional(),
  receivedAt: z.string().datetime().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

const updateStatusInput = z.object({
  entryId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "completed", "overdue"]),
  notes: z.string().optional(),
})

export function createAdminComplianceRouter(deps: AdminComplianceRouterDeps) {
  return router({
    list: adminProcedure
      .input(complianceListInput)
      .query(async ({ input }) => {
        const conditions = []
        if (input.type) conditions.push(eq(complianceRegister.type, input.type))
        if (input.status) conditions.push(eq(complianceRegister.status, input.status))
        if (input.cursor) conditions.push(sql`${complianceRegister.createdAt} < ${input.cursor}`)

        const sortCol = input.sort === "deadline"
          ? complianceRegister.deadline
          : input.sort === "status"
            ? complianceRegister.status
            : complianceRegister.createdAt

        const rows = await deps.db
          .select({
            id: complianceRegister.id,
            type: complianceRegister.type,
            status: complianceRegister.status,
            accountId: complianceRegister.accountId,
            accountEmail: user.email,
            deadline: complianceRegister.deadline,
            receivedAt: complianceRegister.receivedAt,
            createdAt: complianceRegister.createdAt,
          })
          .from(complianceRegister)
          .leftJoin(user, eq(complianceRegister.accountId, user.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(sortCol))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const entries = rows.slice(0, input.limit).map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          accountId: r.accountId,
          accountEmail: r.accountEmail ?? null,
          deadline: r.deadline?.toISOString() ?? null,
          daysRemaining: r.deadline
            ? Math.max(0, Math.ceil((r.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
            : null,
          receivedAt: r.receivedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }))

        return {
          entries,
          nextCursor: hasMore ? entries[entries.length - 1]?.createdAt : undefined,
        }
      }),

    getDetail: adminProcedure
      .input(z.object({ entryId: z.string().uuid() }))
      .query(async ({ input }) => {
        const [row] = await deps.db
          .select({
            id: complianceRegister.id,
            type: complianceRegister.type,
            status: complianceRegister.status,
            accountId: complianceRegister.accountId,
            accountEmail: user.email,
            deadline: complianceRegister.deadline,
            receivedAt: complianceRegister.receivedAt,
            completedAt: complianceRegister.completedAt,
            details: complianceRegister.details,
            createdAt: complianceRegister.createdAt,
          })
          .from(complianceRegister)
          .leftJoin(user, eq(complianceRegister.accountId, user.id))
          .where(eq(complianceRegister.id, input.entryId))
          .limit(1)

        if (!row) {
          const { TRPCError } = await import("@trpc/server")
          throw new TRPCError({ code: "NOT_FOUND", message: "Compliance entry not found" })
        }

        const HOLD_TYPES = ["dsar", "complaint", "investigation"]
        return {
          id: row.id,
          type: row.type,
          status: row.status,
          accountId: row.accountId,
          accountEmail: row.accountEmail ?? null,
          deadline: row.deadline?.toISOString() ?? null,
          daysRemaining: row.deadline
            ? Math.max(0, Math.ceil((row.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
            : null,
          receivedAt: row.receivedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
          details: row.details,
          hasComplianceHold: HOLD_TYPES.includes(row.type) && row.status === "open",
          createdAt: row.createdAt.toISOString(),
        }
      }),

    // AC-5.5: DSAR creation sends dsar_acknowledgment email
    // AC-5.7: DSAR deadline defaults to receivedAt + 30 days
    // AC-5.10: every create produces decision_logs entry
    create: adminProcedure
      .input(createComplianceInput)
      .mutation(async ({ input, ctx }) => {
        const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date()

        // AC-5.7: DSAR default deadline = receivedAt + 30 days
        let deadline: Date | null = input.deadline ? new Date(input.deadline) : null
        if (input.type === "dsar" && !deadline) {
          deadline = new Date(receivedAt.getTime() + THIRTY_DAYS_MS)
        }

        const [entry] = await deps.db
          .insert(complianceRegister)
          .values({
            type: input.type,
            accountId: input.accountId ?? null,
            status: input.type === "erasure" || input.type === "article_14" ? "completed" : "open",
            receivedAt,
            deadline,
            completedAt: input.type === "erasure" || input.type === "article_14" ? new Date() : null,
            details: input.details ?? null,
          })
          .returning({ id: complianceRegister.id })

        // AC-5.5: send dsar_acknowledgment on DSAR creation
        if (input.type === "dsar" && input.accountId) {
          const [account] = await deps.db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, input.accountId))
            .limit(1)

          if (account?.email) {
            await deps.emailService.send({
              template: "dsar_acknowledgment",
              to: account.email,
              category: "transactional",
              data: {
                dsarId: entry.id,
                receivedAt: receivedAt.toISOString().split("T")[0],
                deadline: deadline?.toISOString().split("T")[0] ?? "N/A",
              },
            })
          }
        }

        // AC-5.10: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "compliance_scheduling",
          inputs: { type: input.type, accountId: input.accountId },
          output: { entryId: entry.id, status: "created" },
          accountId: ctx.session!.accountId,
        })

        return { entryId: entry.id }
      }),

    // AC-5.6: DSAR completion sends dsar_completion email
    // AC-5.10: every updateStatus produces decision_logs entry
    updateStatus: adminProcedure
      .input(updateStatusInput)
      .mutation(async ({ input, ctx }) => {
        const [existing] = await deps.db
          .select({
            id: complianceRegister.id,
            type: complianceRegister.type,
            status: complianceRegister.status,
            accountId: complianceRegister.accountId,
          })
          .from(complianceRegister)
          .where(eq(complianceRegister.id, input.entryId))
          .limit(1)

        if (!existing) {
          const { TRPCError } = await import("@trpc/server")
          throw new TRPCError({ code: "NOT_FOUND", message: "Compliance entry not found" })
        }

        // Idempotent
        if (existing.status === input.status) return

        await deps.db
          .update(complianceRegister)
          .set({
            status: input.status,
            completedAt: input.status === "completed" ? new Date() : undefined,
          })
          .where(eq(complianceRegister.id, input.entryId))

        // AC-5.6: send dsar_completion on DSAR completion
        if (existing.type === "dsar" && input.status === "completed" && existing.accountId) {
          const [account] = await deps.db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, existing.accountId))
            .limit(1)

          if (account?.email) {
            await deps.emailService.send({
              template: "dsar_completion",
              to: account.email,
              category: "transactional",
              data: {
                dsarId: input.entryId,
              },
            })
          }
        }

        // AC-5.10: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "compliance_scheduling",
          inputs: { entryId: input.entryId, previousStatus: existing.status },
          output: { newStatus: input.status, notes: input.notes },
          accountId: ctx.session!.accountId,
        })
      }),
  })
}
