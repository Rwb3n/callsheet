// Profile strength route — S2 §8.3, AC-29
// Ownership verification + fallback computation (real quality score path wired in S9)
// Wired into root router in S5 (provider dashboard). Integration tests deferred to S5.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings, qualityScores, qualityScoreExplanations } from "@/db/schema/data-and-listings"
import {
  computeProfileStrength,
  computeFallbackProfileStrength,
  identifyMissingFields,
} from "@/lib/onboarding/profile-strength"

const getProfileStrengthInput = z.object({
  listingId: z.string().uuid(),
})

export type ProfileStrengthRouterDeps = {
  db: Db
}

export function createProfileStrengthRouter(deps: ProfileStrengthRouterDeps) {
  return router({
    get: protectedProcedure
      .input(getProfileStrengthInput)
      .query(async ({ ctx, input }) => {
        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }
        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not the listing owner" })
        }

        // Try real quality score path (S9+)
        const [score] = await deps.db
          .select()
          .from(qualityScores)
          .where(eq(qualityScores.listingId, input.listingId))
          .limit(1)

        const [explanation] = await deps.db
          .select()
          .from(qualityScoreExplanations)
          .where(eq(qualityScoreExplanations.listingId, input.listingId))
          .limit(1)

        const hasRealScoring = score && explanation
          && explanation.explanation.dimensions?.completeness

        if (hasRealScoring) {
          const completeness = score.completeness
          const factors = explanation.explanation.dimensions.completeness.factors
          const missingFields = identifyMissingFields(factors)
          return computeProfileStrength(completeness, missingFields)
        }

        // Fallback: field-presence check [AC-31, S2-ST-10]
        return computeFallbackProfileStrength(listing)
      }),
  })
}
