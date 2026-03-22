// Settings router — S5 §10, CS-WORK-049 AC-38 through AC-41
// Account-level settings: email preferences + account closure initiation.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import type { EmailPreferences } from "@/db/schema/accounts"
import { listings } from "@/db/schema/data-and-listings"
import { executeOrchestratedFlow } from "@/lib/flows"
import type { FlowDb } from "@/lib/flows"
import type { FlowStepDefinition } from "@/lib/flows"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { PaymentService } from "@/lib/services/types"

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

// --- Closure flow context ---

type ClosureContext = {
  accountId: string
  listingsArchived: string[]
  subscriptionsCancelled: string[]
}

// --- Deps ---

export type SettingsRouterDeps = {
  db: Db
  flowDb: FlowDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  payment: PaymentService
}

// --- Closure step builders (PP §5: 6 steps) ---

function buildClosureSteps(deps: SettingsRouterDeps): FlowStepDefinition<ClosureContext>[] {
  return [
    {
      name: "archive_listings",
      domain: "data-and-listings",
      skippable: false,
      async execute(ctx) {
        const owned = await deps.db
          .select({ id: listings.id, lifecycleStatus: listings.lifecycleStatus })
          .from(listings)
          .where(eq(listings.accountId, ctx.accountId))

        for (const listing of owned) {
          if (listing.lifecycleStatus === "archived") continue
          await deps.db
            .update(listings)
            .set({ lifecycleStatus: "archived", updatedAt: new Date() })
            .where(eq(listings.id, listing.id))
          ctx.listingsArchived.push(listing.id)
        }
      },
    },
    {
      name: "cancel_subscriptions",
      domain: "commercial",
      skippable: false,
      async execute(ctx) {
        // Cancel all active Paddle subscriptions for archived listings
        const owned = await deps.db
          .select({
            id: listings.id,
            paddleSubscriptionId: listings.paddleSubscriptionId,
          })
          .from(listings)
          .where(eq(listings.accountId, ctx.accountId))

        for (const listing of owned) {
          if (!listing.paddleSubscriptionId) continue
          await deps.payment.cancelSubscription({
            paddleSubscriptionId: listing.paddleSubscriptionId,
            reason: "account_closed",
            effectiveFrom: "immediately",
          })
          ctx.subscriptionsCancelled.push(listing.paddleSubscriptionId)
        }
      },
    },
    {
      name: "anonymise_buyer_data",
      domain: "platform",
      skippable: true,
      async execute(_ctx) {
        // S10 implements full anonymisation. S5 no-op placeholder.
      },
    },
    {
      name: "delete_defer_buyer_data",
      domain: "platform",
      skippable: true,
      async execute(_ctx) {
        // S10 implements delete/defer with compliance hold check. S5 no-op placeholder.
      },
    },
    {
      name: "deactivate_account",
      domain: "platform",
      skippable: false,
      async execute(ctx) {
        await deps.db
          .update(accountProfiles)
          .set({ suppressedAt: new Date(), suppressionReason: "account_closed", updatedAt: new Date() })
          .where(eq(accountProfiles.accountId, ctx.accountId))
      },
    },
    {
      name: "emit_account_closed",
      domain: "platform",
      skippable: false,
      async execute(ctx) {
        await deps.bus.emit(
          "account_closed",
          {
            _brand: "AccountClosedEvent" as const,
            accountId: ctx.accountId,
            listingsArchived: ctx.listingsArchived,
          },
          deps.waitUntilFn,
        )
      },
    },
  ]
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
      const steps = buildClosureSteps(deps)

      const result = await executeOrchestratedFlow(deps.flowDb, {
        flowType: "closure",
        triggeredBy: ctx.session.accountId,
        steps,
        initialContext: {
          accountId: ctx.session.accountId,
          listingsArchived: [],
          subscriptionsCancelled: [],
        },
      })

      return { flowId: result.flowId, status: result.status }
    }),
  })
}
