// Demo data seed — creates demo + admin users, sample listings, and populates all admin views.
// Run: npx tsx src/db/seed/demo.ts
// Requires: DATABASE_URL set, taxonomy already seeded, Better Auth schema present.

import { drizzle } from "drizzle-orm/node-postgres"
import { eq, sql } from "drizzle-orm"
import pg from "pg"
import { randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import {
  listings,
  verifications,
  qualityScores,
  engagements,
  listingTaxonomyTags,
  credits,
  taxonomySectors,
  taxonomyServiceAreas,
} from "../schema/data-and-listings"
import { user, account } from "../schema/auth"
import { accountProfiles, enquiryRecords, shortlists, shortlistItems, searchHistory } from "../schema/accounts"
import { supportTickets, complianceRegister, billingHolds, churnRiskRegistry } from "../schema/operations"
import { orchestratedFlows, eventConsumerErrors } from "../schema/shared"
import { commercialState, churnAnalysisLog } from "../schema/commercial"

// --- Constants ---

const DEMO_USER = {
  id: randomUUID(),
  name: "Demo User",
  email: "demo@callsheet.test",
  password: "password123",
}

const ADMIN_USER = {
  id: randomUUID(),
  name: "Admin User",
  email: "admin@callsheet.test",
  password: "password123",
}

type SeedListing = {
  entityType: "freelancer" | "company"
  name: string
  slug: string
  headline: string
  bio: string
  baseRegion: string
  basePostcode: string
  websiteUrl: string | null
  contactEmail: string | null
  claimStatus: "unclaimed" | "claimed"
  verificationTier: "unclaimed" | "claimed" | "verified" | "premium_verified"
  subscriptionTier: "free" | "standard" | "premium"
  qualityComposite: number
  sectorSlug: string
  serviceAreaSlug: string
  owned: boolean
  credits: { projectName: string; roleProvided: string; year: number; format: "feature" | "tv_series" | "commercial" }[]
}

const SEED_LISTINGS: SeedListing[] = [
  {
    entityType: "company",
    name: "Apex Camera Rentals",
    slug: "apex-camera-rentals",
    headline: "Premium camera and lens hire for film & TV",
    bio: "Apex Camera Rentals provides ARRI, RED, and Sony cinema camera packages to productions across the UK. We offer 24-hour turnaround, on-set technical support, and custom rigging solutions. Established 2012.",
    baseRegion: "London",
    basePostcode: "W1D 3AF",
    websiteUrl: "https://example.com/apex",
    contactEmail: "hire@apex.example.com",
    claimStatus: "claimed",
    verificationTier: "verified",
    subscriptionTier: "premium",
    qualityComposite: 82,
    sectorSlug: "equipment-and-technology",
    serviceAreaSlug: "camera-systems",
    owned: true,
    credits: [
      { projectName: "The Crown S6", roleProvided: "Camera Package", year: 2024, format: "tv_series" },
      { projectName: "Wicked", roleProvided: "B-Camera & Lenses", year: 2024, format: "feature" },
    ],
  },
  {
    entityType: "freelancer",
    name: "Sarah Chen — DOP",
    slug: "sarah-chen-dop",
    headline: "Director of Photography — drama, documentary, commercials",
    bio: "BAFTA-nominated cinematographer with 15 years of experience across scripted drama, observational documentary, and brand campaigns. Based in Bristol, available UK-wide. Comfortable shooting on ARRI Alexa, RED, and Sony Venice.",
    baseRegion: "South West",
    basePostcode: "BS1 6QF",
    websiteUrl: "https://example.com/sarahchen",
    contactEmail: "sarah@example.com",
    claimStatus: "claimed",
    verificationTier: "claimed",
    subscriptionTier: "standard",
    qualityComposite: 71,
    sectorSlug: "crew-and-talent",
    serviceAreaSlug: "camera",
    owned: false,
    credits: [
      { projectName: "Sherwood S2", roleProvided: "Director of Photography", year: 2024, format: "tv_series" },
      { projectName: "Sky Garden", roleProvided: "Cinematographer", year: 2023, format: "commercial" },
    ],
  },
  {
    entityType: "company",
    name: "Northlight Post",
    slug: "northlight-post",
    headline: "Full-service post-production for film, TV, and streaming",
    bio: "Northlight Post delivers colour grading, online editing, VFX, and deliverables for UK and international productions. Baselight and DaVinci Resolve suites. Recent credits include work for BBC, Netflix, and Channel 4.",
    baseRegion: "Manchester",
    basePostcode: "M1 5JW",
    websiteUrl: null,
    contactEmail: null,
    claimStatus: "unclaimed",
    verificationTier: "unclaimed",
    subscriptionTier: "free",
    qualityComposite: 45,
    sectorSlug: "post-production",
    serviceAreaSlug: "colour-and-grading",
    owned: false,
    credits: [],
  },
  {
    entityType: "company",
    name: "Green Spark Studios",
    slug: "green-spark-studios",
    headline: "Sustainable film studio with 3 sound stages in East London",
    bio: "Green Spark Studios offers 3 sound stages (4000–8000 sq ft), production offices, wardrobe/props storage, and a backlot. Carbon-neutral operations since 2021. Conveniently located near Stratford with excellent transport links.",
    baseRegion: "London",
    basePostcode: "E15 2GW",
    websiteUrl: "https://example.com/greenspark",
    contactEmail: "studio@greenspark.example.com",
    claimStatus: "claimed",
    verificationTier: "premium_verified",
    subscriptionTier: "premium",
    qualityComposite: 91,
    sectorSlug: "facilities-and-locations",
    serviceAreaSlug: "studios",
    owned: false,
    credits: [
      { projectName: "Luther: The Fallen Sun", roleProvided: "Studio Facility", year: 2023, format: "feature" },
    ],
  },
  {
    entityType: "freelancer",
    name: "Mark Thompson — Sound Mixer",
    slug: "mark-thompson-sound",
    headline: "Location sound recordist and mixer — drama & documentary",
    bio: "Experienced location sound mixer with own Cantar X3 kit. Specialising in single-camera drama and observational documentary. Available at short notice for UK and European shoots.",
    baseRegion: "Yorkshire",
    basePostcode: "LS1 4AP",
    websiteUrl: "https://example.com/markthompson",
    contactEmail: "mark@example.com",
    claimStatus: "claimed",
    verificationTier: "verified",
    subscriptionTier: "standard",
    qualityComposite: 67,
    sectorSlug: "crew-and-talent",
    serviceAreaSlug: "sound",
    owned: false,
    credits: [
      { projectName: "Happy Valley S3", roleProvided: "Sound Recordist", year: 2023, format: "tv_series" },
      { projectName: "All Of Us Strangers", roleProvided: "Sound Mixer", year: 2023, format: "feature" },
      { projectName: "Barclays", roleProvided: "Sound Recordist", year: 2024, format: "commercial" },
    ],
  },
  {
    entityType: "company",
    name: "Brightside Casting",
    slug: "brightside-casting",
    headline: "Casting directors for TV, film, and commercial",
    bio: "Brightside Casting connects productions with on-screen and background talent. We maintain a database of 12,000+ performers and handle all casting workflows from brief to booking. BAFTA members.",
    baseRegion: "London",
    basePostcode: "W1F 8ZB",
    websiteUrl: "https://example.com/brightside",
    contactEmail: "info@brightside.example.com",
    claimStatus: "claimed",
    verificationTier: "verified",
    subscriptionTier: "premium",
    qualityComposite: 78,
    sectorSlug: "business-services",
    serviceAreaSlug: "talent-services",
    owned: false,
    credits: [
      { projectName: "Slow Horses S3", roleProvided: "Casting Director", year: 2024, format: "tv_series" },
    ],
  },
]

// --- Helpers ---

async function ensureUser(
  db: ReturnType<typeof drizzle>,
  userDef: typeof DEMO_USER,
  role: string,
): Promise<string> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, userDef.email))
  if (existing.length > 0) {
    console.log(`User ${userDef.email} already exists (${existing[0].id}), skipping creation`)
    return existing[0].id
  }

  const userId = userDef.id
  await db.insert(user).values({
    id: userId,
    name: userDef.name,
    email: userDef.email,
    emailVerified: true,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const hash = await hashPassword(userDef.password)
  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hash,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await db.insert(accountProfiles).values({
    accountId: userId,
    fullName: userDef.name,
  }).onConflictDoNothing()

  console.log(`Created user: ${userDef.email} / ${userDef.password} (role: ${role})`)
  return userId
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

// --- Main ---

async function main() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const db = drizzle({ client: pool })

  // 1. Create users (AC-01)
  const demoUserId = await ensureUser(db, DEMO_USER, "user")
  const adminUserId = await ensureUser(db, ADMIN_USER, "admin")

  // 2. Resolve taxonomy IDs
  const sectorRows = await db.select().from(taxonomySectors)
  if (sectorRows.length === 0) {
    await pool.end()
    throw new Error("taxonomy_sectors is empty — run `npm run db:seed` before `npm run db:seed-demo`")
  }
  const serviceAreaRows = await db.select().from(taxonomyServiceAreas)

  function findSector(slug: string) {
    return sectorRows.find((s) => s.slug === slug)
  }
  function findServiceArea(sectorId: number, slug: string) {
    return serviceAreaRows.find((sa) => sa.sectorId === sectorId && sa.slug === slug)
  }

  // 3. Insert listings — track IDs for FK references
  const listingIds: Map<string, string> = new Map() // slug → id

  for (const seed of SEED_LISTINGS) {
    const existingListing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, seed.slug))
    if (existingListing.length > 0) {
      listingIds.set(seed.slug, existingListing[0].id)
      console.log(`Listing "${seed.name}" already exists, skipping`)
      continue
    }

    const listingId = randomUUID()
    listingIds.set(seed.slug, listingId)
    const ownerId = seed.owned ? demoUserId : null

    await db.insert(listings).values({
      id: listingId,
      accountId: ownerId,
      entityType: seed.entityType,
      claimStatus: seed.claimStatus,
      slug: seed.slug,
      name: seed.name,
      headline: seed.headline,
      bio: seed.bio,
      baseRegion: seed.baseRegion,
      basePostcode: seed.basePostcode,
      websiteUrl: seed.websiteUrl,
      contactEmail: seed.contactEmail,
      subscriptionTier: seed.subscriptionTier,
      lifecycleStatus: "active",
      availabilityStatus: "available",
      travelWillingness: "uk_wide",
    })

    await db.insert(verifications).values({
      listingId,
      tier: seed.verificationTier,
      claimedAt: seed.verificationTier !== "unclaimed" ? new Date() : null,
      verifiedAt: seed.verificationTier === "verified" || seed.verificationTier === "premium_verified" ? new Date() : null,
      verificationScore: seed.qualityComposite > 70 ? 80 : 30,
    })

    const c = seed.qualityComposite
    await db.insert(qualityScores).values({
      listingId,
      completeness: Math.min(100, c + 10),
      freshness: Math.max(0, c - 5),
      accuracy: Math.min(100, c + 5),
      richness: Math.max(0, c - 10),
      verification: seed.verificationTier === "premium_verified" ? 100 : seed.verificationTier === "verified" ? 70 : 30,
      composite: c,
    })

    await db.insert(engagements).values({
      listingId,
      profileViews: Math.floor(Math.random() * 200) + 20,
      searchAppearances: Math.floor(Math.random() * 500) + 50,
      enquiriesReceived: Math.floor(Math.random() * 15),
    })

    const sector = findSector(seed.sectorSlug)
    if (sector) {
      const sa = findServiceArea(sector.id, seed.serviceAreaSlug)
      if (sa) {
        await db.insert(listingTaxonomyTags).values({
          listingId,
          sectorId: sector.id,
          serviceAreaId: sa.id,
          specialisationId: null,
        })
      } else {
        console.log(`  Warning: service area "${seed.serviceAreaSlug}" not found in sector "${seed.sectorSlug}"`)
      }
    } else {
      console.log(`  Warning: sector "${seed.sectorSlug}" not found — check taxonomy seed`)
    }

    for (const credit of seed.credits) {
      await db.insert(credits).values({
        listingId,
        projectName: credit.projectName,
        roleProvided: credit.roleProvided,
        year: credit.year,
        format: credit.format,
      })
    }

    console.log(`Seeded: ${seed.name} (${seed.verificationTier}, quality ${seed.qualityComposite})`)
  }

  // Resolve listing IDs for FK references
  const apexId = listingIds.get("apex-camera-rentals")!
  const sarahId = listingIds.get("sarah-chen-dop")!
  const northlightId = listingIds.get("northlight-post")!
  const greenSparkId = listingIds.get("green-spark-studios")!
  const markId = listingIds.get("mark-thompson-sound")!
  const brightsideId = listingIds.get("brightside-casting")!

  // --- AC-02: Support tickets (2 open/assigned, 1 resolved) ---
  const existingTickets = await db.select({ id: supportTickets.id }).from(supportTickets).limit(1)
  if (existingTickets.length === 0) {
    await db.insert(supportTickets).values([
      {
        accountId: demoUserId,
        listingId: apexId,
        category: "billing_support",
        priority: "high",
        status: "open",
        subject: "Invoice discrepancy on Premium renewal",
        details: { description: "Annual renewal charged £699 but expected £399 (was on Standard tier)." },
        slaDeadline: daysFromNow(2),
      },
      {
        accountId: adminUserId,
        listingId: greenSparkId,
        category: "profile_support",
        priority: "normal",
        status: "assigned",
        subject: "Request to merge duplicate listing",
        details: { description: "Green Spark Studios has two listings — one seeded, one claimed. Need merge." },
        slaDeadline: daysFromNow(5),
      },
      {
        accountId: demoUserId,
        listingId: apexId,
        category: "feature_gating_confusion",
        priority: "low",
        status: "resolved",
        subject: "Cannot access analytics — tier confusion",
        details: { description: "User was on free tier, thought analytics were included." },
        resolvedAt: daysAgo(3),
      },
    ])
    console.log("Seeded: 3 support tickets (open, assigned, resolved)")
  } else {
    console.log("Support tickets already exist, skipping")
  }

  // --- AC-03: Compliance entry (open DSAR) + billing hold ---
  const existingCompliance = await db.select({ id: complianceRegister.id }).from(complianceRegister).limit(1)
  if (existingCompliance.length === 0) {
    await db.insert(complianceRegister).values({
      type: "dsar",
      accountId: demoUserId,
      status: "open",
      receivedAt: daysAgo(5),
      deadline: daysFromNow(25),
      details: { requestType: "access", channel: "email", reference: "DSAR-2026-001" },
    })
    console.log("Seeded: 1 compliance register entry (open DSAR)")
  } else {
    console.log("Compliance entries already exist, skipping")
  }

  const existingHolds = await db.select({ id: billingHolds.id }).from(billingHolds).limit(1)
  if (existingHolds.length === 0) {
    await db.insert(billingHolds).values({
      listingId: markId,
      reason: "Paddle subscription active but local tier shows free — reconciliation anomaly",
      expiresAt: daysFromNow(1),
    })
    console.log("Seeded: 1 billing hold")
  } else {
    console.log("Billing holds already exist, skipping")
  }

  // --- AC-04: In-progress erasure flow (3+ steps, 1 completed, 1 in_progress) ---
  const existingFlows = await db.select({ id: orchestratedFlows.id }).from(orchestratedFlows).limit(1)
  if (existingFlows.length === 0) {
    const now = new Date()
    await db.insert(orchestratedFlows).values({
      flowType: "erasure",
      triggeredBy: adminUserId,
      status: "in_progress",
      currentStep: 1,
      steps: [
        { name: "verify_identity", domain: "operations", status: "completed", attempt: 1, retryable: true, skippable: false, completedAt: daysAgo(1).toISOString() },
        { name: "extract_account_data", domain: "platform", status: "in_progress", attempt: 1, retryable: true, skippable: true },
        { name: "close_support_tickets", domain: "operations", status: "pending", attempt: 0, retryable: true, skippable: true },
        { name: "process_erasure", domain: "data-and-listings", status: "pending", attempt: 0, retryable: true, skippable: false },
        { name: "close_dsar_case", domain: "operations", status: "pending", attempt: 0, retryable: true, skippable: false },
        { name: "emit_erasure_completed", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: true },
      ],
      context: { accountId: demoUserId, dsarRef: "DSAR-2026-001", reason: "Subject access request" },
      startedAt: daysAgo(1),
      deadline: daysFromNow(28),
      updatedAt: now,
    })
    console.log("Seeded: 1 in-progress erasure flow (6 steps)")
  } else {
    console.log("Orchestrated flows already exist, skipping")
  }

  // --- AC-05: Event consumer errors (1 resolved, 2 unresolved) ---
  const existingErrors = await db.select({ id: eventConsumerErrors.id }).from(eventConsumerErrors).limit(1)
  if (existingErrors.length === 0) {
    await db.insert(eventConsumerErrors).values([
      {
        eventType: "subscription_tier_changed",
        consumerDomain: "commercial",
        consumerId: "cr.updateCommercialState",
        payload: { _brand: "SubscriptionTierChangedEvent", listingId: markId, previousTier: "free", newTier: "standard" },
        error: "UNIQUE constraint failed: commercial_state.listing_id — row already exists",
        stack: "Error: UNIQUE constraint failed\n    at processSubscriptionTierChanged (commercial/consumers/subscription-tier-changed.ts:24:5)",
        mode: "async",
        resolved: true,
        resolvedAt: daysAgo(2),
      },
      {
        eventType: "claim_approved",
        consumerDomain: "commercial",
        consumerId: "cr.resetConversionState",
        payload: { _brand: "ClaimApprovedEvent", listingId: northlightId, accountId: adminUserId },
        error: "Cannot read properties of null (reading 'subscriptionTier')",
        stack: "TypeError: Cannot read properties of null\n    at handleClaimApproved (commercial/consumers/claim-approved.ts:12:30)",
        mode: "async",
        resolved: false,
      },
      {
        eventType: "enquiry_submitted",
        consumerDomain: "commercial",
        consumerId: "cr.evaluateFirstEnquiry",
        payload: { _brand: "EnquirySubmittedEvent", listingId: apexId, senderAccountId: adminUserId },
        error: "Connection terminated unexpectedly",
        stack: "Error: Connection terminated unexpectedly\n    at Connection.handleEnd (pg/connection.js:128:12)",
        mode: "async",
        resolved: false,
      },
    ])
    console.log("Seeded: 3 event consumer errors (1 resolved, 2 unresolved)")
  } else {
    console.log("Event consumer errors already exist, skipping")
  }

  // --- AC-06: Enquiry records (2 received by demo listing, 2 sent by demo user) ---
  const existingEnquiries = await db.select({ id: enquiryRecords.id }).from(enquiryRecords).limit(1)
  if (existingEnquiries.length === 0) {
    await db.insert(enquiryRecords).values([
      // Received by demo user's listing (Apex)
      {
        senderAccountId: adminUserId,
        senderEmail: ADMIN_USER.email,
        listingId: apexId,
        subject: "ARRI Alexa Mini LF availability",
        body: "Hi, do you have an ARRI Alexa Mini LF package available for a 3-week shoot in April? We'd need B-cam and a set of Cooke S7 primes as well. Budget is flexible for the right kit.",
        status: "responded",
        sentAt: daysAgo(7),
        respondedAt: daysAgo(5),
        responseTimeMinutes: 2880,
      },
      {
        senderEmail: "producer@independent-film.example.com",
        listingId: apexId,
        subject: "Camera package for short film",
        body: "We're a small indie production looking for a RED Komodo package for a weekend shoot. Could you send a quote including insurance? Our budget is around £800 for the weekend.",
        status: "unread",
        sentAt: daysAgo(1),
      },
      // Sent by demo user to other listings
      {
        senderAccountId: demoUserId,
        senderEmail: DEMO_USER.email,
        listingId: greenSparkId,
        subject: "Studio availability for product shoot",
        body: "Looking for Stage 2 for a 2-day product shoot next month. We need blackout capability and a green screen. Can you confirm availability and day rate?",
        status: "responded",
        sentAt: daysAgo(10),
        respondedAt: daysAgo(8),
        responseTimeMinutes: 2880,
      },
      {
        senderAccountId: demoUserId,
        senderEmail: DEMO_USER.email,
        listingId: brightsideId,
        subject: "Casting support for commercial",
        body: "We need 3 principal cast and 20 background artists for a Barclays commercial shooting in London. 2-day shoot, mid-March. Are you available to handle casting?",
        status: "unread",
        sentAt: daysAgo(2),
      },
    ])
    console.log("Seeded: 4 enquiry records (2 received, 2 sent)")
  } else {
    console.log("Enquiry records already exist, skipping")
  }

  // --- AC-07: Shortlist with 3 items ---
  const existingShortlists = await db.select({ id: shortlists.id }).from(shortlists).where(eq(shortlists.accountId, demoUserId))
  if (existingShortlists.length === 0) {
    const shortlistId = randomUUID()
    await db.insert(shortlists).values({
      id: shortlistId,
      accountId: demoUserId,
      name: "Camera & Studio options",
    })
    await db.insert(shortlistItems).values([
      { shortlistId, listingId: sarahId, status: "active" },
      { shortlistId, listingId: greenSparkId, status: "active" },
      { shortlistId, listingId: brightsideId, status: "active" },
    ])
    console.log("Seeded: 1 shortlist with 3 items")
  } else {
    console.log("Shortlists already exist for demo user, skipping")
  }

  // --- AC-08: Search history (3 recent searches) ---
  const existingSearches = await db.select({ id: searchHistory.id }).from(searchHistory).where(eq(searchHistory.accountId, demoUserId))
  if (existingSearches.length === 0) {
    await db.insert(searchHistory).values([
      {
        accountId: demoUserId,
        query: "camera rental london",
        filters: { region: "London" },
        resultCount: 12,
        createdAt: daysAgo(3),
      },
      {
        accountId: demoUserId,
        query: "post production colour grading",
        filters: {},
        resultCount: 8,
        createdAt: daysAgo(2),
      },
      {
        accountId: demoUserId,
        query: "sound recordist yorkshire",
        filters: { region: "Yorkshire" },
        resultCount: 3,
        createdAt: daysAgo(1),
      },
    ])
    console.log("Seeded: 3 search history entries")
  } else {
    console.log("Search history already exists for demo user, skipping")
  }

  // --- AC-09: Churn risk registry entry (non-demo listing) ---
  const existingChurnRisk = await db.select({ id: churnRiskRegistry.id }).from(churnRiskRegistry).limit(1)
  if (existingChurnRisk.length === 0) {
    // Mark Thompson has a standard subscription — realistic churn risk candidate
    // churnRiskRegistry requires accountId (text) — use a non-demo user placeholder
    // Since Mark's listing isn't owned by anyone, create a minimal reference
    const markOwnerPlaceholder = adminUserId
    await db.insert(churnRiskRegistry).values({
      listingId: markId,
      accountId: markOwnerPlaceholder,
      riskLevel: "at_risk",
      detectedAt: daysAgo(5),
      expiresAt: daysFromNow(85),
    })
    console.log("Seeded: 1 churn risk registry entry")
  } else {
    console.log("Churn risk entries already exist, skipping")
  }

  // --- AC-10: Commercial state + churn analysis log ---
  const existingCommercial = await db
    .select({ listingId: commercialState.listingId })
    .from(commercialState)
    .limit(1)
  if (existingCommercial.length === 0) {
    // Commercial state for Apex (premium, owned by demo user)
    await db.insert(commercialState).values({
      listingId: apexId,
      lastViewMilestoneFired: 100,
      firstEnquiryTriggerFired: true,
      analyticsTeaseFired: 2,
      lastAnalyticsTeaseAt: daysAgo(14),
      socialProofFired: 1,
      lastSocialProofAt: daysAgo(30),
      endowmentCtaShown: true,
      effectivePriceAtSubscription: 69900,
    })

    // Commercial state for Mark (standard, churn candidate)
    await db.insert(commercialState).values({
      listingId: markId,
      lastViewMilestoneFired: 50,
      firstEnquiryTriggerFired: true,
      lastChurnEventAt: daysAgo(5),
      lastChurnReason: "payment_failure",
      effectivePriceAtSubscription: 39900,
    })

    // Churn analysis log entries — conversion + churn events
    await db.insert(churnAnalysisLog).values([
      {
        listingId: apexId,
        accountId: sql`${demoUserId}::uuid`,
        eventType: "conversion",
        reason: "free_to_premium",
        subscriptionTier: "premium",
        annualRevenue: 69900,
        createdAt: daysAgo(60),
      },
      {
        listingId: markId,
        accountId: sql`${adminUserId}::uuid`,
        eventType: "churn",
        reason: "payment_failure",
        subscriptionTier: "standard",
        annualRevenue: 39900,
        createdAt: daysAgo(5),
      },
      {
        listingId: greenSparkId,
        eventType: "conversion",
        reason: "free_to_premium",
        subscriptionTier: "premium",
        annualRevenue: 69900,
        createdAt: daysAgo(45),
      },
    ])
    console.log("Seeded: 2 commercial states + 3 churn analysis log entries")
  } else {
    console.log("Commercial state already exists, skipping")
  }

  await pool.end()
  console.log("\nDemo seed complete.")
  console.log("  Demo user: demo@callsheet.test / password123")
  console.log("  Admin user: admin@callsheet.test / password123 (role: admin)")
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("seed/demo.ts")
  || process.argv[1]?.replace(/\\/g, "/").endsWith("seed/demo.js")
if (isMain) {
  main().catch((err) => {
    console.error("Demo seed failed:", err)
    process.exit(1)
  })
}
