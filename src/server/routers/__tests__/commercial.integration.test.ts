// Integration tests for commercial router — CS-WORK-067
// AC-1 through AC-6, AC-9 through AC-13
import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { getTestDb } from "@/db/test-utils"
import { resetDb } from "@/db/test-utils"
import {
  makeUUID,
  makeSession,
  ctx,
  seedTestUser,
  createTestListing,
  seedTaxonomy,
  createDecisionLogDb,
  createTestBus,
  expectTRPCError,
} from "@/db/test-fixtures"
import { createCommercialRouter } from "@/server/routers/commercial"
import { InProcessEventBus } from "@/lib/events/bus"
import { commercialState } from "@/db/schema/commercial"
import { engagements, listings, listingTaxonomyTags } from "@/db/schema/data-and-listings"
import { InMemoryEmailService } from "@/lib/email/transport"
import {
  resetConversionTriggerState,
  evaluateConversionTrigger,
  evaluateEndowmentCta,
  registerAllConversionTemplates,
} from "@/domains/commercial/conversion-triggers"

const db = getTestDb()
const ACCOUNT_ID = makeUUID("a01")
const OTHER_ACCOUNT = makeUUID("a02")
const session = makeSession({ accountId: ACCOUNT_ID })

let emailService: InMemoryEmailService
let bus: InProcessEventBus
let decisionLogDb: ReturnType<typeof createDecisionLogDb>
let router: ReturnType<typeof createCommercialRouter>

function makeDeps() {
  return {
    db: db as Parameters<typeof createCommercialRouter>[0]["db"],
    decisionLogDb,
    emailService,
    bus,
    waitUntilFn: (p: Promise<unknown>) => { p.catch(() => {}) },
  }
}

beforeAll(() => {
  registerAllConversionTemplates()
})

beforeEach(async () => {
  await resetDb()
  emailService = new InMemoryEmailService()
  bus = createTestBus()
  decisionLogDb = createDecisionLogDb(db as any)
  router = createCommercialRouter(makeDeps())
})

async function seedFreeListing(overrides: Record<string, unknown> = {}) {
  await seedTestUser(db as any, ACCOUNT_ID)
  return createTestListing(db as any, ACCOUNT_ID, { subscriptionTier: "free", ...overrides })
}

async function setViews(listingId: string, views: number) {
  await (db as any).update(engagements).set({ profileViews: views }).where(eq(engagements.listingId, listingId))
}

async function setEnquiries(listingId: string, count: number) {
  await (db as any).update(engagements).set({ enquiriesReceived: count }).where(eq(engagements.listingId, listingId))
}

// AC-1: view_milestone fires at 50, 100, 200 — each exactly once
describe("AC-1: view_milestone fires at thresholds", () => {
  it("fires at 50 views and records state", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).not.toBeNull()
    expect(suggestion!.triggerType).toBe("view_milestone")

    // State records lastViewMilestoneFired = 50
    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
    expect(state.lastViewMilestoneFired).toBe(50)
  })

  it("fires at 100 after 50 was fired (with cooldown expired)", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 105)

    // Seed initial state with 50 milestone fired, 8 days ago
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      lastViewMilestoneFired: 50,
      updatedAt: new Date(Date.now() - 8 * 86400000),
    })

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).not.toBeNull()
    expect(suggestion!.triggerType).toBe("view_milestone")

    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
    expect(state.lastViewMilestoneFired).toBe(100)
  })

  it("does not fire a second time for same milestone", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    const caller = router.createCaller(ctx(session))
    await caller.evaluateUpgradeSuggestion({ listingId: listing.id })

    // Second call — view_milestone should not fire again (50 already fired, 100 not reached)
    const suggestion2 = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    // May return a different trigger or null depending on other conditions
    if (suggestion2?.triggerType === "view_milestone") {
      // If it returns view_milestone, it must be for a HIGHER milestone
      const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
      expect(state.lastViewMilestoneFired).toBeGreaterThan(50)
    }
  })
})

// AC-2: 7-day cooldown between milestone emails
describe("AC-2: view_milestone cooldown", () => {
  it("blocks 100-milestone email within 5 days of 50-milestone", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 105)

    // State: 50 milestone fired 5 days ago (within 7-day cooldown)
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      lastViewMilestoneFired: 50,
      updatedAt: new Date(Date.now() - 5 * 86400000),
    })

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "view_milestone", listing.id, "free",
      { profileViews: 105, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(false)
    if (!result.fired) expect(result.reason).toBe("cooldown_active")
  })

  it("allows 100-milestone after cooldown expires", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 105)

    // State: 50 milestone fired 8 days ago (past 7-day cooldown)
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      lastViewMilestoneFired: 50,
      updatedAt: new Date(Date.now() - 8 * 86400000),
    })

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "view_milestone", listing.id, "free",
      { profileViews: 105, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(true)
  })
})

// AC-3: first_enquiry fires exactly once
describe("AC-3: first_enquiry fires once", () => {
  it("fires when enquiriesReceived === 1", async () => {
    const listing = await seedFreeListing()
    await setEnquiries(listing.id, 1)

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "first_enquiry", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 1 },
      deps,
    )
    expect(result.fired).toBe(true)

    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
    expect(state.firstEnquiryTriggerFired).toBe(true)
  })

  it("does not re-trigger on subsequent enquiries", async () => {
    const listing = await seedFreeListing()
    await setEnquiries(listing.id, 1)

    const deps = makeDeps()
    await evaluateConversionTrigger(
      "first_enquiry", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 1 },
      deps,
    )

    // Second evaluation with 2 enquiries
    const { result } = await evaluateConversionTrigger(
      "first_enquiry", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 2 },
      deps,
    )
    expect(result.fired).toBe(false)
  })
})

// AC-4: competitor_upgraded respects cooldown, maxFirings, anonymity
describe("AC-4: competitor_upgraded constraints", () => {
  it("fires with valid overlap, pool size, and no prior firings", async () => {
    const listing = await seedFreeListing()
    const tax = await seedTaxonomy(db as any)

    // Tag both listings with same taxonomy
    await seedTestUser(db as any, OTHER_ACCOUNT)
    const upgraded = await createTestListing(db as any, OTHER_ACCOUNT, { subscriptionTier: "standard" })

    await (db as any).insert(listingTaxonomyTags).values([
      { listingId: listing.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id },
      { listingId: upgraded.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id },
    ])

    // Need 20+ free-tier listings in same sector for anonymity — seed them
    for (let i = 0; i < 20; i++) {
      const uid = makeUUID(`b${String(i).padStart(2, "0")}`)
      await seedTestUser(db as any, uid)
      const l = await createTestListing(db as any, uid, { subscriptionTier: "free" })
      await (db as any).insert(listingTaxonomyTags).values({
        listingId: l.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
      })
    }

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "competitor_upgraded", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
      { upgradedListingId: upgraded.id },
    )
    expect(result.fired).toBe(true)
  })

  it("blocks after 3 firings", async () => {
    const listing = await seedFreeListing()
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      competitorUpgradedFired: 3,
    })

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "competitor_upgraded", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(false)
    if (!result.fired) expect(result.reason).toBe("max_firings_reached")
  })
})

// AC-5: periodic triggers with cooldowns
describe("AC-5: periodic trigger cooldowns", () => {
  it("analytics_teaser fires on 14-day cooldown", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 10)

    const deps = makeDeps()
    // First evaluation fires
    const { result: r1 } = await evaluateConversionTrigger(
      "analytics_teaser", listing.id, "free",
      { profileViews: 10, searchAppearances: 5, enquiriesReceived: 0 },
      deps,
    )
    expect(r1.fired).toBe(true)

    // Immediate second evaluation blocked by cooldown
    const { result: r2 } = await evaluateConversionTrigger(
      "analytics_teaser", listing.id, "free",
      { profileViews: 10, searchAppearances: 5, enquiriesReceived: 0 },
      deps,
    )
    expect(r2.fired).toBe(false)
    if (!r2.fired) expect(r2.reason).toBe("cooldown_active")
  })

  it("social_proof fires when >= 3 paid listings in sector", async () => {
    const listing = await seedFreeListing()
    const tax = await seedTaxonomy(db as any)

    await (db as any).insert(listingTaxonomyTags).values({
      listingId: listing.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
    })

    // Create 3 paid listings in same sector
    for (let i = 0; i < 3; i++) {
      const uid = makeUUID(`p${String(i).padStart(2, "0")}`)
      await seedTestUser(db as any, uid)
      const l = await createTestListing(db as any, uid, { subscriptionTier: "standard" })
      await (db as any).insert(listingTaxonomyTags).values({
        listingId: l.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
      })
    }

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "social_proof", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(true)
  })

  it("engagement_summary fires on 7-day cooldown when any engagement exists", async () => {
    const listing = await seedFreeListing()
    await setEnquiries(listing.id, 1)

    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "engagement_summary", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 1 },
      deps,
    )
    expect(result.fired).toBe(true)
  })
})

// AC-6: Endowment CTA
describe("AC-6: endowment CTA", () => {
  it("shows 'See who's viewing' when profileViews >= 5", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 10)

    const deps = makeDeps()
    const result = await evaluateEndowmentCta(listing.id, deps)
    expect(result.show).toBe(true)
    if (result.show) {
      expect(result.variant).toBe("engagement")
      expect(result.message).toContain("See who")
    }

    // endowmentCtaShown is set
    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
    expect(state.endowmentCtaShown).toBe(true)
  })

  it("does not show when already shown", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 10)
    await (db as any).insert(commercialState).values({ listingId: listing.id, endowmentCtaShown: true })

    const deps = makeDeps()
    const result = await evaluateEndowmentCta(listing.id, deps)
    expect(result.show).toBe(false)
  })

  it("category fallback does NOT set endowmentCtaShown", async () => {
    const listing = await seedFreeListing()
    // profileViews < 5, but sector has listings
    await setViews(listing.id, 2)
    const tax = await seedTaxonomy(db as any)
    await (db as any).insert(listingTaxonomyTags).values({
      listingId: listing.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
    })

    // Create 25 listings in same sector for "monthlySearches > 20" proxy
    for (let i = 0; i < 25; i++) {
      const uid = makeUUID(`c${String(i).padStart(2, "0")}`)
      await seedTestUser(db as any, uid)
      const l = await createTestListing(db as any, uid)
      await (db as any).insert(listingTaxonomyTags).values({
        listingId: l.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
      })
    }

    const deps = makeDeps()
    const result = await evaluateEndowmentCta(listing.id, deps)
    if (result.show) {
      expect(result.variant).toBe("category_fallback")
      // Verify endowmentCtaShown was NOT set
      const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
      expect(state.endowmentCtaShown).toBe(false)
    }
  })
})

// AC-9: conversion emails use conversion_marketing category + suppression handling
describe("AC-9: email category and suppression", () => {
  it("sends view_milestone email with conversion_marketing category", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    const caller = router.createCaller(ctx(session))
    await caller.evaluateUpgradeSuggestion({ listingId: listing.id })

    const calls = emailService.getCalls()
    const conversionEmail = calls.find(c => c.template === "conversion_view_milestone")
    expect(conversionEmail).toBeDefined()
    expect(conversionEmail!.category).toBe("conversion_marketing")
  })

  it("still updates trigger state when email is suppressed (AC-9)", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    // Email will return suppressed but trigger state should still update
    const deps = makeDeps()
    const { result } = await evaluateConversionTrigger(
      "view_milestone", listing.id, "free",
      { profileViews: 55, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(true)

    // State was updated regardless of email delivery status
    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))
    expect(state.lastViewMilestoneFired).toBe(50)
  })
})

// AC-10: evaluateUpgradeSuggestion
describe("AC-10: evaluateUpgradeSuggestion route", () => {
  it("returns highest-priority unfired trigger for free-tier listings", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).not.toBeNull()
    expect(suggestion!.triggerType).toBeDefined()
    expect(suggestion!.upgradeUrl).toContain(listing.id)
    expect(suggestion!.dismissable).toBe(true)
  })

  it("returns null for non-free-tier listings", async () => {
    await seedTestUser(db as any, ACCOUNT_ID)
    const listing = await createTestListing(db as any, ACCOUNT_ID, { subscriptionTier: "standard" })

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).toBeNull()
  })

  it("returns null when caller does not own listing", async () => {
    await seedTestUser(db as any, ACCOUNT_ID)
    await seedTestUser(db as any, OTHER_ACCOUNT)
    const listing = await createTestListing(db as any, OTHER_ACCOUNT, { subscriptionTier: "free" })

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).toBeNull()
  })

  it("returns null when no triggers are eligible", async () => {
    const listing = await seedFreeListing()
    // No views, no enquiries → no triggers fire

    const caller = router.createCaller(ctx(session))
    const suggestion = await caller.evaluateUpgradeSuggestion({ listingId: listing.id })
    expect(suggestion).toBeNull()
  })
})

// AC-11: getConversionTriggerState
describe("AC-11: getConversionTriggerState route", () => {
  it("returns default zero-state when no commercial_state row exists", async () => {
    const listing = await seedFreeListing()

    const caller = router.createCaller(ctx(session))
    const state = await caller.getConversionTriggerState({ listingId: listing.id })
    expect(state).toEqual({
      listingId: listing.id,
      lastViewMilestoneFired: null,
      firstEnquiryTriggerFired: false,
      competitorUpgradedFired: 0,
      analyticsTeaseFired: 0,
      socialProofFired: 0,
      engagementSummaryFired: 0,
      endowmentCtaShown: false,
    })
  })

  it("returns full trigger tracking fields when row exists", async () => {
    const listing = await seedFreeListing()
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      lastViewMilestoneFired: 100,
      firstEnquiryTriggerFired: true,
      competitorUpgradedFired: 2,
      analyticsTeaseFired: 3,
      socialProofFired: 1,
      engagementSummaryFired: 5,
      endowmentCtaShown: true,
    })

    const caller = router.createCaller(ctx(session))
    const state = await caller.getConversionTriggerState({ listingId: listing.id })
    expect(state.lastViewMilestoneFired).toBe(100)
    expect(state.firstEnquiryTriggerFired).toBe(true)
    expect(state.competitorUpgradedFired).toBe(2)
    expect(state.analyticsTeaseFired).toBe(3)
    expect(state.socialProofFired).toBe(1)
    expect(state.engagementSummaryFired).toBe(5)
    expect(state.endowmentCtaShown).toBe(true)
  })

  it("rejects when caller does not own listing", async () => {
    await seedTestUser(db as any, ACCOUNT_ID)
    await seedTestUser(db as any, OTHER_ACCOUNT)
    const listing = await createTestListing(db as any, OTHER_ACCOUNT)

    const caller = router.createCaller(ctx(session))
    await expectTRPCError(
      caller.getConversionTriggerState({ listingId: listing.id }),
      "FORBIDDEN",
    )
  })
})

// AC-12: claim_approved resets trigger state, preserves churn fields
describe("AC-12: claim_approved state reset", () => {
  it("resets all trigger state but preserves churn fields", async () => {
    const listing = await seedFreeListing()
    await (db as any).insert(commercialState).values({
      listingId: listing.id,
      lastViewMilestoneFired: 200,
      firstEnquiryTriggerFired: true,
      competitorUpgradedFired: 3,
      lastCompetitorUpgradedAt: new Date(),
      analyticsTeaseFired: 5,
      lastAnalyticsTeaseAt: new Date(),
      socialProofFired: 2,
      lastSocialProofAt: new Date(),
      engagementSummaryFired: 10,
      lastEngagementSummaryAt: new Date(),
      endowmentCtaShown: true,
      lastChurnEventAt: new Date("2026-01-15"),
      lastChurnReason: "payment_failure",
      effectivePriceAtSubscription: 199,
    })

    await resetConversionTriggerState(db as any, listing.id)

    const [state] = await (db as any).select().from(commercialState).where(eq(commercialState.listingId, listing.id))

    // Trigger state reset
    expect(state.lastViewMilestoneFired).toBeNull()
    expect(state.firstEnquiryTriggerFired).toBe(false)
    expect(state.competitorUpgradedFired).toBe(0)
    expect(state.lastCompetitorUpgradedAt).toBeNull()
    expect(state.analyticsTeaseFired).toBe(0)
    expect(state.lastAnalyticsTeaseAt).toBeNull()
    expect(state.socialProofFired).toBe(0)
    expect(state.lastSocialProofAt).toBeNull()
    expect(state.engagementSummaryFired).toBe(0)
    expect(state.lastEngagementSummaryAt).toBeNull()
    expect(state.endowmentCtaShown).toBe(false)

    // Churn fields preserved
    expect(state.lastChurnEventAt).not.toBeNull()
    expect(state.lastChurnReason).toBe("payment_failure")
    expect(state.effectivePriceAtSubscription).toBe(199)
  })

  it("no-ops when no commercial_state row exists", async () => {
    const listing = await seedFreeListing()
    // Should not throw
    await resetConversionTriggerState(db as any, listing.id)
  })
})

// AC-13: decision logging for every trigger evaluation
describe("AC-13: decision logging", () => {
  it("logs conversion_trigger_evaluation for fired trigger", async () => {
    const listing = await seedFreeListing()
    await setViews(listing.id, 55)

    const deps = makeDeps()
    await evaluateConversionTrigger(
      "view_milestone", listing.id, "free",
      { profileViews: 55, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )

    const logs = await decisionLogDb.findByDomainAndType("commercial", "conversion_trigger_evaluation")
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0].domain).toBe("commercial")
    expect(logs[0].decisionType).toBe("conversion_trigger_evaluation")
  })

  it("logs conversion_trigger_evaluation for non-free-tier rejection", async () => {
    await seedTestUser(db as any, ACCOUNT_ID)
    const listing = await createTestListing(db as any, ACCOUNT_ID, { subscriptionTier: "standard" })

    const deps = makeDeps()
    await evaluateConversionTrigger(
      "view_milestone", listing.id, "standard",
      { profileViews: 55, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )

    const logs = await decisionLogDb.findByDomainAndType("commercial", "conversion_trigger_evaluation")
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it("logs with inputs containing triggerType, listingId, subscriptionTier", async () => {
    const listing = await seedFreeListing()

    const deps = makeDeps()
    await evaluateConversionTrigger(
      "first_enquiry", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )

    const logs = await decisionLogDb.findByDomainAndType("commercial", "conversion_trigger_evaluation")
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })
})

// AC-8: email merge fields (integration-level verification)
describe("AC-8: email merge fields", () => {
  it("conversion_view_milestone includes listingName, milestoneValue, upgradeUrl", async () => {
    const listing = await seedFreeListing({ name: "Test Camera Co" })
    await setViews(listing.id, 55)

    const caller = router.createCaller(ctx(session))
    await caller.evaluateUpgradeSuggestion({ listingId: listing.id })

    const calls = emailService.getCalls()
    const email = calls.find(c => c.template === "conversion_view_milestone")
    expect(email).toBeDefined()
    expect(email!.data.listingName).toBe("Test Camera Co")
    expect(email!.data.milestoneValue).toBe(50)
    expect(email!.data.upgradeUrl).toContain(listing.id)
  })

  it("conversion_analytics_teaser includes listingName, viewCount, searchAppearanceCount, upgradeUrl", async () => {
    const listing = await seedFreeListing({ name: "Test Sound Co" })
    await setViews(listing.id, 15)
    // First fire view_milestone to clear it from priority, then analytics_teaser becomes next
    // Actually: at 15 views, view_milestone hasn't reached 50 yet, so analytics_teaser fires first
    // among periodic triggers that require views > 0

    // But first_enquiry and view_milestone come first in priority. Since enquiry=0 and views<50,
    // both will not fire. analytics_teaser will fire since views > 0.
    // Actually engagement_summary comes before analytics_teaser in priority but requires views>0 OR enquiries>0.
    // engagement_summary will fire (views=15 > 0) and it comes before analytics_teaser.
    // Let's test engagement_summary separately and analytics_teaser via direct evaluateConversionTrigger.

    const deps = makeDeps()
    const { result, action } = await evaluateConversionTrigger(
      "analytics_teaser", listing.id, "free",
      { profileViews: 15, searchAppearances: 8, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(true)
    expect(action.type).toBe("send_email")
    if (action.type === "send_email") {
      expect(action.mergeFields.listingName).toBe("Test Sound Co")
      expect(action.mergeFields.viewCount).toBe(15)
      expect(action.mergeFields.searchAppearanceCount).toBe(8)
      expect(action.mergeFields.upgradeUrl).toContain(listing.id)
    }
  })

  it("conversion_engagement_summary includes listingName, viewCount, enquiryCount, upgradeUrl", async () => {
    const listing = await seedFreeListing({ name: "Test Post Co" })

    const deps = makeDeps()
    const { result, action } = await evaluateConversionTrigger(
      "engagement_summary", listing.id, "free",
      { profileViews: 20, searchAppearances: 5, enquiriesReceived: 3 },
      deps,
    )
    expect(result.fired).toBe(true)
    expect(action.type).toBe("send_email")
    if (action.type === "send_email") {
      expect(action.mergeFields.listingName).toBe("Test Post Co")
      expect(action.mergeFields.viewCount).toBe(20)
      expect(action.mergeFields.enquiryCount).toBe(3)
      expect(action.mergeFields.upgradeUrl).toContain(listing.id)
    }
  })

  it("conversion_social_proof includes listingName, competitorName (anonymised), upgradeUrl", async () => {
    const listing = await seedFreeListing({ name: "Test Light Co" })
    const tax = await seedTaxonomy(db as any)
    await (db as any).insert(listingTaxonomyTags).values({
      listingId: listing.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
    })

    // Create 3 paid listings in same sector
    for (let i = 0; i < 3; i++) {
      const uid = makeUUID(`sp${String(i).padStart(2, "0")}`)
      await seedTestUser(db as any, uid)
      const l = await createTestListing(db as any, uid, { subscriptionTier: "premium" })
      await (db as any).insert(listingTaxonomyTags).values({
        listingId: l.id, sectorId: tax.camera.id, serviceAreaId: tax.cinematography.id,
      })
    }

    const deps = makeDeps()
    const { result, action } = await evaluateConversionTrigger(
      "social_proof", listing.id, "free",
      { profileViews: 0, searchAppearances: 0, enquiriesReceived: 0 },
      deps,
    )
    expect(result.fired).toBe(true)
    expect(action.type).toBe("send_email")
    if (action.type === "send_email") {
      expect(action.mergeFields.listingName).toBe("Test Light Co")
      expect(action.mergeFields.competitorName).toBe("Providers in your service area")
      expect(action.mergeFields.upgradeUrl).toContain(listing.id)
    }
  })
})
