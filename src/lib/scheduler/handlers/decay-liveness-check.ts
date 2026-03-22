// decay_liveness_check deferred action handler — S9 §2.4, AC-22–26, AC-31
// Self-perpetuating: runs one check type, evaluates result, schedules next run.

import { eq, and, isNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import { listings, socialProfiles } from "@/db/schema/data-and-listings"
import { decaySignals, enrichmentSchedules } from "@/db/schema/intelligence"
import { hasActiveTicket } from "@/domains/operations/support/queries"
import type { LivenessServices } from "@/domains/data-and-listings/decay/liveness-services"
import {
  detectDecayWebsite,
  detectDecayEmail,
  detectDecayCh,
  detectDecaySocial,
  detectDecayPostcode,
  evaluateDecayResponse,
  getCadenceMap,
  type EnrichmentCheckType,
} from "@/domains/data-and-listings/decay/detection"

const DAY_MS = 24 * 60 * 60 * 1000

export type DecayLivenessCheckDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  livenessServices: LivenessServices
}

export function registerDecayLivenessCheckHandler(
  registry: ActionHandlerRegistry,
  deps: DecayLivenessCheckDeps,
): void {
  registry.register("decay_liveness_check", async (params) => {
    const { listingId, checkType } = params as { listingId: string; checkType: EnrichmentCheckType }

    // 1. Load listing — exit early if archived/suspended
    const [listing] = await deps.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing || listing.lifecycleStatus === "archived" || listing.lifecycleStatus === "suspended") {
      await deps.db
        .delete(enrichmentSchedules)
        .where(
          and(
            eq(enrichmentSchedules.listingId, listingId),
            eq(enrichmentSchedules.checkType, checkType),
          ),
        )
      return
    }

    // 2. Check for existing unresolved signals (for severity escalation)
    const existingSignals = await deps.db
      .select({
        id: decaySignals.id,
        signalType: decaySignals.signalType,
        resolvedAt: decaySignals.resolvedAt,
        checkDetails: decaySignals.checkDetails,
      })
      .from(decaySignals)
      .where(
        and(eq(decaySignals.listingId, listingId), isNull(decaySignals.resolvedAt)),
      )

    const hasEmailBounce = existingSignals.some((s) => s.signalType === "email_bounced")
    const hasWebsiteDead = existingSignals.some((s) => s.signalType === "website_dead")

    // 3. Run the check
    const signal = await runCheck(deps, listing, listingId, checkType, hasEmailBounce, hasWebsiteDead)

    // 4. If signal detected, evaluate response
    if (signal) {
      const activeSupportTicket = await hasActiveTicket(deps.db, listingId)
      await evaluateDecayResponse({
        listingId,
        signal,
        existingSignals,
        hasActiveSupportTicket: activeSupportTicket,
        deps: {
          updateSignal: async (signalId, checkDetails) => {
            await deps.db
              .update(decaySignals)
              .set({ checkDetails })
              .where(eq(decaySignals.id, signalId))
          },
          insertSignal: async (p) => {
            const [row] = await deps.db
              .insert(decaySignals)
              .values({
                listingId: p.listingId,
                signalType: p.signalType as typeof decaySignals.$inferInsert.signalType,
                severity: p.severity as typeof decaySignals.$inferInsert.severity,
                checkDetails: p.checkDetails,
              })
              .returning({ id: decaySignals.id })
            return row.id
          },
          logDecision: async (p) => {
            await logDecision(deps.decisionLogDb, {
              domain: p.domain as "data-and-listings",
              decisionType: p.decisionType,
              inputs: p.inputs,
              output: p.output,
              listingId: p.listingId,
            })
          },
          emitEvent: async (payload) => {
            deps.waitUntilFn(
              deps.bus.emit("decay_signal_detected", payload, deps.waitUntilFn),
            )
          },
        },
      })
    }

    // 5. Update enrichment schedule
    const now = new Date()
    await deps.db
      .update(enrichmentSchedules)
      .set({ lastCheckAt: now })
      .where(
        and(
          eq(enrichmentSchedules.listingId, listingId),
          eq(enrichmentSchedules.checkType, checkType),
        ),
      )

    // 6. Self-perpetuating: schedule next liveness check — AC-31
    const [schedule] = await deps.db
      .select({ cadenceTier: enrichmentSchedules.cadenceTier })
      .from(enrichmentSchedules)
      .where(
        and(
          eq(enrichmentSchedules.listingId, listingId),
          eq(enrichmentSchedules.checkType, checkType),
        ),
      )
      .limit(1)

    if (schedule) {
      const cadenceMap = getCadenceMap(schedule.cadenceTier as "paid" | "claimed" | "unclaimed")
      const entry = cadenceMap[checkType]
      if (entry) {
        const nextCheckAt = new Date(now.getTime() + entry.livenessDays * DAY_MS)
        await deps.db
          .update(enrichmentSchedules)
          .set({ nextCheckAt })
          .where(
            and(
              eq(enrichmentSchedules.listingId, listingId),
              eq(enrichmentSchedules.checkType, checkType),
            ),
          )
        await scheduleDeferredAction(deps.schedulerDb, {
          action: "decay_liveness_check",
          params: { listingId, checkType },
          executeAt: nextCheckAt,
          retryPolicy: "retry_3",
          onFailure: "log",
          createdBy: "decay_liveness_check",
        })
      }
    }
  })
}

async function runCheck(
  deps: DecayLivenessCheckDeps,
  listing: typeof listings.$inferSelect,
  listingId: string,
  checkType: EnrichmentCheckType,
  hasEmailBounce: boolean,
  hasWebsiteDead: boolean,
) {
  switch (checkType) {
    case "website":
      return detectDecayWebsite(listing.websiteUrl, deps.livenessServices, hasEmailBounce)
    case "email":
      return detectDecayEmail(listing.contactEmail, deps.livenessServices, hasWebsiteDead)
    case "ch":
      return detectDecayCh(listing.companiesHouseNumber, deps.livenessServices)
    case "social": {
      const profiles = await deps.db
        .select({ url: socialProfiles.url, platform: socialProfiles.platform })
        .from(socialProfiles)
        .where(eq(socialProfiles.listingId, listingId))
      return detectDecaySocial(profiles, deps.livenessServices)
    }
    case "postcode":
      return detectDecayPostcode(listing.basePostcode, listing.websiteUrl, listing.contactEmail, deps.livenessServices)
    case "imdb": {
      // IMDb URL stored in social_profiles with platform "imdb"
      const imdbProfiles = await deps.db
        .select({ url: socialProfiles.url, platform: socialProfiles.platform })
        .from(socialProfiles)
        .where(and(eq(socialProfiles.listingId, listingId), eq(socialProfiles.platform, "imdb")))
      return detectDecaySocial(imdbProfiles, deps.livenessServices)
    }
  }
}
