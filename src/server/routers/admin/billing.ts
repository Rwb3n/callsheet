// Admin billing router — S7 §4.5, CS-WORK-059
// 4 routes: getStatus, triggerReconciliation, listHolds, releaseHold
// All adminProcedure.

import { z } from "zod"
import { eq, sql, desc } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { scheduleDeferredAction, cancelDeferredAction } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { billingHolds } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import { getBillingReconciliationStatus } from "@/domains/operations/billing/queries"

export type AdminBillingRouterDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function createAdminBillingRouter(deps: AdminBillingRouterDeps) {
  return router({
    // AC-4.8: returns current status from single-row table, <100ms p95
    getStatus: adminProcedure.query(async () => {
      return getBillingReconciliationStatus(deps.db)
    }),

    // AC-4.9: schedules immediate billing_reconciliation and logs decision
    triggerReconciliation: adminProcedure.mutation(async ({ ctx }) => {
      await scheduleDeferredAction(deps.schedulerDb, {
        action: "billing_reconciliation",
        params: {},
        executeAt: new Date(),
        retryPolicy: "retry_3",
        onFailure: "alert_principal",
        createdBy: "admin.billing.triggerReconciliation",
      })

      await logDecision(deps.decisionLogDb, {
        domain: "operations",
        decisionType: "billing_reconciliation",
        inputs: { trigger: "manual_admin", triggeredBy: ctx.session!.accountId },
        output: { action: "scheduled" },
        accountId: ctx.session!.accountId,
      })

      return { scheduled: true }
    }),

    // AC-4.11: paginated holds with listing name and computed remainingHours
    listHolds: adminProcedure
      .input(z.object({
        cursor: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        const conditions = input.cursor
          ? sql`${billingHolds.createdAt} < ${input.cursor}`
          : undefined

        const rows = await deps.db
          .select({
            id: billingHolds.id,
            listingId: billingHolds.listingId,
            listingName: listings.name,
            reason: billingHolds.reason,
            expiresAt: billingHolds.expiresAt,
            remainingHours: sql<number>`
              EXTRACT(EPOCH FROM (${billingHolds.expiresAt} - now())) / 3600
            `,
            createdAt: billingHolds.createdAt,
          })
          .from(billingHolds)
          .leftJoin(listings, eq(billingHolds.listingId, listings.id))
          .where(conditions)
          .orderBy(desc(billingHolds.createdAt))
          .limit(input.limit + 1)

        const hasMore = rows.length > input.limit
        const holds = rows.slice(0, input.limit).map((r) => ({
          ...r,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          remainingHours: Math.max(0, Math.round(parseFloat(String(r.remainingHours ?? 0)) * 10) / 10),
        }))

        return {
          holds,
          nextCursor: hasMore ? holds[holds.length - 1]?.createdAt : undefined,
        }
      }),

    // AC-4.10: deletes hold, cancels billing_hold_expiry, logs decision
    releaseHold: adminProcedure
      .input(z.object({
        holdId: z.string().uuid(),
        reason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const [hold] = await deps.db
          .select({ id: billingHolds.id, listingId: billingHolds.listingId })
          .from(billingHolds)
          .where(eq(billingHolds.id, input.holdId))
          .limit(1)

        if (!hold) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Hold not found or already released" })
        }

        await deps.db.delete(billingHolds).where(eq(billingHolds.id, input.holdId))

        await cancelDeferredAction(deps.schedulerDb, {
          action: "billing_hold_expiry",
          filterParams: { holdId: input.holdId },
          cancelledBy: "admin.billing.releaseHold",
        })

        await logDecision(deps.decisionLogDb, {
          domain: "operations",
          decisionType: "billing_reconciliation",
          inputs: { holdId: input.holdId, listingId: hold.listingId },
          output: { action: "hold_released", reason: input.reason, releasedBy: ctx.session!.accountId },
          accountId: ctx.session!.accountId,
        })
      }),
  })
}
