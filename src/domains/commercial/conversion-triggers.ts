// Conversion trigger engine — S8 §1, CR §5.3
// 6 trigger evaluators, state tracking, cooldown, endowment CTA, state reset.
// Exported functions are imported by §10 consumer handlers (CS-WORK-073) and the commercial router.

import { eq, and, ne, sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { EmailService } from "@/lib/email/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import { logDecision } from "@/lib/decisions/logger"
import { commercialState } from "@/db/schema/commercial"
import { listings, listingTaxonomyTags, taxonomyServiceAreas } from "@/db/schema/data-and-listings"
import { getEngagementCounters, type EngagementCounters } from "@/domains/data-and-listings/queries/engagement-counters"
import { user } from "@/db/schema/auth"
import { computeTaxonomyOverlap } from "@/domains/data-and-listings/taxonomy/overlap"
import type { TaxonomyTag } from "@/domains/data-and-listings/integrity/types"
import type { ConversionMilestoneId } from "@/lib/events/types"
import { registerTemplate, hasTemplate } from "@/lib/email/templates"

// --- Types ---

export type ConversionTriggerType =
  | "first_enquiry"
  | "competitor_upgraded"
  | "analytics_teaser"
  | "social_proof"
  | "view_milestone"
  | "engagement_summary"

export type { EngagementCounters }

type CommercialStateRow = typeof commercialState.$inferSelect

export type TriggerResult =
  | { fired: false; reason: string }
  | {
      fired: true
      trigger: ConversionTriggerType
      reason?: undefined
      milestoneValue?: number
      stateUpdate: Partial<CommercialStateRow>
    }

type TriggerAction =
  | { type: "emit_conversion_milestone"; milestone: ConversionMilestoneId; label: string }
  | { type: "send_email"; template: string; mergeFields: Record<string, unknown> }
  | { type: "none" }

export type UpgradeSuggestion = {
  triggerType: ConversionTriggerType | null
  headline: string
  description: string
  upgradeUrl: string | null
  dismissable: boolean
}

export type EndowmentCtaResult =
  | { show: false; reason: string }
  | { show: true; variant: "engagement" | "category_fallback"; message: string; target: string; placement: string }

export type ConversionTriggerState = {
  listingId: string
  lastViewMilestoneFired: number | null
  firstEnquiryTriggerFired: boolean
  competitorUpgradedFired: number
  analyticsTeaseFired: number
  socialProofFired: number
  engagementSummaryFired: number
  endowmentCtaShown: boolean
}

export type ConversionTriggerDeps = {
  db: Db
  decisionLogDb: DecisionLogDb
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
}

// --- Constants ---

const VIEW_MILESTONES = [50, 100, 200] as const
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://callsheet.co.uk"

export function buildUpgradeUrl(listingId: string, tier?: string): string {
  const base = `${BASE_URL}/pricing?listing=${listingId}`
  return tier ? `${base}&tier=${tier}` : base
}

// Priority order for evaluateUpgradeSuggestion
const PRIORITY_ORDER: ConversionTriggerType[] = [
  "first_enquiry",
  "view_milestone",
  "competitor_upgraded",
  "engagement_summary",
  "analytics_teaser",
  "social_proof",
]

// --- Helpers ---

function daysSince(date: Date | string | null): number {
  if (!date) return Infinity
  const d = typeof date === "string" ? new Date(date) : date
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

// --- Get or create commercial_state row ---

async function getOrCreateState(db: Db, listingId: string): Promise<CommercialStateRow> {
  const [existing] = await db.select().from(commercialState).where(eq(commercialState.listingId, listingId)).limit(1)
  if (existing) return existing

  const [created] = await db.insert(commercialState).values({ listingId }).returning()
  return created
}

async function updateState(db: Db, listingId: string, update: Partial<CommercialStateRow>): Promise<void> {
  await db.update(commercialState)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(commercialState.listingId, listingId))
}

// --- 6 Trigger Evaluators ---

export function evaluateViewMilestone(
  engagement: EngagementCounters,
  state: CommercialStateRow,
): TriggerResult {
  const lastFired = state.lastViewMilestoneFired ?? 0
  const nextMilestone = VIEW_MILESTONES.find(m => m > lastFired)

  if (!nextMilestone) return { fired: false, reason: "all_milestones_exhausted" }
  if (engagement.profileViews < nextMilestone) return { fired: false, reason: "threshold_not_reached" }

  // Cooldown: 7 days since last view milestone
  if (state.lastViewMilestoneFired !== null && daysSince(state.updatedAt) < 7) {
    return { fired: false, reason: "cooldown_active" }
  }

  return {
    fired: true,
    trigger: "view_milestone",
    milestoneValue: nextMilestone,
    stateUpdate: { lastViewMilestoneFired: nextMilestone },
  }
}

export function evaluateFirstEnquiry(
  engagement: EngagementCounters,
  state: CommercialStateRow,
): TriggerResult {
  if (state.firstEnquiryTriggerFired) return { fired: false, reason: "already_fired" }
  if (engagement.enquiriesReceived !== 1) return { fired: false, reason: "not_first_enquiry" }

  return {
    fired: true,
    trigger: "first_enquiry",
    stateUpdate: { firstEnquiryTriggerFired: true },
  }
}

export function evaluateCompetitorUpgraded(
  state: CommercialStateRow,
  overlap: number,
  poolSize: number,
): TriggerResult {
  if (state.competitorUpgradedFired >= 3) return { fired: false, reason: "max_firings_reached" }

  if (state.lastCompetitorUpgradedAt && daysSince(state.lastCompetitorUpgradedAt) < 30) {
    return { fired: false, reason: "cooldown_active" }
  }

  if (overlap < 0.5) return { fired: false, reason: "insufficient_overlap" }
  if (poolSize < 20) return { fired: false, reason: "pool_too_small_for_anonymity" }

  return {
    fired: true,
    trigger: "competitor_upgraded",
    stateUpdate: {
      competitorUpgradedFired: state.competitorUpgradedFired + 1,
      lastCompetitorUpgradedAt: new Date(),
    },
  }
}

export function evaluateAnalyticsTeaser(
  engagement: EngagementCounters,
  state: CommercialStateRow,
): TriggerResult {
  if (engagement.profileViews === 0) return { fired: false, reason: "no_engagement" }

  if (state.lastAnalyticsTeaseAt && daysSince(state.lastAnalyticsTeaseAt) < 14) {
    return { fired: false, reason: "cooldown_active" }
  }

  return {
    fired: true,
    trigger: "analytics_teaser",
    stateUpdate: {
      analyticsTeaseFired: state.analyticsTeaseFired + 1,
      lastAnalyticsTeaseAt: new Date(),
    },
  }
}

export function evaluateSocialProof(
  state: CommercialStateRow,
  paidInSector: number,
): TriggerResult {
  if (state.lastSocialProofAt && daysSince(state.lastSocialProofAt) < 30) {
    return { fired: false, reason: "cooldown_active" }
  }

  if (paidInSector < 3) return { fired: false, reason: "insufficient_paid_competitors" }

  return {
    fired: true,
    trigger: "social_proof",
    stateUpdate: {
      socialProofFired: state.socialProofFired + 1,
      lastSocialProofAt: new Date(),
    },
  }
}

export function evaluateEngagementSummary(
  engagement: EngagementCounters,
  state: CommercialStateRow,
): TriggerResult {
  if (engagement.profileViews === 0 && engagement.enquiriesReceived === 0) {
    return { fired: false, reason: "no_engagement_data" }
  }

  if (state.lastEngagementSummaryAt && daysSince(state.lastEngagementSummaryAt) < 7) {
    return { fired: false, reason: "cooldown_active" }
  }

  return {
    fired: true,
    trigger: "engagement_summary",
    stateUpdate: {
      engagementSummaryFired: state.engagementSummaryFired + 1,
      lastEngagementSummaryAt: new Date(),
    },
  }
}

// --- Action resolution ---

function resolveAction(
  trigger: ConversionTriggerType,
  result: Extract<TriggerResult, { fired: true }>,
  listingName: string,
  listingId: string,
  engagement: EngagementCounters,
): TriggerAction {
  switch (trigger) {
    case "view_milestone":
      return {
        type: "send_email",
        template: "conversion_view_milestone",
        mergeFields: {
          listingName,
          milestoneValue: result.milestoneValue!,
          upgradeUrl: buildUpgradeUrl(listingId),
        },
      }
    case "first_enquiry":
      return {
        type: "emit_conversion_milestone",
        milestone: "first_subscription",
        label: "You just received your first enquiry! Upgrade to see which companies are viewing your profile.",
      }
    case "competitor_upgraded":
      return {
        type: "send_email",
        template: "conversion_social_proof",
        mergeFields: {
          listingName,
          competitorName: "Providers in your service area",
          upgradeUrl: buildUpgradeUrl(listingId),
        },
      }
    case "analytics_teaser":
      return {
        type: "send_email",
        template: "conversion_analytics_teaser",
        mergeFields: {
          listingName,
          viewCount: engagement.profileViews,
          searchAppearanceCount: engagement.searchAppearances,
          upgradeUrl: buildUpgradeUrl(listingId),
        },
      }
    case "social_proof":
      return {
        type: "send_email",
        template: "conversion_social_proof",
        mergeFields: {
          listingName,
          competitorName: "Providers in your service area",
          upgradeUrl: buildUpgradeUrl(listingId),
        },
      }
    case "engagement_summary":
      return {
        type: "send_email",
        template: "conversion_engagement_summary",
        mergeFields: {
          listingName,
          viewCount: engagement.profileViews,
          enquiryCount: engagement.enquiriesReceived,
          upgradeUrl: buildUpgradeUrl(listingId),
        },
      }
  }
}

// --- Headline/description builders for UpgradeSuggestion ---

function buildHeadline(trigger: ConversionTriggerType, result: Extract<TriggerResult, { fired: true }>): string {
  switch (trigger) {
    case "view_milestone":
      return `Your listing was viewed ${result.milestoneValue} times`
    case "first_enquiry":
      return "You just received your first enquiry!"
    case "competitor_upgraded":
      return "Competitors in your area are upgrading"
    case "analytics_teaser":
      return "See who's viewing your profile"
    case "social_proof":
      return "Other providers in your sector are getting more visibility"
    case "engagement_summary":
      return "Your weekly engagement summary is ready"
  }
}

function buildDescription(trigger: ConversionTriggerType): string {
  switch (trigger) {
    case "view_milestone":
      return "Upgrade to see exactly who viewed your profile and get priority placement"
    case "first_enquiry":
      return "Upgrade to see which companies are viewing your profile"
    case "competitor_upgraded":
      return "Stay competitive with enhanced visibility and analytics"
    case "analytics_teaser":
      return "Upgrade for full analytics: views, search appearances, and enquiry tracking"
    case "social_proof":
      return "Join other providers who are investing in their visibility"
    case "engagement_summary":
      return "Upgrade for detailed engagement insights and priority search placement"
  }
}

// --- Execute action (emit event or send email) ---

async function executeAction(
  action: TriggerAction,
  listingId: string,
  accountId: string,
  accountEmail: string,
  deps: ConversionTriggerDeps,
): Promise<void> {
  if (action.type === "emit_conversion_milestone") {
    deps.waitUntilFn(
      deps.bus.emit("conversion_milestone", {
        _brand: "ConversionMilestoneEvent" as const,
        listingId,
        accountId,
        milestone: action.milestone,
        milestoneLabel: action.label,
        timestamp: new Date().toISOString(),
      }, deps.waitUntilFn),
    )
  } else if (action.type === "send_email") {
    await deps.emailService.send({
      to: accountEmail,
      template: action.template as Parameters<typeof deps.emailService.send>[0]["template"],
      data: action.mergeFields,
      category: "conversion_marketing",
      accountId,
    })
  }
}

// --- DB queries for trigger evaluation ---

async function getListingTaxonomyTags(db: Db, listingId: string): Promise<TaxonomyTag[]> {
  const rows = await db.select({
    sectorId: taxonomyServiceAreas.sectorId,
    serviceAreaId: listingTaxonomyTags.serviceAreaId,
  })
    .from(listingTaxonomyTags)
    .innerJoin(taxonomyServiceAreas, eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id))
    .where(eq(listingTaxonomyTags.listingId, listingId))

  return rows.map(r => ({
    sectorId: r.sectorId,
    serviceAreaId: r.serviceAreaId,
  }))
}

async function countPaidListingsInSameSector(db: Db, listingId: string): Promise<number> {
  // Get listing's sectors
  const tags = await getListingTaxonomyTags(db, listingId)
  if (tags.length === 0) return 0
  const sectorIds = [...new Set(tags.map(t => t.sectorId))]

  // Count paid listings in those sectors (excluding this listing)
  const result = await db.select({ count: sql<number>`count(distinct ${listings.id})` })
    .from(listings)
    .innerJoin(listingTaxonomyTags, eq(listings.id, listingTaxonomyTags.listingId))
    .innerJoin(taxonomyServiceAreas, eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id))
    .where(
      and(
        ne(listings.id, listingId),
        ne(listings.subscriptionTier, "free"),
        sql`${listings.lifecycleStatus} = 'active'`,
        sql`${taxonomyServiceAreas.sectorId} IN (${sql.join(sectorIds.map(id => sql`${id}`), sql`, `)})`,
      ),
    )

  return Number(result[0]?.count ?? 0)
}

async function countFreeTierListingsInSameSector(db: Db, listingId: string): Promise<number> {
  const tags = await getListingTaxonomyTags(db, listingId)
  if (tags.length === 0) return 0
  const sectorIds = [...new Set(tags.map(t => t.sectorId))]

  const result = await db.select({ count: sql<number>`count(distinct ${listings.id})` })
    .from(listings)
    .innerJoin(listingTaxonomyTags, eq(listings.id, listingTaxonomyTags.listingId))
    .innerJoin(taxonomyServiceAreas, eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id))
    .where(
      and(
        ne(listings.id, listingId),
        sql`${listings.subscriptionTier} = 'free'`,
        sql`${listings.lifecycleStatus} = 'active'`,
        sql`${taxonomyServiceAreas.sectorId} IN (${sql.join(sectorIds.map(id => sql`${id}`), sql`, `)})`,
      ),
    )

  return Number(result[0]?.count ?? 0)
}

// --- Core evaluation wrapper ---

export async function evaluateConversionTrigger(
  triggerType: ConversionTriggerType,
  listingId: string,
  subscriptionTier: string,
  engagement: EngagementCounters,
  deps: ConversionTriggerDeps,
  extra?: { upgradedListingId?: string },
): Promise<{ result: TriggerResult; action: TriggerAction }> {
  const noFire = (reason: string) => ({
    result: { fired: false as const, reason },
    action: { type: "none" as const },
  })

  if (subscriptionTier !== "free") {
    await logTriggerDecision(deps.decisionLogDb, triggerType, listingId, subscriptionTier, false, "not_free_tier")
    return noFire("not_free_tier")
  }

  const state = await getOrCreateState(deps.db, listingId)

  let result: TriggerResult
  switch (triggerType) {
    case "view_milestone":
      result = evaluateViewMilestone(engagement, state)
      break
    case "first_enquiry":
      result = evaluateFirstEnquiry(engagement, state)
      break
    case "competitor_upgraded": {
      const targetTags = await getListingTaxonomyTags(deps.db, listingId)
      const upgradedTags = extra?.upgradedListingId
        ? await getListingTaxonomyTags(deps.db, extra.upgradedListingId)
        : []
      const overlap = computeTaxonomyOverlap(targetTags, upgradedTags)
      const poolSize = await countFreeTierListingsInSameSector(deps.db, listingId)
      result = evaluateCompetitorUpgraded(state, overlap, poolSize)
      break
    }
    case "analytics_teaser":
      result = evaluateAnalyticsTeaser(engagement, state)
      break
    case "social_proof": {
      const paidCount = await countPaidListingsInSameSector(deps.db, listingId)
      result = evaluateSocialProof(state, paidCount)
      break
    }
    case "engagement_summary":
      result = evaluateEngagementSummary(engagement, state)
      break
  }

  await logTriggerDecision(
    deps.decisionLogDb,
    triggerType,
    listingId,
    subscriptionTier,
    result.fired,
    result.fired ? undefined : result.reason,
  )

  if (!result.fired) return { result, action: { type: "none" } }

  await updateState(deps.db, listingId, result.stateUpdate)

  const [listing] = await deps.db.select({ name: listings.name }).from(listings).where(eq(listings.id, listingId)).limit(1)
  const action = resolveAction(triggerType, result, listing?.name ?? "Your listing", listingId, engagement)
  return { result, action }
}

// --- Decision logging helper (AC-13) ---

async function logTriggerDecision(
  decisionLogDb: DecisionLogDb,
  triggerType: ConversionTriggerType,
  listingId: string,
  subscriptionTier: string,
  fired: boolean,
  reason?: string,
): Promise<void> {
  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "conversion_trigger_evaluation",
    inputs: { triggerType, listingId, subscriptionTier },
    output: { fired, ...(reason ? { reason } : {}) },
    listingId,
  })
}

// --- evaluateUpgradeSuggestion (AC-10) ---

export async function evaluateUpgradeSuggestion(
  listingId: string,
  accountId: string,
  deps: ConversionTriggerDeps,
): Promise<UpgradeSuggestion | null> {
  const [listing] = await deps.db.select().from(listings).where(eq(listings.id, listingId)).limit(1)
  if (!listing || listing.accountId !== accountId) return null
  if (listing.subscriptionTier !== "free") return null

  const engagement = await getEngagementCounters(deps.db, listingId)

  // Get account email for email sends
  const [userRow] = await deps.db.select({ email: user.email })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1)

  for (const triggerType of PRIORITY_ORDER) {
    // Skip competitor_upgraded — event-driven only, not dashboard-evaluated
    if (triggerType === "competitor_upgraded") continue

    const { result, action } = await evaluateConversionTrigger(
      triggerType,
      listingId,
      listing.subscriptionTier,
      engagement,
      deps,
    )

    if (result.fired && action.type !== "none") {
      await executeAction(action, listingId, accountId, userRow?.email ?? "", deps)

      return {
        triggerType,
        headline: buildHeadline(triggerType, result),
        description: buildDescription(triggerType),
        upgradeUrl: buildUpgradeUrl(listingId),
        dismissable: true,
      }
    }
  }

  return null
}

// --- getConversionTriggerState (AC-11) ---

export async function getConversionTriggerState(
  db: Db,
  listingId: string,
): Promise<ConversionTriggerState> {
  const [state] = await db.select().from(commercialState).where(eq(commercialState.listingId, listingId)).limit(1)

  if (!state) {
    return {
      listingId,
      lastViewMilestoneFired: null,
      firstEnquiryTriggerFired: false,
      competitorUpgradedFired: 0,
      analyticsTeaseFired: 0,
      socialProofFired: 0,
      engagementSummaryFired: 0,
      endowmentCtaShown: false,
    }
  }

  return {
    listingId,
    lastViewMilestoneFired: state.lastViewMilestoneFired,
    firstEnquiryTriggerFired: state.firstEnquiryTriggerFired,
    competitorUpgradedFired: state.competitorUpgradedFired,
    analyticsTeaseFired: state.analyticsTeaseFired,
    socialProofFired: state.socialProofFired,
    engagementSummaryFired: state.engagementSummaryFired,
    endowmentCtaShown: state.endowmentCtaShown,
  }
}

// --- Endowment CTA (AC-6) ---

export async function evaluateEndowmentCta(
  listingId: string,
  deps: ConversionTriggerDeps,
): Promise<EndowmentCtaResult> {
  const state = await getOrCreateState(deps.db, listingId)
  if (state.endowmentCtaShown) return { show: false, reason: "already_shown" }

  const engagement = await getEngagementCounters(deps.db, listingId)

  if (engagement.profileViews >= 5) {
    await updateState(deps.db, listingId, { endowmentCtaShown: true })
    return {
      show: true,
      variant: "engagement",
      message: "See who's viewing your profile",
      target: "/pricing",
      placement: "analytics_section",
    }
  }

  // Category fallback — use aggregate monthly search data when individual engagement is low
  const tags = await getListingTaxonomyTags(deps.db, listingId)
  if (tags.length > 0) {
    // Simplified: count search events in the sector as a proxy for monthlySearches
    // At V1 there may be no search data, so this fallback rarely triggers early on
    const sectorIds = [...new Set(tags.map(t => t.sectorId))]
    const [sectorData] = await deps.db.select({
      name: taxonomyServiceAreas.name,
    })
      .from(taxonomyServiceAreas)
      .where(sql`${taxonomyServiceAreas.sectorId} IN (${sql.join(sectorIds.map(id => sql`${id}`), sql`, `)})`)
      .limit(1)

    // Category fallback: for V1, use a heuristic based on listing count as proxy
    const [countResult] = await deps.db.select({ count: sql<number>`count(*)` })
      .from(listings)
      .innerJoin(listingTaxonomyTags, eq(listings.id, listingTaxonomyTags.listingId))
      .innerJoin(taxonomyServiceAreas, eq(listingTaxonomyTags.serviceAreaId, taxonomyServiceAreas.id))
      .where(
        and(
          sql`${listings.lifecycleStatus} = 'active'`,
          sql`${taxonomyServiceAreas.sectorId} IN (${sql.join(sectorIds.map(id => sql`${id}`), sql`, `)})`,
        ),
      )

    const listingCount = Number(countResult?.count ?? 0)
    // Use listing count > 20 as proxy for "monthlySearches > 20"
    if (listingCount > 20 && sectorData) {
      // Do NOT set endowmentCtaShown — category fallback is persistent
      return {
        show: true,
        variant: "category_fallback",
        message: `Providers in ${sectorData.name} receive views every month — upgrade to track yours.`,
        target: "/pricing",
        placement: "analytics_section",
      }
    }
  }

  return { show: false, reason: "insufficient_data" }
}

// --- State reset on claim_approved (AC-12) ---

export async function resetConversionTriggerState(
  db: Db,
  listingId: string,
): Promise<void> {
  const [existing] = await db.select().from(commercialState).where(eq(commercialState.listingId, listingId)).limit(1)
  if (!existing) return

  await db.update(commercialState).set({
    // Reset all trigger state
    lastViewMilestoneFired: null,
    firstEnquiryTriggerFired: false,
    competitorUpgradedFired: 0,
    lastCompetitorUpgradedAt: null,
    analyticsTeaseFired: 0,
    lastAnalyticsTeaseAt: null,
    socialProofFired: 0,
    lastSocialProofAt: null,
    engagementSummaryFired: 0,
    lastEngagementSummaryAt: null,
    endowmentCtaShown: false,
    // Preserve churn fields (AC-12)
    // lastChurnEventAt, lastChurnReason, effectivePriceAtSubscription are NOT reset
    updatedAt: new Date(),
  }).where(eq(commercialState.listingId, listingId))
}

// --- Email template registration ---

export function registerConversionViewMilestoneTemplate(): void {
  if (hasTemplate("conversion_view_milestone")) return
  registerTemplate("conversion_view_milestone", (data) => ({
    subject: `Your CALLSHEET listing reached ${data.milestoneValue} views`,
    html: `
      <h2>Milestone reached!</h2>
      <p>Your listing <strong>${data.listingName}</strong> has been viewed ${data.milestoneValue} times.</p>
      <p>Upgrade to see exactly who's viewing your profile.</p>
      <p><a href="${data.upgradeUrl}">Upgrade now</a></p>
    `.trim(),
  }))
}

export function registerConversionAnalyticsTeaserTemplate(): void {
  if (hasTemplate("conversion_analytics_teaser")) return
  registerTemplate("conversion_analytics_teaser", (data) => ({
    subject: "Your CALLSHEET listing analytics preview",
    html: `
      <h2>Your engagement snapshot</h2>
      <p><strong>${data.listingName}</strong> has ${data.viewCount} profile views and ${data.searchAppearanceCount} search appearances.</p>
      <p>Upgrade for full analytics: detailed views, search trends, and enquiry tracking.</p>
      <p><a href="${data.upgradeUrl}">See full analytics</a></p>
    `.trim(),
  }))
}

export function registerConversionSocialProofTemplate(): void {
  if (hasTemplate("conversion_social_proof")) return
  registerTemplate("conversion_social_proof", (data) => ({
    subject: "Providers in your area are upgrading on CALLSHEET",
    html: `
      <h2>Stay competitive</h2>
      <p>${data.competitorName} have upgraded their visibility on CALLSHEET.</p>
      <p>Upgrade <strong>${data.listingName}</strong> to appear alongside them.</p>
      <p><a href="${data.upgradeUrl}">Upgrade now</a></p>
    `.trim(),
  }))
}

export function registerConversionEngagementSummaryTemplate(): void {
  if (hasTemplate("conversion_engagement_summary")) return
  registerTemplate("conversion_engagement_summary", (data) => ({
    subject: "Your CALLSHEET weekly engagement summary",
    html: `
      <h2>Your engagement this week</h2>
      <p><strong>${data.listingName}</strong>: ${data.viewCount} views, ${data.enquiryCount} enquiries.</p>
      <p>Upgrade for detailed engagement insights and priority search placement.</p>
      <p><a href="${data.upgradeUrl}">Upgrade now</a></p>
    `.trim(),
  }))
}

export function registerAllConversionTemplates(): void {
  registerConversionViewMilestoneTemplate()
  registerConversionAnalyticsTeaserTemplate()
  registerConversionSocialProofTemplate()
  registerConversionEngagementSummaryTemplate()
}

// Module-level registration
registerAllConversionTemplates()
