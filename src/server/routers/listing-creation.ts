// Listing creation routes — S2 §3–§4, AC-06 through AC-15
// createFreelancer: verified email → integrity checks → two-phase create → post-creation effects
// createCompany: same flow + full integrity pipeline (CH) + flagged path [S2-ST-13]
// lookupCompaniesHouse: CH lookup for auto-population

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq } from "drizzle-orm"
import { router, verifiedProcedure, protectedProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
  listingTaxonomyTags,
} from "@/db/schema/data-and-listings"
import { runIntegrityChecks } from "@/domains/data-and-listings/integrity"
import type { TaxonomyTag } from "@/domains/data-and-listings/integrity"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { CompaniesHouseService } from "@/lib/services/types"
import type { EmailService } from "@/lib/email/types"
import type { SchedulerDb } from "@/lib/scheduler"
import { generateUniqueSlug } from "@/lib/onboarding/generate-slug"
import { scheduleProgressiveDisclosure } from "@/lib/onboarding/schedule-progressive-disclosure"

// --- Zod schemas (exported for tests) ---

const taxonomyTagInput = z.object({
  sectorId: z.number().int(),
  serviceAreaId: z.number().int(),
  specialisationId: z.number().int().nullable().optional(),
})

export const createFreelancerInput = z.object({
  primarySectorId: z.number().int(),
  primaryServiceAreaId: z.number().int(),
  additionalTags: z.array(taxonomyTagInput).max(20).optional(),
  headline: z.string().min(5).max(200),
  basePostcode: z.string().optional(),
  baseRegion: z.string(),
  dayRate: z.number().int().positive().max(99999).optional(),
  bio: z.string().max(2000).optional(),
  showreelUrl: z.string().url().optional(),
})

export const createCompanyInput = z.object({
  companyName: z.string().min(2).max(100),
  entityType: z.enum(["company", "education", "industry_body", "public_sector", "non_profit"]),
  companiesHouseNumber: z.string().optional(),
  taxonomyTags: z.array(taxonomyTagInput).min(1).max(30),
  bio: z.string().max(2000).optional(),
  websiteUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  basePostcode: z.string().optional(),
  baseRegion: z.string(),
})

export const lookupCompaniesHouseInput = z.object({
  companyNumber: z.string().min(2),
})

export type ListingCreationRouterDeps = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  companiesHouse: CompaniesHouseService
  emailService: EmailService
  schedulerDb: SchedulerDb
}

// --- Post-creation effects (shared by both paths) ---

type PostCreationParams = {
  listingId: string
  accountId: string
  entityType: string
  slug: string
  name: string
  email: string
}

async function executePostCreationEffects(
  deps: ListingCreationRouterDeps,
  params: PostCreationParams,
): Promise<void> {
  // 1. Emit listing_created event
  await deps.bus.emit(
    "listing_created",
    {
      _brand: "ListingCreatedEvent" as const,
      listingId: params.listingId,
      accountId: params.accountId,
      entityType: params.entityType,
      slug: params.slug,
    },
    deps.waitUntilFn,
  )

  // 2. Schedule progressive disclosure (Day 1/3/7)
  await scheduleProgressiveDisclosure(
    deps.schedulerDb,
    { listingId: params.listingId, accountId: params.accountId },
  )

  // 3. Send listing_live email
  await deps.emailService.send({
    to: params.email,
    template: "listing_live",
    data: { name: params.name, slug: params.slug },
    category: "transactional",
    accountId: params.accountId,
    listingId: params.listingId,
  })
}

// --- Two-phase listing creation (shared by both paths) ---

type EntityType = "freelancer" | "company" | "education" | "industry_body" | "public_sector" | "non_profit"

type CreateListingParams = {
  db: Db
  accountId: string
  entityType: EntityType
  name: string
  slug: string
  tags: TaxonomyTag[]
  claimStatus: "claimed" | "pending_review"
  lifecycleStatus: "active" | "suspended"
  verificationTier: "unclaimed" | "claimed" | "verified"
  headline?: string
  bio?: string
  basePostcode?: string
  baseRegion?: string
  dayRate?: number
  companiesHouseNumber?: string
  websiteUrl?: string
  contactEmail?: string
  contactPhone?: string
}

async function createListingWithCompanions(params: CreateListingParams) {
  return params.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(listings)
      .values({
        accountId: params.accountId,
        entityType: params.entityType,
        name: params.name,
        slug: params.slug,
        headline: params.headline,
        bio: params.bio,
        basePostcode: params.basePostcode,
        baseRegion: params.baseRegion,
        dayRate: params.dayRate,
        companiesHouseNumber: params.companiesHouseNumber ?? null,
        websiteUrl: params.websiteUrl,
        contactEmail: params.contactEmail,
        contactPhone: params.contactPhone,
        claimStatus: params.claimStatus,
        lifecycleStatus: params.lifecycleStatus,
        subscriptionTier: "free",
      })
      .returning()

    await tx.insert(verifications).values({
      listingId: created.id,
      tier: params.verificationTier,
      claimedAt: params.claimStatus === "claimed" ? new Date() : null,
    })
    await tx.insert(qualityScores).values({ listingId: created.id })
    await tx.insert(qualityScoreExplanations).values({
      listingId: created.id,
      explanation: { dimensions: {}, suggestions: [] },
    })
    await tx.insert(engagements).values({ listingId: created.id })

    if (params.tags.length > 0) {
      await tx.insert(listingTaxonomyTags).values(
        params.tags.map((t) => ({
          listingId: created.id,
          sectorId: t.sectorId,
          serviceAreaId: t.serviceAreaId,
          specialisationId: t.specialisationId ?? null,
        })),
      )
    }

    return created
  })
}

// --- Router ---

export function createListingCreationRouter(deps: ListingCreationRouterDeps) {
  return router({
    // --- Path A: Freelancer --- S2 §3, AC-06 through AC-10
    createFreelancer: verifiedProcedure
      .input(createFreelancerInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const accountId = ctx.session.accountId
        const accountEmail = ctx.session.email

        const tags: TaxonomyTag[] = [
          { sectorId: input.primarySectorId, serviceAreaId: input.primaryServiceAreaId },
          ...(input.additionalTags ?? []).map((t) => ({
            sectorId: t.sectorId,
            serviceAreaId: t.serviceAreaId,
            specialisationId: t.specialisationId ?? null,
          })),
        ]

        // AC-07: Integrity checks (freelancer: checkDuplicate only, no CH)
        const integrityResult = await runIntegrityChecks(
          { accountId, accountHolderName: accountEmail, companiesHouseNumber: null, tags },
          db,
          deps.companiesHouse,
        )
        if (integrityResult.action !== "allow") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Listing flagged: ${integrityResult.reasons.join(", ")}`,
            cause: integrityResult,
          })
        }

        const slug = await generateUniqueSlug(db, input.headline)

        // AC-06: Two-phase creation with correct defaults
        const result = await createListingWithCompanions({
          db,
          accountId,
          entityType: "freelancer",
          name: input.headline,
          slug,
          tags,
          claimStatus: "claimed",
          lifecycleStatus: "active",
          verificationTier: "claimed",
          headline: input.headline,
          bio: input.bio,
          basePostcode: input.basePostcode,
          baseRegion: input.baseRegion,
          dayRate: input.dayRate,
        })

        // AC-08, AC-09, AC-10: post-creation effects
        await executePostCreationEffects(deps, {
          listingId: result.id,
          accountId,
          entityType: "freelancer",
          slug,
          name: input.headline,
          email: accountEmail,
        })

        return { slug }
      }),

    // --- Path B: Company --- S2 §4, AC-11 through AC-15
    createCompany: verifiedProcedure
      .input(createCompanyInput)
      .mutation(async ({ ctx, input }) => {
        const db = deps.db
        const accountId = ctx.session.accountId
        const accountEmail = ctx.session.email

        const tags: TaxonomyTag[] = input.taxonomyTags.map((t) => ({
          sectorId: t.sectorId,
          serviceAreaId: t.serviceAreaId,
          specialisationId: t.specialisationId ?? null,
        }))

        // AC-14: Full integrity pipeline (duplicate + identity verification + CH uniqueness)
        const integrityResult = await runIntegrityChecks(
          {
            accountId,
            accountHolderName: input.companyName,
            companiesHouseNumber: input.companiesHouseNumber ?? null,
            tags,
          },
          db,
          deps.companiesHouse,
        )

        const slug = await generateUniqueSlug(db, input.companyName)

        // AC-15: Flagged companies are created with suspended + pending_review [S2-ST-13]
        const isFlagged = integrityResult.action !== "allow"

        const result = await createListingWithCompanions({
          db,
          accountId,
          entityType: input.entityType,
          name: input.companyName,
          slug,
          tags,
          claimStatus: isFlagged ? "pending_review" : "claimed",
          lifecycleStatus: isFlagged ? "suspended" : "active",
          verificationTier: isFlagged ? "unclaimed" : "claimed",
          bio: input.bio,
          baseRegion: input.baseRegion,
          basePostcode: input.basePostcode,
          companiesHouseNumber: input.companiesHouseNumber,
          websiteUrl: input.websiteUrl,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
        })

        if (isFlagged) {
          return {
            status: "flagged" as const,
            reason: integrityResult.reasons.join(", "),
            listingId: result.id,
          }
        }

        // Post-creation effects only for non-flagged listings
        await executePostCreationEffects(deps, {
          listingId: result.id,
          accountId,
          entityType: input.entityType,
          slug,
          name: input.companyName,
          email: accountEmail,
        })

        return { status: "created" as const, slug }
      }),

    // --- CH Lookup --- S2 §4.2, AC-12, AC-13
    lookupCompaniesHouse: protectedProcedure
      .input(lookupCompaniesHouseInput)
      .query(async ({ input }) => {
        const result = await deps.companiesHouse.lookup(input.companyNumber)

        if (!result.found) {
          return { found: false as const }
        }

        return {
          found: true as const,
          name: result.name ?? null,
          status: result.status ?? null,
          registeredAddress: result.registeredAddress ?? null,
          // AC-13: dissolved warning surfaced via status field — UI renders warning
          dissolved: result.status === "dissolved",
        }
      }),
  })
}

// --- Helpers ---

