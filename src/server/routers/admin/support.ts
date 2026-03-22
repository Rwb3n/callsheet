// Admin support router — S7 §2, CS-WORK-058
// 5 routes: list, getDetail, create, updateStatus, updatePriority
// All adminProcedure. Full triage pipeline in create.

import { z } from "zod"
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { supportTickets, churnRiskRegistry } from "@/db/schema/operations"
import { user } from "@/db/schema/auth"
import { listings } from "@/db/schema/data-and-listings"
import {
  classifyTicket,
  computePriority,
  computeSlaDeadline,
  getSlaHours,
  checkKbDeflection,
} from "@/domains/operations/support/triage"
import type { TicketCategory } from "@/domains/operations/support/triage"

// --- Deps ---

export type AdminSupportRouterDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  emailService: EmailService
}

// --- Zod schemas ---

const supportListInput = z.object({
  status: z.enum(["open", "assigned", "resolved", "closed"]).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["sla_deadline", "priority", "created_at"]).default("sla_deadline"),
})

const createTicketInput = z.object({
  accountId: z.string().optional(),
  listingId: z.string().uuid().optional(),
  category: z.string(),
  priority: z.enum(["critical", "high", "normal", "low"]),
  subject: z.string().min(1).max(500),
  body: z.string().default(""),
  slaDeadline: z.string().datetime().optional(),
})

// --- Router ---

export function createAdminSupportRouter(deps: AdminSupportRouterDeps) {
  return router({
    // AC-2.12: cursor-based pagination with filters, default sort sla_deadline ASC NULLS LAST
    list: adminProcedure
      .input(supportListInput)
      .query(async ({ input }) => {
        const filters: ReturnType<typeof eq>[] = []
        if (input.status) filters.push(eq(supportTickets.status, input.status))
        if (input.priority) filters.push(eq(supportTickets.priority, input.priority))
        if (input.category) filters.push(eq(supportTickets.category, input.category))

        // Cursor keyed to sort column — matches flows/billing/compliance pattern
        if (input.cursor) {
          if (input.sort === "created_at") {
            filters.push(sql`${supportTickets.createdAt} < ${input.cursor}`)
          } else if (input.sort === "priority") {
            filters.push(sql`${supportTickets.createdAt} < ${input.cursor}`)
          } else {
            // sla_deadline ASC: next page has later deadlines
            filters.push(sql`(${supportTickets.slaDeadline} > ${input.cursor} OR ${supportTickets.slaDeadline} IS NULL)`)
          }
        }

        const sortCol = input.sort === "priority"
          ? desc(supportTickets.priority)
          : input.sort === "created_at"
          ? desc(supportTickets.createdAt)
          : sql`${supportTickets.slaDeadline} ASC NULLS LAST`

        const whereClause = filters.length > 0 ? and(...filters) : undefined

        const rows = await deps.db
          .select({
            id: supportTickets.id,
            subject: supportTickets.subject,
            category: supportTickets.category,
            priority: supportTickets.priority,
            status: supportTickets.status,
            slaDeadline: supportTickets.slaDeadline,
            slaRemainingHours: sql<number | null>`
              CASE WHEN ${supportTickets.slaDeadline} IS NOT NULL
                THEN EXTRACT(EPOCH FROM (${supportTickets.slaDeadline} - now())) / 3600
                ELSE NULL
              END
            `,
            hasChurnRisk: sql<boolean>`EXISTS (
              SELECT 1 FROM churn_risk_registry
              WHERE churn_risk_registry.account_id = ${supportTickets.accountId}
                AND churn_risk_registry.expires_at > now()
            )`,
            createdAt: supportTickets.createdAt,
          })
          .from(supportTickets)
          .where(whereClause)
          .orderBy(sortCol)
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const tickets = rows.slice(0, input.limit).map((r) => ({
          ...r,
          slaDeadline: r.slaDeadline?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }))

        // Cursor value matches sort column
        const lastTicket = tickets[tickets.length - 1]
        const cursorValue = !hasMore ? undefined
          : input.sort === "sla_deadline" ? lastTicket?.slaDeadline
          : lastTicket?.createdAt

        return {
          tickets,
          nextCursor: cursorValue ?? undefined,
        }
      }),

    // AC-2.13: ticket detail with account email, listing name, churn risk level via LEFT JOINs
    getDetail: adminProcedure
      .input(z.object({ ticketId: z.string().uuid() }))
      .query(async ({ input }) => {
        const [row] = await deps.db
          .select({
            id: supportTickets.id,
            subject: supportTickets.subject,
            category: supportTickets.category,
            priority: supportTickets.priority,
            status: supportTickets.status,
            slaDeadline: supportTickets.slaDeadline,
            slaRemainingHours: sql<number | null>`
              CASE WHEN ${supportTickets.slaDeadline} IS NOT NULL
                THEN EXTRACT(EPOCH FROM (${supportTickets.slaDeadline} - now())) / 3600
                ELSE NULL
              END
            `,
            accountId: supportTickets.accountId,
            listingId: supportTickets.listingId,
            accountEmail: user.email,
            listingName: listings.name,
            churnRiskLevel: churnRiskRegistry.riskLevel,
            resolvedAt: supportTickets.resolvedAt,
            closedAt: supportTickets.closedAt,
            createdAt: supportTickets.createdAt,
          })
          .from(supportTickets)
          .leftJoin(user, eq(supportTickets.accountId, user.id))
          .leftJoin(listings, eq(supportTickets.listingId, listings.id))
          .leftJoin(
            churnRiskRegistry,
            and(
              eq(supportTickets.accountId, churnRiskRegistry.accountId),
              sql`${churnRiskRegistry.expiresAt} > now()`,
            ),
          )
          .where(eq(supportTickets.id, input.ticketId))
          .limit(1)

        if (!row) throw new TRPCError({ code: "NOT_FOUND" })

        return {
          ...row,
          slaDeadline: row.slaDeadline?.toISOString() ?? null,
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
          closedAt: row.closedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          churnRiskLevel: row.churnRiskLevel as "at_risk" | "high_risk" | null,
        }
      }),

    // AC-2.1 through AC-2.8, AC-2.11: full triage pipeline
    create: adminProcedure
      .input(createTicketInput)
      .mutation(async ({ input }) => {
        const category = input.category as TicketCategory

        // Churn risk lookup
        let churnRiskLevel: "at_risk" | "high_risk" | null = null
        if (input.accountId) {
          const [risk] = await deps.db
            .select({ riskLevel: churnRiskRegistry.riskLevel })
            .from(churnRiskRegistry)
            .where(
              and(
                eq(churnRiskRegistry.accountId, input.accountId),
                sql`${churnRiskRegistry.expiresAt} > now()`,
              ),
            )
            .limit(1)
          if (risk) churnRiskLevel = risk.riskLevel as "at_risk" | "high_risk"
        }

        // Priority with churn risk elevation
        const { priority: computedPriority, elevated } = computePriority(category, churnRiskLevel)
        const effectivePriority = input.priority ?? computedPriority

        // SLA deadline
        const now = new Date()
        const slaDeadline = input.slaDeadline
          ? new Date(input.slaDeadline)
          : computeSlaDeadline(effectivePriority, now)

        // KB deflection
        const deflection = checkKbDeflection(category)

        // Insert ticket
        const [ticket] = await deps.db
          .insert(supportTickets)
          .values({
            accountId: input.accountId ?? null,
            listingId: input.listingId ?? null,
            category,
            priority: effectivePriority,
            status: "open",
            subject: input.subject,
            slaDeadline,
            details: deflection.matched ? { deflection_attempted: true, articleUrl: deflection.articleUrl } : null,
          })
          .returning({ id: supportTickets.id })

        // AC-2.5: schedule SLA breach warning at 80% of SLA duration
        const slaHours = getSlaHours(effectivePriority)
        const warningMs = slaHours * 0.8 * 60 * 60 * 1000
        await scheduleDeferredAction(deps.schedulerDb, {
          action: "sla_breach_warning",
          params: { ticketId: ticket.id, slaDeadline: slaDeadline.toISOString() },
          executeAt: new Date(now.getTime() + warningMs),
          retryPolicy: "once",
          onFailure: "log",
          createdBy: "admin.support.create",
        })

        // AC-2.7: send support_acknowledgment email
        if (input.accountId) {
          const [account] = await deps.db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, input.accountId))
            .limit(1)

          if (account?.email) {
            await deps.emailService.send({
              to: account.email,
              template: "support_acknowledgment",
              data: {
                ticketId: ticket.id,
                subject: input.subject,
                deflectionArticle: deflection.matched ? deflection.articleUrl : null,
              },
              category: "transactional",
              accountId: input.accountId,
            })
          }
        }

        // AC-2.11: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "support_triage",
          inputs: {
            category,
            hasAccount: !!input.accountId,
            churnRiskLevel,
            kbDeflectionMatched: deflection.matched,
          },
          output: {
            priority: effectivePriority,
            slaDeadline: slaDeadline.toISOString(),
            priorityElevated: elevated,
          },
          accountId: input.accountId ?? undefined,
          listingId: input.listingId ?? undefined,
          additionalContext: { ticketId: ticket.id },
        })

        return { ticketId: ticket.id }
      }),

    // AC-2.6, AC-2.11, AC-2.15: status transitions, SLA cancel on resolve/close, idempotent
    updateStatus: adminProcedure
      .input(z.object({
        ticketId: z.string().uuid(),
        status: z.enum(["open", "assigned", "resolved", "closed"]),
        resolution: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const [ticket] = await deps.db
          .select({
            status: supportTickets.status,
            accountId: supportTickets.accountId,
            listingId: supportTickets.listingId,
          })
          .from(supportTickets)
          .where(eq(supportTickets.id, input.ticketId))
          .limit(1)

        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" })

        // AC-2.15: idempotent — same status is a no-op
        if (ticket.status === input.status) return

        const updates: Record<string, unknown> = { status: input.status }
        if (input.status === "resolved") updates.resolvedAt = new Date()
        if (input.status === "closed") updates.closedAt = new Date()

        await deps.db
          .update(supportTickets)
          .set(updates)
          .where(eq(supportTickets.id, input.ticketId))

        // AC-2.6: cancel SLA breach warning on resolve/close
        if (input.status === "resolved" || input.status === "closed") {
          await cancelDeferredAction(deps.schedulerDb, {
            action: "sla_breach_warning",
            filterParams: { ticketId: input.ticketId },
            cancelledBy: "admin.support.updateStatus",
          })
        }

        // AC-2.11: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "support_triage",
          inputs: { ticketId: input.ticketId, previousStatus: ticket.status },
          output: { newStatus: input.status, resolution: input.resolution },
          accountId: ticket.accountId ?? undefined,
          listingId: ticket.listingId ?? undefined,
          additionalContext: { ticketId: input.ticketId },
        })
      }),

    // AC-2.14: priority change recomputes SLA + reschedules sla_breach_warning
    updatePriority: adminProcedure
      .input(z.object({
        ticketId: z.string().uuid(),
        priority: z.enum(["critical", "high", "normal", "low"]),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const [ticket] = await deps.db
          .select({
            priority: supportTickets.priority,
            status: supportTickets.status,
            accountId: supportTickets.accountId,
            listingId: supportTickets.listingId,
          })
          .from(supportTickets)
          .where(eq(supportTickets.id, input.ticketId))
          .limit(1)

        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" })

        // Idempotent
        if (ticket.priority === input.priority) return

        // Update priority
        await deps.db
          .update(supportTickets)
          .set({ priority: input.priority })
          .where(eq(supportTickets.id, input.ticketId))

        // Recompute SLA + reschedule warning for active tickets
        if (ticket.status === "open" || ticket.status === "assigned") {
          const now = new Date()
          const newSlaDeadline = computeSlaDeadline(input.priority, now)

          await deps.db
            .update(supportTickets)
            .set({ slaDeadline: newSlaDeadline })
            .where(eq(supportTickets.id, input.ticketId))

          // Cancel old, schedule new
          await cancelDeferredAction(deps.schedulerDb, {
            action: "sla_breach_warning",
            filterParams: { ticketId: input.ticketId },
            cancelledBy: "admin.support.updatePriority",
          })

          const slaHours = getSlaHours(input.priority)
          const warningMs = slaHours * 0.8 * 60 * 60 * 1000
          await scheduleDeferredAction(deps.schedulerDb, {
            action: "sla_breach_warning",
            params: { ticketId: input.ticketId, slaDeadline: newSlaDeadline.toISOString() },
            executeAt: new Date(now.getTime() + warningMs),
            retryPolicy: "once",
            onFailure: "log",
            createdBy: "admin.support.updatePriority",
          })
        }

        // Decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "support_triage",
          inputs: { ticketId: input.ticketId, previousPriority: ticket.priority, reason: input.reason },
          output: { newPriority: input.priority },
          accountId: ticket.accountId ?? undefined,
          listingId: ticket.listingId ?? undefined,
          additionalContext: { ticketId: input.ticketId },
        })
      }),
  })
}
