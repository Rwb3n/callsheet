// Settings router — S5 §10, CS-WORK-049 AC-38 through AC-41
// Account-level settings: email preferences + account closure initiation.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, inArray } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import type { EmailPreferences } from "@/db/schema/accounts"
import { orchestratedFlows } from "@/db/schema/shared"
import type { FlowDb } from "@/lib/flows"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { PaymentService } from "@/lib/services/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { initiateAccountClosure } from "@/lib/flows"

// --- Email preference categories (SI §5.3: 4 subscribable) ---

const EMAIL_PREF_CATEGORIES = [
  "enquiry_notification",
  "listing_status",
  "profile_nudge",
  "conversion_marketing",
] as const

export type EmailPrefCategory = (typeof EMAIL_PREF_CATEGORIES)[number]

const updateEmailPrefInput = z.object({
  category: z.enum(EMAIL_PREF_CATEGORIES),
  enabled: z.boolean(),
})

// --- Deps ---

export type SettingsRouterDeps = {
  db: Db
  flowDb: FlowDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  payment: PaymentService
  schedulerDb: SchedulerDb
}

// --- Router ---

export function createSettingsRouter(deps: SettingsRouterDeps) {
  return router({
    // AC-38: display all 4 subscribable categories with current state
    getEmailPreferences: protectedProcedure.query(async ({ ctx }) => {
      const [profile] = await deps.db
        .select({ emailPreferences: accountProfiles.emailPreferences })
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, ctx.session.accountId))
        .limit(1)

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })

      const prefs = profile.emailPreferences as EmailPreferences
      return EMAIL_PREF_CATEGORIES.map((category) => ({
        category,
        enabled: prefs[category],
      }))
    }),

    // AC-39: updating email preference immediately changes delivery behaviour
    updateEmailPreference: protectedProcedure
      .input(updateEmailPrefInput)
      .mutation(async ({ ctx, input }) => {
        const [profile] = await deps.db
          .select({ emailPreferences: accountProfiles.emailPreferences })
          .from(accountProfiles)
          .where(eq(accountProfiles.accountId, ctx.session.accountId))
          .limit(1)

        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })

        const prefs = { ...(profile.emailPreferences as EmailPreferences) }
        prefs[input.category] = input.enabled

        const [updated] = await deps.db
          .update(accountProfiles)
          .set({ emailPreferences: prefs, updatedAt: new Date() })
          .where(eq(accountProfiles.accountId, ctx.session.accountId))
          .returning()

        return { category: input.category, enabled: input.enabled }
      }),

    // AC-40, AC-41: account closure initiates orchestrated flow
    initiateAccountClosure: protectedProcedure.mutation(async ({ ctx }) => {
      // Guard: prevent duplicate concurrent closure flows (mirrors admin.flows.initiateClosureForAccount)
      const [existingFlow] = await deps.db
        .select({ id: orchestratedFlows.id })
        .from(orchestratedFlows)
        .where(
          and(
            eq(orchestratedFlows.flowType, "closure"),
            eq(orchestratedFlows.triggeredBy, ctx.session.accountId),
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

      const result = await initiateAccountClosure(
        {
          db: deps.db,
          flowDb: deps.flowDb,
          bus: deps.bus,
          waitUntilFn: deps.waitUntilFn,
          payment: deps.payment,
          schedulerDb: deps.schedulerDb,
        },
        ctx.session.accountId,
      )

      return { flowId: result.flowId, status: result.status }
    }),
  })
}
