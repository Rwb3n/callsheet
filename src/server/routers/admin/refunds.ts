// Admin refunds router — S7 §13, CS-WORK-065
// 2 routes: list, evaluate (approve/deny)
// All adminProcedure. Approval creates pending_cancellations + calls PaymentService.

import { z } from "zod"
import { eq, and, sql, desc } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { PaymentService } from "@/lib/services/types"
import { cancelDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { supportTickets, pendingCancellations } from "@/db/schema/operations"
import { user } from "@/db/schema/auth"
import { listings } from "@/db/schema/data-and-listings"

// --- Deps ---

export type AdminRefundsRouterDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  payment: PaymentService
}

// --- Zod schemas ---

const refundListInput = z.object({
  status: z.enum(["pending", "approved", "denied"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

const refundEvaluateInput = z.object({
  ticketId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
  reason: z.string().min(1),
})

// --- Router ---

export function createAdminRefundsRouter(deps: AdminRefundsRouterDeps) {
  return router({
    // AC-13.1: list refund request tickets joined with account email, listing name, subscription tier
    list: adminProcedure
      .input(refundListInput)
      .query(async ({ input }) => {
        const filters: ReturnType<typeof eq>[] = [
          eq(supportTickets.category, "refund_request"),
        ]

        if (input.status === "pending") {
          filters.push(eq(supportTickets.status, "open"))
        } else if (input.status === "approved" || input.status === "denied") {
          filters.push(eq(supportTickets.status, "resolved"))
        }

        if (input.cursor) {
          filters.push(sql`${supportTickets.createdAt} < ${input.cursor}`)
        }

        const rows = await deps.db
          .select({
            ticketId: supportTickets.id,
            accountEmail: user.email,
            listingName: listings.name,
            subscriptionTier: listings.subscriptionTier,
            requestedAt: supportTickets.createdAt,
            status: supportTickets.status,
          })
          .from(supportTickets)
          .leftJoin(user, eq(supportTickets.accountId, user.id))
          .leftJoin(listings, eq(supportTickets.listingId, listings.id))
          .where(and(...filters))
          .orderBy(desc(supportTickets.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const refunds = rows.slice(0, input.limit).map((r) => ({
          ticketId: r.ticketId,
          accountEmail: r.accountEmail,
          listingName: r.listingName,
          subscriptionTier: r.subscriptionTier,
          requestedAt: r.requestedAt.toISOString(),
          // Map ticket status to refund status for approved/denied post-filter
          status: r.status === "open" ? "pending" as const : "resolved" as const,
        }))

        return {
          refunds,
          nextCursor: hasMore ? refunds[refunds.length - 1]?.requestedAt : undefined,
        }
      }),

    // AC-13.2 through AC-13.9: evaluate refund (approve/deny)
    evaluate: adminProcedure
      .input(refundEvaluateInput)
      .mutation(async ({ ctx: context, input }) => {
        // Fetch ticket
        const [ticket] = await deps.db
          .select({
            id: supportTickets.id,
            status: supportTickets.status,
            accountId: supportTickets.accountId,
            listingId: supportTickets.listingId,
            category: supportTickets.category,
          })
          .from(supportTickets)
          .where(
            and(
              eq(supportTickets.id, input.ticketId),
              eq(supportTickets.category, "refund_request"),
            ),
          )
          .limit(1)

        if (!ticket) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Refund ticket not found" })
        }

        // AC-13.8: reject tickets not in status: open
        if (ticket.status !== "open") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket already resolved" })
        }

        let subscriptionTier: string | null = null

        if (input.decision === "approve") {
          // AC-13.9: reject tickets with no active subscription
          if (!ticket.listingId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No listing associated with ticket" })
          }

          const [listing] = await deps.db
            .select({
              id: listings.id,
              paddleSubscriptionId: listings.paddleSubscriptionId,
              subscriptionTier: listings.subscriptionTier,
            })
            .from(listings)
            .where(eq(listings.id, ticket.listingId))
            .limit(1)

          if (!listing || !listing.paddleSubscriptionId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription for listing" })
          }

          subscriptionTier = listing.subscriptionTier

          // AC-13.7: create pending_cancellations BEFORE calling Paddle
          // Paddle webhook may arrive immediately — record must exist for attribution
          await deps.db.insert(pendingCancellations).values({
            paddleSubscriptionId: listing.paddleSubscriptionId,
            listingId: listing.id,
            reason: "voluntary",
          })

          // AC-13.2: call PaymentService.cancelSubscription
          // AC-13.6: does NOT emit subscription_ended — Paddle webhook triggers S4 path
          await deps.payment.cancelSubscription({
            paddleSubscriptionId: listing.paddleSubscriptionId,
            reason: "admin_refund: " + input.reason,
            effectiveFrom: "immediately",
          })
        }

        // AC-13.4: resolve ticket (both paths)
        await deps.db
          .update(supportTickets)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
          })
          .where(eq(supportTickets.id, input.ticketId))

        // AC-13.4: cancel sla_breach_warning (both paths)
        await cancelDeferredAction(deps.schedulerDb, {
          action: "sla_breach_warning",
          filterParams: { ticketId: input.ticketId },
          cancelledBy: "admin.refunds.evaluate",
        })

        // AC-13.5: decision log
        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "refund_evaluation",
          inputs: {
            ticketId: input.ticketId,
            listingId: ticket.listingId,
            subscriptionTier,
          },
          output: {
            decision: input.decision,
            reason: input.reason,
          },
          accountId: undefined,
          listingId: ticket.listingId ?? undefined,
          additionalContext: {
            evaluatedBy: context.session!.accountId,
            ...(ticket.accountId ? { accountId: ticket.accountId } : {}),
          },
        })
      }),
  })
}
