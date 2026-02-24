// Verification upgrade route — S3 §7.3
// requestUpgrade: provider requests claimed → verified evaluation
// Wired into root router in S5 (provider dashboard). Integration tests deferred to S5.

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, verifiedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { listings, verifications } from "@/db/schema/data-and-listings"
import type { DecisionLogDb } from "@/lib/decisions"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import {
  evaluateVerificationUpgrade,
  applyVerificationUpgrade,
} from "@/domains/data-and-listings/verification/evaluate-upgrade"

export type VerificationRouterDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  companiesHouse: CompaniesHouseService
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function createVerificationRouter(deps: VerificationRouterDeps) {
  return router({
    requestUpgrade: verifiedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        // Ownership guard
        if (listing.accountId !== ctx.session.accountId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "you do not own this listing" })
        }

        // Read verification from verifications table [S3-ST-16, AC-37]
        const [verification] = await deps.db
          .select()
          .from(verifications)
          .where(eq(verifications.listingId, input.listingId))

        if (!verification) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Verification record not found" })
        }

        const decision = await evaluateVerificationUpgrade(
          listing,
          verification,
          { db: deps.db, companiesHouse: deps.companiesHouse },
        )

        if (decision.eligible === true) {
          await applyVerificationUpgrade(
            { db: deps.db, decisionLogDb: deps.decisionLogDb, eventBus: deps.eventBus, waitUntilFn: deps.waitUntilFn },
            input.listingId,
            decision.newTier,
            decision.score,
          )
          return { status: "upgraded" as const, newTier: decision.newTier }
        }

        if (decision.eligible === "pending_human_review") {
          // TaskSpec created but not persisted to DB — S7 provides the task queue table
          return { status: "pending_review" as const }
        }

        return {
          status: "not_eligible" as const,
          score: decision.score,
          threshold: decision.threshold,
          guidance: decision.guidance,
        }
      }),
  })
}
