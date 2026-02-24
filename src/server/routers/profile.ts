// Profile routes — S1 §4.3, AC-21

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import type { EmailPreferences } from "@/db/schema/accounts"

const emailPreferencesSchema = z.object({
  enquiry_notification: z.boolean(),
  listing_status: z.boolean(),
  profile_nudge: z.boolean(),
  conversion_marketing: z.boolean(),
})

export const profileUpdateInput = z.object({
  fullName: z.string().min(1).max(200).optional(),
  emailPreferences: emailPreferencesSchema.optional(),
})

export type ProfileRouterDeps = { db: Db }

export function createProfileRouter(deps: ProfileRouterDeps) {
  return router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const [profile] = await deps.db
        .select()
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, ctx.session.accountId))
        .limit(1)
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })
      return profile
    }),

    update: protectedProcedure
      .input(profileUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const updates: Partial<typeof accountProfiles.$inferInsert> = { updatedAt: new Date() }
        if (input.fullName !== undefined) updates.fullName = input.fullName
        if (input.emailPreferences !== undefined) updates.emailPreferences = input.emailPreferences

        const [updated] = await deps.db
          .update(accountProfiles)
          .set(updates)
          .where(eq(accountProfiles.accountId, ctx.session.accountId))
          .returning()

        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })
        return updated
      }),

    // AC-21: dedicated email preferences update
    updateEmailPreferences: protectedProcedure
      .input(emailPreferencesSchema)
      .mutation(async ({ ctx, input }) => {
        const [updated] = await deps.db
          .update(accountProfiles)
          .set({
            emailPreferences: input as EmailPreferences,
            updatedAt: new Date(),
          })
          .where(eq(accountProfiles.accountId, ctx.session.accountId))
          .returning()

        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })
        return updated
      }),
  })
}
