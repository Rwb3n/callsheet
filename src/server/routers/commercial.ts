// Commercial router — S8 §1, §5, CR §5.3, CR §6
// 4 routes: evaluateUpgradeSuggestion, getConversionTriggerState, getSponsoredListings, getRevenuePerception

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { loadOwnedListing } from "@/server/routers/listing-helpers"
import {
  evaluateUpgradeSuggestion,
  getConversionTriggerState,
} from "@/domains/commercial/conversion-triggers"
import { selectSponsoredListings } from "@/domains/commercial/sponsored-placement"
import { computeRevenuePerception } from "@/domains/commercial/revenue-perception"

export type CommercialRouterDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

export function createCommercialRouter(deps: CommercialRouterDeps) {
  const triggerDeps = {
    db: deps.db,
    decisionLogDb: deps.decisionLogDb,
    emailService: deps.emailService,
    bus: deps.bus,
    waitUntilFn: deps.waitUntilFn,
  }

  return router({
    evaluateUpgradeSuggestion: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return evaluateUpgradeSuggestion(input.listingId, ctx.session.accountId, triggerDeps)
      }),

    getConversionTriggerState: protectedProcedure
      .input(z.object({ listingId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        // Ownership check
        await loadOwnedListing(deps.db, input.listingId, ctx.session.accountId)
        return getConversionTriggerState(deps.db, input.listingId)
      }),

    getSponsoredListings: protectedProcedure
      .input(z.object({
        sectorId: z.number().int().optional(),
        serviceAreaIds: z.array(z.number().int()).optional(),
        locationSlug: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return selectSponsoredListings(deps.db, deps.decisionLogDb, input)
      }),

    getRevenuePerception: adminProcedure
      .query(async () => {
        return computeRevenuePerception(deps.db)
      }),
  })
}
