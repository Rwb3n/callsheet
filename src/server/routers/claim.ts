// Claim path routes — S2 §5 + S3 §2
// getClaimContext: pre-populate claim form + endowment messaging + fallback profile strength (S2)
// submitClaim: snapshot creation + evaluateClaim + post-processing pipelines (S3)
// resolveManualReview: admin callback stub (full implementation CS-WORK-032)

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, verifiedProcedure, adminProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import {
  listings,
  engagements,
  preClaimSnapshots,
  listingTaxonomyTags,
  taxonomyServiceAreas,
} from "@/db/schema/data-and-listings"
import type { SchedulerDb } from "@/lib/scheduler"
import { cancelDeferredAction } from "@/lib/scheduler"
import type { DecisionLogDb } from "@/lib/decisions"
import { logDecision } from "@/lib/decisions"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { EmailService } from "@/lib/email/types"
import type { NotificationDb } from "@/lib/notifications"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { evaluateClaim } from "@/domains/data-and-listings/claim/evaluate-claim"
import { onClaimApproved } from "@/domains/data-and-listings/claim/claim-approved"
import { onClaimRejected } from "@/domains/data-and-listings/claim/claim-rejected"
import { onManualReviewComplete } from "@/domains/data-and-listings/claim/manual-review"
import { getEndowmentMessaging } from "@/lib/onboarding/endowment-messaging"
import { computeFallbackProfileStrength } from "@/lib/onboarding/profile-strength"

// --- Zod schemas (exported for tests) ---

export const getClaimContextInput = z.object({
  listingId: z.string().uuid(),
})

const claimEditFields = z.object({
  headline: z.string().min(5).max(200).optional(),
  bio: z.string().max(2000).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  basePostcode: z.string().optional(),
  baseRegion: z.string().optional(),
  taxonomyTags: z.array(z.object({
    sectorId: z.number().int(),
    serviceAreaId: z.number().int(),
    specialisationId: z.number().int().nullable().optional(),
  })).min(1).max(30).optional(),
})

export const submitClaimInput = z.object({
  listingId: z.string().uuid(),
  edits: claimEditFields.optional(),
  companiesHouseNumber: z.string().optional(),
  claimEmail: z.string().email().optional(),
})

export type ClaimRouterDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  companiesHouse: CompaniesHouseService
  eventBus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  emailService: EmailService
  notificationDb: NotificationDb
}

// --- Router ---

export function createClaimRouter(deps: ClaimRouterDeps) {
  return router({
    // S2 AC-16, AC-17: pre-populate claim form + endowment messaging + fallback strength
    getClaimContext: verifiedProcedure
      .input(getClaimContextInput)
      .query(async ({ input }) => {
        const listing = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1)

        if (listing.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        const l = listing[0]

        if (l.claimStatus !== "unclaimed") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Listing is not available for claiming",
          })
        }

        const [engagement] = await deps.db
          .select()
          .from(engagements)
          .where(eq(engagements.listingId, input.listingId))

        const [primaryTag] = await deps.db
          .select({ serviceAreaName: taxonomyServiceAreas.name })
          .from(listingTaxonomyTags)
          .innerJoin(
            taxonomyServiceAreas,
            eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id),
          )
          .where(eq(listingTaxonomyTags.listingId, input.listingId))
          .limit(1)

        const profileViews = engagement?.profileViews ?? 0
        const serviceAreaName = primaryTag?.serviceAreaName ?? "production services"
        const endowmentMessaging = getEndowmentMessaging(profileViews, serviceAreaName)
        const profileStrength = computeFallbackProfileStrength(l)

        return {
          listing: {
            id: l.id,
            name: l.name,
            entityType: l.entityType,
            headline: l.headline,
            bio: l.bio,
            contactEmail: l.contactEmail,
            contactPhone: l.contactPhone,
            websiteUrl: l.websiteUrl,
            basePostcode: l.basePostcode,
            baseRegion: l.baseRegion,
            logoUrl: l.logoUrl,
            headshotUrl: l.headshotUrl,
          },
          endowmentMessaging,
          profileStrength,
        }
      }),

    // S3 §2: submit claim with full evaluation (replaces S2 stub)
    submitClaim: verifiedProcedure
      .input(submitClaimInput)
      .mutation(async ({ ctx, input }) => {
        const accountId = ctx.session.accountId

        const [listing] = await deps.db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))

        if (!listing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" })
        }

        // S2: Create pre-claim snapshot with claimantAccountId [AC-46, S3-ST-5]
        const snapshotData = {
          claimantAccountId: accountId,
          originalListing: {
            name: listing.name,
            headline: listing.headline,
            bio: listing.bio,
            contactEmail: listing.contactEmail,
            contactPhone: listing.contactPhone,
            websiteUrl: listing.websiteUrl,
            basePostcode: listing.basePostcode,
            baseRegion: listing.baseRegion,
          },
          pendingEdits: input.edits ?? null,
        }

        // Upsert snapshot — dispute path may already have one for this listing
        await deps.db.insert(preClaimSnapshots).values({
          listingId: input.listingId,
          snapshot: snapshotData,
        }).onConflictDoUpdate({
          target: preClaimSnapshots.listingId,
          set: { snapshot: snapshotData },
        })

        // Cancel S2's 90-day pre_claim_snapshot_cleanup [AC-46, S3-ST-20]
        // S3 manages snapshot lifecycle directly (delete on approval/rejection)
        await cancelDeferredAction(deps.schedulerDb, {
          action: "pre_claim_snapshot_cleanup",
          filterParams: { listingId: input.listingId },
          cancelledBy: "claim_evaluation",
        })

        // S3 §1.3: Full evaluation (replaces S2 stub)
        const claimEmail = input.claimEmail ?? ctx.session.email
        const decision = await evaluateClaim(
          {
            listingId: input.listingId,
            accountId,
            companiesHouseNumber: input.companiesHouseNumber,
            claimEmail,
            evidenceUrls: [],
          },
          listing,
          { db: deps.db, companiesHouse: deps.companiesHouse },
        )

        // S3 §2 Step 6: Log decision [SI §9, AC-9]
        await logDecision(deps.decisionLogDb, {
          domain: "data-and-listings",
          decisionType: "claim_evaluation",
          inputs: {
            listingId: input.listingId,
            entityType: listing.entityType,
            hasChNumber: !!input.companiesHouseNumber,
          },
          output: {
            action: decision.action,
            confidence: "confidence" in decision ? decision.confidence : null,
          },
          confidence: "confidence" in decision ? decision.confidence : undefined,
          listingId: input.listingId,
          accountId,
        })

        // S3 §2 Step 7: Execute decision + post-processing pipelines
        switch (decision.action) {
          case "auto_approve": {
            await onClaimApproved(
              { db: deps.db, schedulerDb: deps.schedulerDb, decisionLogDb: deps.decisionLogDb, emailService: deps.emailService, notificationDb: deps.notificationDb },
              input.listingId, accountId, "auto",
            )
            // Platform emits claim_approved [S1 pattern: tRPC = PP surface, AC-18]
            await deps.eventBus.emit("claim_approved", {
              _brand: "ClaimApprovedEvent" as const,
              listingId: input.listingId,
              accountId,
              method: "auto",
              timestamp: new Date().toISOString(),
            }, deps.waitUntilFn)
            return { status: "approved" as const, listingId: input.listingId }
          }

          case "auto_reject": {
            await onClaimRejected(
              { db: deps.db, decisionLogDb: deps.decisionLogDb, emailService: deps.emailService, notificationDb: deps.notificationDb },
              input.listingId, accountId, decision.reasons, listing.claimStatus,
            )
            // Platform emits claim_rejected [AC-23]
            await deps.eventBus.emit("claim_rejected", {
              _brand: "ClaimRejectedEvent" as const,
              listingId: input.listingId,
              claimantAccountId: accountId,
              reason: decision.reasons.join("; "),
              timestamp: new Date().toISOString(),
            }, deps.waitUntilFn)
            return { status: "rejected" as const, reasons: decision.reasons }
          }

          case "queue_manual_review":
            return { status: "pending_review" as const }

          case "queue_dispute_resolution":
            return { status: "disputed" as const }

          case "retry":
            throw new TRPCError({
              code: "CONFLICT",
              message: decision.reasons.join("; "),
            })
        }
      }),

    // S3 §5.3: Admin manual review callback [AC-27, AC-28, AC-29, AC-30]
    resolveManualReview: adminProcedure
      .input(z.object({
        listingId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reviewNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          await onManualReviewComplete(
            {
              db: deps.db,
              schedulerDb: deps.schedulerDb,
              decisionLogDb: deps.decisionLogDb,
              emailService: deps.emailService,
              notificationDb: deps.notificationDb,
              eventBus: deps.eventBus,
              waitUntilFn: deps.waitUntilFn,
            },
            input.listingId,
            input.decision,
            input.reviewNotes,
            ctx.session.accountId,
          )
        } catch (err) {
          if (err instanceof Error && (err as Error & { code?: string }).code === "BAD_REQUEST") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message })
          }
          throw err
        }
        return { status: input.decision === "approve" ? "approved" as const : "rejected" as const }
      }),
  })
}
