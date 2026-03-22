// enrichment_full_cycle deferred action handler — S9 §2.5, AC-35
// Runs all applicable check types for a listing, schedules next full cycle.

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
  getApplicableCheckTypes,
  getFullCycleDuration,
  type DecaySignal,
  type EnrichmentCheckType,
  type CadenceTier,
} from "@/domains/data-and-listings/decay/detection"

export type EnrichmentFullCycleDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  livenessServices: LivenessServices
}

export function registerEnrichmentFullCycleHandler(
  registry: ActionHandlerRegistry,
  deps: EnrichmentFullCycleDeps,
): void {
  registry.register("enrichment_full_cycle", async (params) => {
    const { listingId } = params as { listingId: string }

    // 1. Load listing — exit early if archived/suspended
    const [listing] = await deps.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)

    if (!listing || listing.lifecycleStatus === "archived" || listing.lifecycleStatus === "suspended") {
      await deps.db
        .delete(enrichmentSchedules)
        .where(eq(enrichmentSchedules.listingId, listingId))
      return
    }

    // 2. Determine cadence tier from existing schedules
    const schedules = await deps.db
      .select({ cadenceTier: enrichmentSchedules.cadenceTier })
      .from(enrichmentSchedules)
      .where(eq(enrichmentSchedules.listingId, listingId))
      .limit(1)

    if (schedules.length === 0) return

    const cadenceTier = schedules[0].cadenceTier as CadenceTier
    const applicableCheckTypes = getApplicableCheckTypes(cadenceTier)

    // 3. Load existing signals for severity escalation context
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

    // 4. Run all applicable checks
    const detectedSignals: DecaySignal[] = []
    for (const checkType of applicableCheckTypes) {
      try {
        const signal = await runSingleCheck(deps, listing, listingId, checkType, hasEmailBounce, hasWebsiteDead)
        if (signal) detectedSignals.push(signal)
      } catch {
        // Log error but continue with remaining checks
      }
    }

    // 5. Evaluate each detected signal
    const activeSupportTicket = await hasActiveTicket(deps.db, listingId)
    const responseDeps = {
      updateSignal: async (signalId: string, checkDetails: Record<string, unknown>) => {
        await deps.db
          .update(decaySignals)
          .set({ checkDetails })
          .where(eq(decaySignals.id, signalId))
      },
      insertSignal: async (p: { listingId: string; signalType: string; severity: string; checkDetails: Record<string, unknown> }) => {
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
      logDecision: async (p: { domain: string; decisionType: string; inputs: Record<string, unknown>; output: Record<string, unknown>; listingId: string }) => {
        await logDecision(deps.decisionLogDb, {
          domain: p.domain as "data-and-listings",
          decisionType: p.decisionType,
          inputs: p.inputs,
          output: p.output,
          listingId: p.listingId,
        })
      },
      emitEvent: async (payload: Parameters<typeof deps.bus.emit>[1] & { _brand: "DecaySignalDetectedEvent" }) => {
        deps.waitUntilFn(
          deps.bus.emit("decay_signal_detected", payload, deps.waitUntilFn),
        )
      },
    }

    for (const signal of detectedSignals) {
      await evaluateDecayResponse({
        listingId,
        signal,
        existingSignals,
        hasActiveSupportTicket: activeSupportTicket,
        deps: responseDeps,
      })
    }

    // 6. Update schedule timestamps
    const now = new Date()
    for (const checkType of applicableCheckTypes) {
      await deps.db
        .update(enrichmentSchedules)
        .set({ lastCheckAt: now, lastFullCycleAt: now })
        .where(
          and(
            eq(enrichmentSchedules.listingId, listingId),
            eq(enrichmentSchedules.checkType, checkType),
          ),
        )
    }

    // 7. Self-perpetuating: schedule next full cycle — AC-35
    const fullCycleDuration = getFullCycleDuration(cadenceTier)
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "enrichment_full_cycle",
      params: { listingId },
      executeAt: new Date(now.getTime() + fullCycleDuration),
      retryPolicy: "retry_3",
      onFailure: "alert_principal",
      createdBy: "enrichment_full_cycle",
    })
  })
}

async function runSingleCheck(
  deps: EnrichmentFullCycleDeps,
  listing: typeof listings.$inferSelect,
  listingId: string,
  checkType: EnrichmentCheckType,
  hasEmailBounce: boolean,
  hasWebsiteDead: boolean,
): Promise<DecaySignal | null> {
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
      const imdbProfiles = await deps.db
        .select({ url: socialProfiles.url, platform: socialProfiles.platform })
        .from(socialProfiles)
        .where(and(eq(socialProfiles.listingId, listingId), eq(socialProfiles.platform, "imdb")))
      return detectDecaySocial(imdbProfiles, deps.livenessServices)
    }
  }
}
