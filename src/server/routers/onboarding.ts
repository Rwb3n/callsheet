// Onboarding routes — S2 §2, AC-01/03/04
// Handles post-signup account profile creation, personalisation, and anonymous enquiry linking.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import { user } from "@/db/schema/auth"
import { linkAnonymousEnquiries } from "@/lib/onboarding/link-anonymous-enquiries"

const completePersonalisationInput = z.object({
  departments: z.array(z.string()).max(10).optional(),
})

export type OnboardingRouterDeps = {
  db: Db
}

export function createOnboardingRouter(deps: OnboardingRouterDeps) {
  return router({
    // AC-01: Ensure account_profiles row exists with defaults.
    // Called after signup — idempotent (no-op if profile already exists).
    ensureProfile: protectedProcedure
      .mutation(async ({ ctx }) => {
        const db = deps.db
        const accountId = ctx.session.accountId

        // Fetch user's name from Better Auth user table
        const [authUser] = await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, accountId))
          .limit(1)

        if (!authUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Auth user not found" })
        }

        // Upsert — idempotent
        await db
          .insert(accountProfiles)
          .values({
            accountId,
            fullName: authUser.name,
          })
          .onConflictDoNothing({ target: accountProfiles.accountId })

        // AC-04: link anonymous enquiries by email
        const linked = await linkAnonymousEnquiries(db, accountId, ctx.session.email)

        return { linked }
      }),

    // AC-03: Store departments from personalisation step. Skippable.
    completePersonalisation: protectedProcedure
      .input(completePersonalisationInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const accountId = ctx.session.accountId

        // Verify profile exists
        const [profile] = await db
          .select({ accountId: accountProfiles.accountId })
          .from(accountProfiles)
          .where(eq(accountProfiles.accountId, accountId))
          .limit(1)

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account profile not found — call ensureProfile first",
          })
        }

        await db
          .update(accountProfiles)
          .set({
            departments: input.departments ?? [],
            updatedAt: new Date(),
          })
          .where(eq(accountProfiles.accountId, accountId))

        return { departments: input.departments ?? [] }
      }),
  })
}
