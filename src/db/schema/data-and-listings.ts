// Data & Listings schema — S1 §1, D&L interface spec §1-§4
// Owns: Listing, Verification, QualityScore, Engagement, Taxonomy, Credits,
//        Media, Social, Accreditations, PendingEnquiries, PreClaimSnapshots,
//        AdditionalLocations, ZeroResultQueries, ControlledVocabulary, SearchSynonyms

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  serial,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { tsvector } from "../types"

// --- Enums (§1.1) ---

export const entityTypeEnum = pgEnum("entity_type", [
  "freelancer", "company", "education", "industry_body", "public_sector", "non_profit",
])

export const claimStatusEnum = pgEnum("claim_status", [
  "unclaimed", "pending_review", "claimed", "disputed",
])

export const verificationTierEnum = pgEnum("verification_tier", [
  "unclaimed", "claimed", "verified", "premium_verified",
])

export const lifecycleStatusEnum = pgEnum("lifecycle_status", [
  "active", "inactive", "merged", "dissolved", "suspended", "archived",
])

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free", "standard", "premium", "partner",
])

export const availabilityStatusEnum = pgEnum("availability_status", [
  "available", "available_from", "unavailable",
])

export const travelWillingnessEnum = pgEnum("travel_willingness", [
  "local_only", "regional", "uk_wide", "international",
])

export const budgetTierEnum = pgEnum("budget_tier", ["low", "mid", "high"])

export const leadTimeEnum = pgEnum("lead_time", [
  "same_day", "1_week", "2_4_weeks", "6_plus_weeks",
])

export const creditFormatEnum = pgEnum("credit_format", [
  "feature", "tv_series", "tv_one_off", "short", "commercial",
  "corporate", "music_video", "digital_social", "live_event",
])

export const creditSourcingEnum = pgEnum("credit_sourcing", [
  "self_reported", "imdb_linked", "client_confirmed",
])

export const verificationMethodEnum = pgEnum("verification_method", [
  "email_domain_match", "companies_house_active", "companies_house_deep",
  "website_bidirectional", "vat_registration", "trade_body_membership",
  "client_confirmed_credit", "portfolio_review", "imdb_verified",
  "insurance_verified", "award_verified", "linkedin_verified",
])

export const shortlistItemStatusEnum = pgEnum("shortlist_item_status", [
  "active", "archived", "suspended", "removed",
])

export const mediaTypeEnum = pgEnum("media_type", [
  "logo", "headshot", "portfolio", "gallery", "showreel_url",
])

export const vocabularyCategoryEnum = pgEnum("vocabulary_category", [
  "equipment", "software", "genre", "region", "transaction_type",
])

export const mediaVisibilityEnum = pgEnum("media_visibility", ["visible", "hidden"])

// --- Listings (§1.2) ---

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // text FK — Better Auth user.id is text, not uuid
    accountId: text("account_id").references(() => user.id, { onDelete: "set null" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    claimStatus: claimStatusEnum("claim_status").notNull().default("unclaimed"),
    slug: text("slug").notNull().unique(),

    // Identity
    name: text("name").notNull(),
    companiesHouseNumber: text("companies_house_number"),
    vatNumber: text("vat_number"),
    foundedYear: integer("founded_year"),
    formerlyKnownAs: text("formerly_known_as").array().default(sql`'{}'::text[]`),

    // Profile
    headline: text("headline"),
    bio: text("bio"),
    logoUrl: text("logo_url"),
    headshotUrl: text("headshot_url"),
    websiteUrl: text("website_url"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),

    // Location
    basePostcode: text("base_postcode"),
    baseRegion: text("base_region"),
    baseLat: real("base_lat"),
    baseLng: real("base_lng"),
    serviceRegions: text("service_regions").array().default(sql`'{}'::text[]`),
    travelWillingness: travelWillingnessEnum("travel_willingness"),

    // Availability
    availabilityStatus: availabilityStatusEnum("availability_status"),
    availableFrom: timestamp("available_from", { withTimezone: true }),
    seasonalPatterns: text("seasonal_patterns"),
    leadTime: leadTimeEnum("lead_time"),

    // Commercial
    budgetTier: budgetTierEnum("budget_tier"),
    dayRate: integer("day_rate"),
    currency: text("currency").default("GBP"),
    subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("free"),
    paddleSubscriptionId: text("paddle_subscription_id"),
    paddleCustomerId: text("paddle_customer_id"),
    billingCadence: text("billing_cadence"), // "annual" | "monthly" | null (free)
    subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
    subscriptionEndDate: timestamp("subscription_end_date", { withTimezone: true }),

    // Optimistic concurrency [S5 §8.2]
    version: integer("version").notNull().default(1),

    // Lifecycle
    lifecycleStatus: lifecycleStatusEnum("lifecycle_status").notNull().default("active"),
    lastProviderLogin: timestamp("last_provider_login", { withTimezone: true }),
    mergedInto: uuid("merged_into"),
    succeededBy: uuid("succeeded_by"),

    // Claim tracking — S9 §1.5 abandonment check
    claimSubmittedAt: timestamp("claim_submitted_at", { withTimezone: true }),

    // Provenance
    source: text("source"), // null for user-created, "4rfv_import" for seed data [S2 §6.8]

    // GDPR Article 14 — on-page notice for seed listings without contact email [S2 §11]
    article14NoticeDisplayed: boolean("article_14_notice_displayed").notNull().default(false),

    // Search
    searchVector: tsvector("search_vector"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("listings_account_id_idx")
      .on(table.accountId)
      .where(sql`${table.accountId} IS NOT NULL`),
    index("listings_ch_number_idx")
      .on(table.companiesHouseNumber)
      .where(sql`${table.companiesHouseNumber} IS NOT NULL`),
    index("listings_lifecycle_active_idx")
      .on(table.lifecycleStatus)
      .where(sql`${table.lifecycleStatus} = 'active'`),
    index("listings_entity_lifecycle_idx")
      .on(table.entityType, table.lifecycleStatus),
  ],
)

// --- Verification (§1.3) ---

export const verifications = pgTable("verifications", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  tier: verificationTierEnum("tier").notNull().default("unclaimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationMethods: verificationMethodEnum("verification_methods").array().default(sql`'{}'::verification_method[]`),
  lastVerificationCheck: timestamp("last_verification_check", { withTimezone: true }),
  verificationScore: integer("verification_score").notNull().default(0),
})

// --- Quality Scores (§1.4) ---

export const qualityScores = pgTable("quality_scores", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  completeness: integer("completeness").notNull().default(0),
  freshness: integer("freshness").notNull().default(0),
  accuracy: integer("accuracy").notNull().default(0),
  richness: integer("richness").notNull().default(0),
  verification: integer("verification").notNull().default(0),
  composite: integer("composite").notNull().default(0),
  lastCalculated: timestamp("last_calculated", { withTimezone: true }).notNull().defaultNow(),
  // S9 additions — calibrated quality scoring coexistence
  calculatedBy: text("calculated_by").notNull().default("zero_init"),
  // "zero_init" (S1 placeholder) | "calibrated" (S9 computed)
  algorithmVersion: integer("algorithm_version").notNull().default(1),
})

// --- Quality Score Explanations (§1.5) ---

export type QualityScoreExplanationFactor = {
  factor: string
  impact: "positive" | "negative" | "neutral"
  detail: string
}

export type QualityScoreExplanationDimension = {
  name: string
  score: number
  maxScore: number
  factors: QualityScoreExplanationFactor[]
}

export type QualityScoreExplanation = {
  composite: number
  dimensions: QualityScoreExplanationDimension[]
  topImprovements: string[]
}

export const ZERO_INIT_EXPLANATION: QualityScoreExplanation = {
  composite: 0,
  dimensions: [],
  topImprovements: [],
}

export const qualityScoreExplanations = pgTable("quality_score_explanations", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  explanation: jsonb("explanation").notNull().$type<QualityScoreExplanation>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- Engagement Counters (§1.6) ---

export const engagements = pgTable("engagements", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  profileViews: integer("profile_views").notNull().default(0),
  searchAppearances: integer("search_appearances").notNull().default(0),
  enquiriesReceived: integer("enquiries_received").notNull().default(0),
  enquiryResponseRate: real("enquiry_response_rate"),
  enquiryResponseTime: real("enquiry_response_time"),
  // S9 additions — quality scoring freshness + dedup
  lastViewerAccountId: text("last_viewer_account_id"), // AC-11 dedup: last viewer for 1-hour window
  lastProfileViewAt: timestamp("last_profile_view_at", { withTimezone: true }), // AC-11 dedup + AC-4 freshness
  lastEnquiryAt: timestamp("last_enquiry_at", { withTimezone: true }), // AC-4 freshness engagement recency
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- Taxonomy (§1.7) ---

export const taxonomySectors = pgTable("taxonomy_sectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const taxonomyServiceAreas = pgTable(
  "taxonomy_service_areas",
  {
    id: serial("id").primaryKey(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => taxonomySectors.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("taxonomy_service_areas_sector_slug_idx")
      .on(table.sectorId, table.slug),
  ],
)

export const taxonomySpecialisations = pgTable(
  "taxonomy_specialisations",
  {
    id: serial("id").primaryKey(),
    serviceAreaId: integer("service_area_id")
      .notNull()
      .references(() => taxonomyServiceAreas.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("taxonomy_specialisations_sa_slug_idx")
      .on(table.serviceAreaId, table.slug),
  ],
)

export const listingTaxonomyTags = pgTable(
  "listing_taxonomy_tags",
  {
    id: serial("id").primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => taxonomySectors.id),
    serviceAreaId: integer("service_area_id")
      .notNull()
      .references(() => taxonomyServiceAreas.id),
    specialisationId: integer("specialisation_id")
      .references(() => taxonomySpecialisations.id),
  },
  (table) => [
    index("listing_taxonomy_tags_listing_idx").on(table.listingId),
    index("listing_taxonomy_tags_sector_sa_idx")
      .on(table.sectorId, table.serviceAreaId),
    // Unique tag per listing when specialisation is set
    uniqueIndex("listing_taxonomy_tags_full_idx")
      .on(table.listingId, table.sectorId, table.serviceAreaId, table.specialisationId)
      .where(sql`${table.specialisationId} IS NOT NULL`),
    // Unique tag per listing at service-area level (no specialisation) [S1-ST-16]
    uniqueIndex("listing_taxonomy_tags_l2_idx")
      .on(table.listingId, table.sectorId, table.serviceAreaId)
      .where(sql`${table.specialisationId} IS NULL`),
  ],
)

// --- Credits (§1.8) ---

export const credits = pgTable(
  "credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    projectName: text("project_name").notNull(),
    clientCommissioner: text("client_commissioner"),
    roleProvided: text("role_provided").notNull(),
    year: integer("year").notNull(),
    format: creditFormatEnum("format").notNull(),
    genres: text("genres").array().default(sql`'{}'::text[]`),
    awards: text("awards").array().default(sql`'{}'::text[]`),
    sourcingMethod: creditSourcingEnum("sourcing_method").notNull().default("self_reported"),
    verificationDate: timestamp("verification_date", { withTimezone: true }),
    imdbUrl: text("imdb_url"),
    clientCompanyName: text("client_company_name"),
    visibility: mediaVisibilityEnum("visibility").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credits_listing_year_idx").on(table.listingId, table.year),
  ],
)

// --- Media Items (§1.9) ---

export const mediaItems = pgTable(
  "media_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    type: mediaTypeEnum("type").notNull(),
    url: text("url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    visibility: mediaVisibilityEnum("visibility").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("media_items_listing_sort_idx").on(table.listingId, table.sortOrder),
  ],
)

// --- Social Profiles (§1.10) ---

export const socialProfiles = pgTable(
  "social_profiles",
  {
    id: serial("id").primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // text not pgEnum — extensible value set, validated at app layer via Zod [S1-ST-9]
    platform: text("platform").notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    index("social_profiles_listing_idx").on(table.listingId),
  ],
)

// --- Accreditations (§1.11) ---

export const accreditations = pgTable(
  "accreditations",
  {
    id: serial("id").primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    membershipType: text("membership_type"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    index("accreditations_listing_idx").on(table.listingId),
  ],
)

// --- Pending Enquiries (§1.12) ---

export const pendingEnquiries = pgTable(
  "pending_enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // PP's enquiry ID from EnquirySubmittedEvent, not D&L's enquiry_records.id [S1-ST-3]
    enquiryId: uuid("enquiry_id").notNull(),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_enquiries_listing_idx").on(table.listingId),
  ],
)

// --- Pre-Claim Snapshots (§1.13) ---

export const preClaimSnapshots = pgTable("pre_claim_snapshots", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// --- Additional Locations (§1.14) ---

export const additionalLocations = pgTable(
  "additional_locations",
  {
    id: serial("id").primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    postcode: text("postcode"),
    region: text("region"),
    lat: real("lat"),
    lng: real("lng"),
  },
  (table) => [
    index("additional_locations_listing_idx").on(table.listingId),
  ],
)

// --- Zero-Result Queries (§1.15) [S1-ST-6] ---

export const zeroResultQueries = pgTable(
  "zero_result_queries",
  {
    id: serial("id").primaryKey(),
    query: text("query").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("zero_result_queries_created_idx").on(table.createdAt),
  ],
)

// --- Controlled Vocabulary (§9) [S1-ST-11] ---

export const controlledVocabulary = pgTable(
  "controlled_vocabulary",
  {
    id: serial("id").primaryKey(),
    category: vocabularyCategoryEnum("category").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("controlled_vocabulary_cat_val_idx")
      .on(table.category, table.value),
    index("controlled_vocabulary_cat_idx").on(table.category),
  ],
)

// --- Search Synonyms (§3.3) ---

export const searchSynonyms = pgTable(
  "search_synonyms",
  {
    id: serial("id").primaryKey(),
    term: text("term").notNull(),
    synonym: text("synonym").notNull(),
    weight: real("weight").notNull().default(1.0),
  },
  (table) => [
    index("search_synonyms_term_idx").on(table.term),
  ],
)
