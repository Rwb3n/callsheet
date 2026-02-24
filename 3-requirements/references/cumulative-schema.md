# Cumulative Schema Snapshot — After S10

**Last updated:** 2026-02-15
**Authoritative source:** This file. Produced by fix-applier after each v2.
**Consumed by:** Slice pre-draft checklist (eliminates schema reconstruction from prior slices).

---

## pgEnum Declarations

```typescript
// === S0: Shared Infrastructure (src/db/schema/shared.ts) ===

export const deferredActionStatusEnum = pgEnum("deferred_action_status", [
  "pending", "executing", "completed", "failed", "exhausted", "cancelled",
])
// Authoritative in S0 §1.2

export const deferredActionRetryEnum = pgEnum("deferred_action_retry", ["once", "retry_3"])
// Authoritative in S0 §1.2

export const deferredActionFailureEnum = pgEnum("deferred_action_failure", ["log", "alert_principal"])
// Authoritative in S0 §1.2

export const orchestratedFlowStatusEnum = pgEnum("orchestrated_flow_status", [
  "initiated", "in_progress", "completed", "failed", "escalated",
])
// Authoritative in S0 §1.2

// === S1: Data & Listings (src/db/schema/data-and-listings.ts) ===

export const entityTypeEnum = pgEnum("entity_type", [
  "freelancer", "company", "education", "industry_body", "public_sector", "non_profit",
])
// Authoritative in S1 §1.1

export const claimStatusEnum = pgEnum("claim_status", [
  "unclaimed", "pending_review", "claimed", "disputed",
])
// Authoritative in S1 §1.1

export const verificationTierEnum = pgEnum("verification_tier", [
  "unclaimed", "claimed", "verified", "premium_verified",
])
// Authoritative in S1 §1.1

export const lifecycleStatusEnum = pgEnum("lifecycle_status", [
  "active", "inactive", "merged", "dissolved", "suspended", "archived",
])
// Authoritative in S1 §1.1

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free", "standard", "premium", "partner",
])
// Authoritative in S1 §1.1

export const availabilityStatusEnum = pgEnum("availability_status", [
  "available", "available_from", "unavailable",
])
// Authoritative in S1 §1.1

export const travelWillingnessEnum = pgEnum("travel_willingness", [
  "local_only", "regional", "uk_wide", "international",
])
// Authoritative in S1 §1.1

export const budgetTierEnum = pgEnum("budget_tier", ["low", "mid", "high"])
// Authoritative in S1 §1.1

export const leadTimeEnum = pgEnum("lead_time", [
  "same_day", "1_week", "2_4_weeks", "6_plus_weeks",
])
// Authoritative in S1 §1.1

export const creditFormatEnum = pgEnum("credit_format", [
  "feature", "tv_series", "tv_one_off", "short", "commercial",
  "corporate", "music_video", "digital_social", "live_event",
])
// Authoritative in S1 §1.1

export const creditSourcingEnum = pgEnum("credit_sourcing", [
  "self_reported", "imdb_linked", "client_confirmed",
])
// Authoritative in S1 §1.1

export const verificationMethodEnum = pgEnum("verification_method", [
  "email_domain_match", "companies_house_active", "companies_house_deep",
  "website_bidirectional", "vat_registration", "trade_body_membership",
  "client_confirmed_credit", "portfolio_review", "imdb_verified",
  "insurance_verified", "award_verified", "linkedin_verified",
])
// Authoritative in S1 §1.1

export const shortlistItemStatusEnum = pgEnum("shortlist_item_status", [
  "active", "archived", "suspended", "removed",
])
// Authoritative in S1 §1.1, amended S1-ST-7

export const mediaTypeEnum = pgEnum("media_type", [
  "logo", "headshot", "portfolio", "gallery", "showreel_url",
])
// Authoritative in S1 §1.1, amended S1-ST-8

export const vocabularyCategoryEnum = pgEnum("vocabulary_category", [
  "equipment", "software", "genre", "region", "transaction_type",
])
// Authoritative in S1 §1.1, amended S1-ST-11

// === S4: Subscriptions ===

export const mediaVisibilityEnum = pgEnum("media_visibility", ["visible", "hidden"])
// Authoritative in S4 §5.1

// === S5: Provider Experience ===

export const enquiryStatusEnum = pgEnum("enquiry_status", [
  "unread", "responded", "stale",
])
// Authoritative in S5 §16.3

// === S9: Entity Intelligence (src/db/schema/intelligence.ts) ===

export const decaySignalTypeEnum = pgEnum("decay_signal_type", [
  "website_dead", "email_bounced", "ch_not_active", "stale_listing",
  "social_dead", "postcode_invalid", "domain_expired",
])
// Authoritative in S9 00-schema.md §1

export const decaySignalSeverityEnum = pgEnum("decay_signal_severity", [
  "critical",    // blocks search visibility, immediate action required
  "high",        // provider outreach, 14-day resolution window
  "medium",      // quality score impact, 30-day resolution window
  "low",         // minor data quality concern, no notification, quality score only [S9-ST-9]
])
// Authoritative in S9 00-schema.md §1, amended S9-ST-9 (+low)

export const enrichmentCheckTypeEnum = pgEnum("enrichment_check_type", [
  "website", "email", "ch", "social", "postcode", "imdb",
])
// Authoritative in S9 00-schema.md §1

export const ceremonyTypeEnum = pgEnum("ceremony_type", [
  "taxonomy_review", "data_health_review", "verification_calibration",
  "provider_outreach", "conversion_funnel_analysis", "revenue_review",
  "multi_listing_pricing", "sponsored_placement_learning",
  "operational_health_review", "contractor_performance_review",
  "principal_briefing", "learning_hypothesis_analysis",
])
// Authoritative in S9 00-schema.md §1

// === S7: Operations (src/db/schema/operations.ts) ===

export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", [
  "critical", "high", "normal", "low",
])
// Authoritative in S7 00-schema.md §1

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open", "assigned", "resolved", "closed",
])
// Authoritative in S7 00-schema.md §1

export const taskSpecDomainEnum = pgEnum("task_spec_domain", [
  "verification", "support", "moderation", "compliance", "data_maintenance", "outreach",
])
// Authoritative in S7 00-schema.md §1

export const taskSpecPriorityEnum = pgEnum("task_spec_priority", [
  "critical", "high", "normal", "low",
])
// Authoritative in S7 00-schema.md §1

export const taskSpecStatusEnum = pgEnum("task_spec_status", [
  "pending", "assigned", "in_progress", "completed", "timed_out", "re_routed",
])
// Authoritative in S7 00-schema.md §1

export const complianceEntryTypeEnum = pgEnum("compliance_entry_type", [
  "dsar", "erasure", "article_14", "complaint", "investigation", "obligation",
])
// Authoritative in S7 00-schema.md §1

export const complianceEntryStatusEnum = pgEnum("compliance_entry_status", [
  "open", "in_progress", "completed", "overdue",
])
// Authoritative in S7 00-schema.md §1
```

---

## Tables

### S0: Shared Infrastructure (5 tables)

```typescript
// src/db/schema/shared.ts
// Authoritative in S0 §1.2, amended by S5 (notifications), S7 (orchestrated_flows, event_consumer_errors)

export const deferredActions = pgTable("deferred_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  params: jsonb("params").notNull().$type<Record<string, unknown>>(),
  executeAt: timestamp("execute_at", { withTimezone: true }).notNull(),
  retryPolicy: deferredActionRetryEnum("retry_policy").notNull(),
  onFailure: deferredActionFailureEnum("on_failure").notNull(),
  createdBy: text("created_by").notNull(),
  status: deferredActionStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
})
// Partial index: WHERE status = 'pending' ON (status, execute_at)

export const orchestratedFlows = pgTable("orchestrated_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  flowType: text("flow_type").notNull(),
  triggeredBy: text("triggered_by").notNull(),       // text not uuid — DSAR external refs [S0-12]
  status: orchestratedFlowStatusEnum("status").notNull().default("initiated"),
  steps: jsonb("steps").notNull(),                   // OrchestratedFlowStep[] (SI §3.2)
  context: jsonb("context"),                         // shared mutable context (SI §3.3)
  currentStep: integer("current_step").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  escalationReason: text("escalation_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),  // S7 amendment (S0-3)
})

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),                     // S5-ST-5: null = unread
  dismissed: boolean("dismissed").notNull().default(false),                 // S5-ST-5
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),           // S5-ST-5
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Partial index: WHERE read_at IS NULL AND dismissed = false ON (account_id)
// Index: (account_id, created_at DESC)

export const decisionLogs = pgTable("decision_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  decisionType: text("decision_type").notNull(),
  inputs: jsonb("inputs").notNull(),
  output: jsonb("output").notNull(),
  confidence: real("confidence"),                    // 0–1 fractional [S0-17]
  listingId: uuid("listing_id"),
  accountId: uuid("account_id"),
  additionalContext: jsonb("additional_context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const eventConsumerErrors = pgTable("event_consumer_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  consumerDomain: text("consumer_domain").notNull(),
  consumerId: text("consumer_id").notNull(),
  payload: jsonb("payload").notNull(),
  error: text("error").notNull(),
  stack: text("stack"),
  mode: text("mode").notNull(),
  resolved: boolean("resolved").notNull().default(false),                  // S7 amendment (S0-11)
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),            // S7 amendment (S0-11)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (event_type, consumer_domain, created_at DESC)
// Partial index: (created_at DESC) WHERE resolved = false — S7 admin view
```

### S0: Auth (Better Auth managed)

```typescript
// src/db/schema/auth.ts — Better Auth managed tables
// S0 extends with additionalFields:
//   role: text("role").notNull().default("user")  // "user" | "admin"
// Authoritative in S0 §5
```

### S1: Data & Listings (14 tables)

```typescript
// src/db/schema/data-and-listings.ts
// Authoritative in S1 §1.2–§1.15, amended by S4 (subscription columns), S5 (version column), S9 (quality_scores +calculatedBy, +algorithmVersion)

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  entityType: entityTypeEnum("entity_type").notNull(),
  claimStatus: claimStatusEnum("claim_status").notNull().default("unclaimed"),
  slug: text("slug").notNull().unique(),
  // Identity
  name: text("name").notNull(),
  companiesHouseNumber: text("companies_house_number"),
  vatNumber: text("vat_number"),
  foundedYear: integer("founded_year"),
  formerlyKnownAs: text("formerly_known_as").array().default([]),
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
  serviceRegions: text("service_regions").array().default([]),
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
  // S4 additions
  paddleSubscriptionId: text("paddle_subscription_id"),
  paddleCustomerId: text("paddle_customer_id"),
  billingCadence: text("billing_cadence"),                                  // "annual" | "monthly" | null
  subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
  subscriptionEndDate: timestamp("subscription_end_date", { withTimezone: true }),
  // S2 additions
  source: text("source"),                                                   // "manual" | "4rfv_import"
  article14NoticeDisplayed: boolean("article_14_notice_displayed"),
  // S5 addition
  version: integer("version").notNull().default(1),                         // optimistic concurrency
  // Lifecycle
  lifecycleStatus: lifecycleStatusEnum("lifecycle_status").notNull().default("active"),
  lastProviderLogin: timestamp("last_provider_login", { withTimezone: true }),
  mergedInto: uuid("merged_into"),
  succeededBy: uuid("succeeded_by"),
  // Search
  searchVector: tsvectorType("search_vector"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// GIN index on searchVector
// Index: (account_id) WHERE account_id IS NOT NULL
// Index: (companies_house_number) WHERE companies_house_number IS NOT NULL
// Index: (lifecycle_status) — partial WHERE lifecycle_status = 'active'
// Index: (slug) — unique constraint
// Index: (entity_type, lifecycle_status)

export const verifications = pgTable("verifications", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  tier: verificationTierEnum("tier").notNull().default("unclaimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationMethods: verificationMethodEnum("verification_methods").array().default([]),
  lastVerificationCheck: timestamp("last_verification_check", { withTimezone: true }),
  verificationScore: integer("verification_score").notNull().default(0),
})
// Authoritative in S1 §1.3

export const qualityScores = pgTable("quality_scores", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  completeness: integer("completeness").notNull().default(0),     // 0–25
  freshness: integer("freshness").notNull().default(0),           // 0–25
  accuracy: integer("accuracy").notNull().default(0),             // 0–20
  richness: integer("richness").notNull().default(0),             // 0–15
  verification: integer("verification").notNull().default(0),     // 0–15
  composite: integer("composite").notNull().default(0),           // 0–100
  lastCalculated: timestamp("last_calculated", { withTimezone: true }).notNull().defaultNow(),
  // S9 additions:
  calculatedBy: text("calculated_by").notNull().default("zero_init"),   // "zero_init" | "calibrated"
  algorithmVersion: integer("algorithm_version").notNull().default(1),  // score version tracking
})
// Authoritative in S1 §1.4, amended by S9 (+calculatedBy, +algorithmVersion)

export const qualityScoreExplanations = pgTable("quality_score_explanations", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  explanation: jsonb("explanation").notNull().$type<QualityScoreExplanation>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// Authoritative in S1 §1.5

export const engagements = pgTable("engagements", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  profileViews: integer("profile_views").notNull().default(0),
  searchAppearances: integer("search_appearances").notNull().default(0),
  enquiriesReceived: integer("enquiries_received").notNull().default(0),
  enquiryResponseRate: real("enquiry_response_rate"),
  enquiryResponseTime: real("enquiry_response_time"),            // minutes
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// Authoritative in S1 §1.6

export const taxonomySectors = pgTable("taxonomy_sectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Authoritative in S1 §1.7

export const taxonomyServiceAreas = pgTable("taxonomy_service_areas", {
  id: serial("id").primaryKey(),
  sectorId: integer("sector_id").notNull().references(() => taxonomySectors.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Unique: (sector_id, slug)
// Authoritative in S1 §1.7

export const taxonomySpecialisations = pgTable("taxonomy_specialisations", {
  id: serial("id").primaryKey(),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Unique: (service_area_id, slug)
// Authoritative in S1 §1.7

export const listingTaxonomyTags = pgTable("listing_taxonomy_tags", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  sectorId: integer("sector_id").notNull().references(() => taxonomySectors.id),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  specialisationId: integer("specialisation_id").references(() => taxonomySpecialisations.id),
})
// Index: (listing_id)
// Index: (sector_id, service_area_id)
// Unique: (listing_id, sector_id, service_area_id, specialisation_id) WHERE specialisation_id IS NOT NULL
// Partial unique: (listing_id, sector_id, service_area_id) WHERE specialisation_id IS NULL
// Authoritative in S1 §1.7

export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  projectName: text("project_name").notNull(),
  clientCommissioner: text("client_commissioner"),
  roleProvided: text("role_provided").notNull(),
  year: integer("year").notNull(),
  format: creditFormatEnum("format").notNull(),
  genres: text("genres").array().default([]),
  awards: text("awards").array().default([]),
  sourcingMethod: creditSourcingEnum("sourcing_method").notNull().default("self_reported"),
  verificationDate: timestamp("verification_date", { withTimezone: true }),
  imdbUrl: text("imdb_url"),
  clientCompanyName: text("client_company_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, year DESC)
// Authoritative in S1 §1.8

export const mediaItems = pgTable("media_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, sort_order)
// Authoritative in S1 §1.9

export const socialProfiles = pgTable("social_profiles", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),              // "imdb" | "linkedin" | etc. — text not enum
  url: text("url").notNull(),
})
// Index: (listing_id)
// Authoritative in S1 §1.10

export const accreditations = pgTable("accreditations", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  membershipType: text("membership_type"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
})
// Index: (listing_id)
// Authoritative in S1 §1.11

export const pendingEnquiries = pgTable("pending_enquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  enquiryId: uuid("enquiry_id").notNull(),           // PP's enquiry ID from EnquirySubmittedEvent
  forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id)
// Partial index: WHERE expires_at > now()
// Authoritative in S1 §1.12

export const preClaimSnapshots = pgTable("pre_claim_snapshots", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),              // { claimantAccountId, pendingEdits, disputeContext? }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Authoritative in S1 §1.13, extended by S3 §6.3

export const additionalLocations = pgTable("additional_locations", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  postcode: text("postcode"),
  region: text("region"),
  lat: real("lat"),
  lng: real("lng"),
})
// Index: (listing_id)
// Authoritative in S1 §1.14

export const zeroResultQueries = pgTable("zero_result_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  filters: jsonb("filters").$type<SearchFilters>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (created_at DESC)
// Authoritative in S1 §1.15
```

### S1: Account & Buyer Tables (5 tables)

```typescript
// src/db/schema/data-and-listings.ts (account extensions)
// Authoritative in S1 §2.1–§2.2, amended by S4 (paddleCustomerId), S5 (enquiry status)

export const accountProfiles = pgTable("account_profiles", {
  accountId: uuid("account_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  paddleCustomerId: text("paddle_customer_id"),      // S4: set on first checkout
  emailPreferences: jsonb("email_preferences").notNull().$type<EmailPreferences>().default({
    enquiry_notification: true,
    listing_status: true,
    profile_nudge: true,
    conversion_marketing: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// Authoritative in S1 §2.1, amended by S4 §1.2

export const shortlists = pgTable("shortlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My Shortlist"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)
// Authoritative in S1 §2.2

export const shortlistItems = pgTable("shortlist_items", {
  id: serial("id").primaryKey(),
  shortlistId: uuid("shortlist_id").notNull().references(() => shortlists.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  status: shortlistItemStatusEnum("status").notNull().default("active"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
})
// Unique: (shortlist_id, listing_id)
// Index: (listing_id)
// Authoritative in S1 §2.2

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query"),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)
// Authoritative in S1 §2.2

export const enquiryRecords = pgTable("enquiry_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderAccountId: uuid("sender_account_id").references(() => users.id, { onDelete: "set null" }),
  senderEmail: text("sender_email"),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body").notNull(),
  status: enquiryStatusEnum("status").notNull().default("unread"),  // S5 §16.3
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  responseTimeMinutes: integer("response_time_minutes"),
})
// Index: (sender_account_id) WHERE sender_account_id IS NOT NULL
// Index: (listing_id, sent_at DESC)
// Index: (sender_email) WHERE sender_email IS NOT NULL AND sender_account_id IS NULL
// Authoritative in S1 §2.2, amended by S5 §16.3
```

### S1: Search Infrastructure (1 table)

```typescript
export const searchSynonyms = pgTable("search_synonyms", {
  id: serial("id").primaryKey(),
  term: text("term").notNull(),
  synonym: text("synonym").notNull(),
  weight: real("weight").notNull().default(1.0),
})
// Index: (term)
// Authoritative in S1 §3.3

export const controlledVocabulary = pgTable("controlled_vocabulary", {
  id: serial("id").primaryKey(),
  category: vocabularyCategoryEnum("category").notNull(),
  term: text("term").notNull(),
  aliases: text("aliases").array().default([]),
})
// Unique: (category, term)
// Authoritative in S1 §8
```

### S4: Subscriptions (3 tables)

```typescript
// src/db/schema/operations.ts
// Authoritative in S4 §1.3, authoritative definition in S7 00-schema.md §2.4

export const pendingCancellations = pgTable("pending_cancellations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paddleSubscriptionId: text("paddle_subscription_id").notNull(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
    // CancellationReason: "voluntary" | "payment_failure" | "paddle_reconciliation" |
    // "account_closed" | "listing_archived"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (paddle_subscription_id)
// Retention: 24h cleanup inline in webhook handler
// Authoritative in S7 00-schema.md §2.4 (S4 §1.3 identical)

export const processedPaddleEvents = pgTable("processed_paddle_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
})
// Retention: 30 days, inline cleanup
// Authoritative in S4 §1.4

// src/db/schema/commercial.ts
export const gracePeriods = pgTable("grace_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  paddleSubscriptionId: text("paddle_subscription_id").notNull(),
  previousTier: text("previous_tier").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),                    // "payment_recovered" | "downgraded" | "cancelled_by_refund"
})
// Index: (listing_id)
// Index: (expires_at) WHERE resolved_at IS NULL
// Authoritative in S4 §1.5
```

### S6: Buyer Experience (1 table)

```typescript
// src/db/schema/buyer.ts
// Authoritative in S6 00-schema.md §1.1

export const searchHistory = pgTable("search_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query"),
  filters: jsonb("filters").$type<SearchFilters>(),
  resultCount: integer("result_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id, created_at DESC)
// Retention: 12 months, search_history_cleanup deferred action
```

### S7: Operations (7 tables)

```typescript
// src/db/schema/operations.ts
// Authoritative in S7 00-schema.md §2

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  category: text("category").notNull(),
    // "billing_support" | "profile_support" | "claim_dispute" | "feature_gating_confusion" |
    // "account_access" | "data_request" | "refund_request" | "other"
  priority: supportTicketPriorityEnum("priority").notNull(),
  status: supportTicketStatusEnum("status").notNull().default("open"),
  subject: text("subject").notNull(),
  details: jsonb("details"),                         // category-specific metadata incl. gate for friction tracking
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)
// Index: (listing_id) — hasActiveTicket query
// Index: (status, priority) — admin queue
// Partial index: (sla_deadline) WHERE status IN ('open', 'assigned')
// Index: (category) WHERE category = 'feature_gating_confusion'

export const taskSpecs = pgTable("task_specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: taskSpecDomainEnum("domain").notNull(),
  priority: taskSpecPriorityEnum("priority").notNull(),
  status: taskSpecStatusEnum("status").notNull().default("pending"),
  task: text("task").notNull(),
  context: jsonb("context").notNull(),               // immutable snapshot (R6)
  checklist: jsonb("checklist").notNull().$type<string[]>(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  estimatedTime: text("estimated_time").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  timeout: integer("timeout").notNull(),             // hours
  escalation: text("escalation").notNull(),
  requiredSkills: jsonb("required_skills").notNull().$type<string[]>(),
  dataAccessScope: jsonb("data_access_scope").notNull().$type<DataAccessScope>(),
  learningCapture: jsonb("learning_capture").notNull().$type<LearningCapture>(),
  rerouteCount: integer("reroute_count").notNull().default(0),
  maxReroutes: integer("max_reroutes").notNull(),
  externalRef: text("external_ref"),
  externalPlatform: text("external_platform"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  result: jsonb("result"),
})
// Index: (domain, status)
// Index: (status, priority)
// Partial index: (deadline) WHERE status IN ('pending', 'assigned', 'in_progress')

export const churnRiskRegistry = pgTable("churn_risk_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  riskLevel: text("risk_level").notNull(),           // "at_risk" | "high_risk"
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
// Index: (account_id)
// Index: (expires_at)
// Unique: (listing_id)

export const billingHolds = pgTable("billing_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id)
// Index: (expires_at)

export const complianceRegister = pgTable("compliance_register", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: complianceEntryTypeEnum("type").notNull(),
  accountId: uuid("account_id").references(() => users.id, { onDelete: "set null" }),
  status: complianceEntryStatusEnum("status").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (type, status)
// Index: (account_id)
// Partial index: (deadline) WHERE status IN ('open', 'in_progress')

export const billingReconciliationStatus = pgTable("billing_reconciliation_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),                  // "healthy" | "anomaly_detected" | "failed"
  activeHolds: integer("active_holds").notNull().default(0),
  lastAnomalyAt: timestamp("last_anomaly_at", { withTimezone: true }),
  lastAnomalyDescription: text("last_anomaly_description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// No indexes — single-row table
```

### S8: Commercial (3 tables)

```typescript
// src/db/schema/commercial.ts
// Authoritative in S8 00-schema.md §2

export const commercialState = pgTable("commercial_state", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),

  // Conversion trigger tracking
  lastViewMilestoneFired: integer("last_view_milestone_fired"),
  firstEnquiryTriggerFired: boolean("first_enquiry_trigger_fired").notNull().default(false),
  competitorUpgradedFired: integer("competitor_upgraded_fired").notNull().default(0),
  lastCompetitorUpgradedAt: timestamp("last_competitor_upgraded_at", { withTimezone: true }),
  analyticsTeaseFired: integer("analytics_tease_fired").notNull().default(0),
  lastAnalyticsTeaseAt: timestamp("last_analytics_tease_at", { withTimezone: true }),
  socialProofFired: integer("social_proof_fired").notNull().default(0),
  lastSocialProofAt: timestamp("last_social_proof_at", { withTimezone: true }),
  engagementSummaryFired: integer("engagement_summary_fired").notNull().default(0),
  lastEngagementSummaryAt: timestamp("last_engagement_summary_at", { withTimezone: true }),
  endowmentCtaShown: boolean("endowment_cta_shown").notNull().default(false),

  // Churn analysis
  lastChurnEventAt: timestamp("last_churn_event_at", { withTimezone: true }),
  lastChurnReason: text("last_churn_reason"),

  // Revenue tracking
  effectivePriceAtSubscription: integer("effective_price_at_subscription"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// PK covers listing_id lookup. No additional indexes needed.

export const churnAnalysisLog = pgTable("churn_analysis_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  accountId: uuid("account_id"),                    // soft reference, no FK — survives account deletion
  accountHash: text("account_hash"),                // SHA-256 of accountId post-erasure
  eventType: text("event_type").notNull(),
    // "churn" | "conversion" | "upgrade" | "downgrade" | "renewal" | "refund" |
    // "win_back_sent" | "win_back_converted"
  reason: text("reason"),
  subscriptionTier: text("subscription_tier"),
  annualRevenue: integer("annual_revenue"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, created_at DESC)
// Index: (event_type, created_at DESC)
// Index: (account_id) WHERE account_id IS NOT NULL

export const sponsoredImpressions = pgTable("sponsored_impressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  impressionDate: timestamp("impression_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, impression_date DESC)
// Index: (service_area_id, impression_date DESC)
// Retention: 90 days, probabilistic inline cleanup (5% per invocation)
```

### S9: Entity Intelligence (6 tables)

```typescript
// src/db/schema/intelligence.ts
// Authoritative in S9 00-schema.md §2

export const enrichmentSchedules = pgTable("enrichment_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  checkType: enrichmentCheckTypeEnum("check_type").notNull(),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull(),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastFullCycleAt: timestamp("last_full_cycle_at", { withTimezone: true }),
  cadenceTier: text("cadence_tier").notNull(),  // "paid" | "claimed" | "unclaimed"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Composite unique: (listing_id, check_type)
// Index: (next_check_at)
// Index: (listing_id)

export const decaySignals = pgTable("decay_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  signalType: decaySignalTypeEnum("signal_type").notNull(),
  severity: decaySignalSeverityEnum("severity").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),  // "auto_healed" | "manually_resolved" | "listing_archived"
  checkDetails: jsonb("check_details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, resolved_at) WHERE resolved_at IS NULL
// Index: (detected_at DESC)
// Index: (severity, resolved_at) WHERE resolved_at IS NULL

export const perceptionAggregates = pgTable("perception_aggregates", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  aggregateType: text("aggregate_type").notNull(),
    // "search_terms" | "viewer_demographics" | "competitor_benchmarking" | "enquiry_response"
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  sampleSize: integer("sample_size").notNull(),
})
// Composite unique: (listing_id, aggregate_type, period_start)
// Index: (listing_id, aggregate_type, period_start)
// Index: (computed_at DESC)

export const ceremonyRuns = pgTable("ceremony_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ceremonyType: ceremonyTypeEnum("ceremony_type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),  // "running" | "completed" | "failed"
  inputsHash: text("inputs_hash").notNull(),
  outputs: jsonb("outputs").$type<Record<string, unknown>>(),
  decisionsLogged: integer("decisions_logged").notNull().default(0),
  nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (ceremony_type, started_at DESC)
// Index: (status) WHERE status = 'running'
// Index: (next_scheduled_at)

export const learningHypotheses = pgTable("learning_hypotheses", {
  id: text("id").primaryKey(),  // "L1" through "L7"
  hypothesis: text("hypothesis").notNull(),
  measurementQuery: text("measurement_query").notNull(),
  currentValue: numeric("current_value"),
  previousValue: numeric("previous_value"),
  trend: text("trend"),  // "improving" | "stable" | "declining" | "insufficient_data"
  lastMeasuredAt: timestamp("last_measured_at", { withTimezone: true }),
  confoundWarning: text("confound_warning"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
// No indexes — 7-row lookup table

export const principalBriefings = pgTable("principal_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  content: jsonb("content").notNull().$type<PrincipalBriefing>(),
  ceremonyRunId: uuid("ceremony_run_id")
    .notNull()
    .references(() => ceremonyRuns.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (generated_at DESC)
// Index: (ceremony_run_id)
// Index: (sent_at) WHERE sent_at IS NULL
```

### S10: Hardening (0 tables)

```typescript
// S10 adds no new tables and no new pgEnums.
// S10 wires existing infrastructure: orchestrated flows (S0), processErasure (S1/S9),
// compliance_register (S7), account closure steps (S1/S4/S6).
//
// Schema impact:
// - +1 decision type: `graduation_evaluation` (registered in SI §9.2, stored in `decision_logs.decisionType` text column — no DDL change)
// - +1 telemetry type: `algorithm_comparison` (operational telemetry, same `decision_logs` table — no DDL change)
// - No amendments to any prior table definitions
```

---

## Summary

| # | Table | Schema File | Owner | Authoritative Source | Amended By |
|---|-------|-------------|-------|---------------------|------------|
| 1 | `deferred_actions` | shared.ts | Shared | S0 §1.2 | — |
| 2 | `orchestrated_flows` | shared.ts | Shared | S0 §1.2 | S7 (+updatedAt) |
| 3 | `notifications` | shared.ts | Shared | S0 §1.2 | S5 (readAt/dismissed) |
| 4 | `decision_logs` | shared.ts | Shared | S0 §1.2 | — |
| 5 | `event_consumer_errors` | shared.ts | Shared | S0 §1.2 | S7 (+resolved/resolvedAt) |
| 6 | `listings` | data-and-listings.ts | D&L | S1 §1.2 | S2 (source, article14), S4 (paddle*, billing*), S5 (version) |
| 7 | `verifications` | data-and-listings.ts | D&L | S1 §1.3 | — |
| 8 | `quality_scores` | data-and-listings.ts | D&L | S1 §1.4 | S9 (+calculatedBy, +algorithmVersion) |
| 9 | `quality_score_explanations` | data-and-listings.ts | D&L | S1 §1.5 | — |
| 10 | `engagements` | data-and-listings.ts | D&L | S1 §1.6 | — |
| 11 | `taxonomy_sectors` | data-and-listings.ts | D&L | S1 §1.7 | — |
| 12 | `taxonomy_service_areas` | data-and-listings.ts | D&L | S1 §1.7 | — |
| 13 | `taxonomy_specialisations` | data-and-listings.ts | D&L | S1 §1.7 | — |
| 14 | `listing_taxonomy_tags` | data-and-listings.ts | D&L | S1 §1.7 | — |
| 15 | `credits` | data-and-listings.ts | D&L | S1 §1.8 | — |
| 16 | `media_items` | data-and-listings.ts | D&L | S1 §1.9 | — |
| 17 | `social_profiles` | data-and-listings.ts | D&L | S1 §1.10 | — |
| 18 | `accreditations` | data-and-listings.ts | D&L | S1 §1.11 | — |
| 19 | `pending_enquiries` | data-and-listings.ts | D&L | S1 §1.12 | — |
| 20 | `pre_claim_snapshots` | data-and-listings.ts | D&L | S1 §1.13 | S3 (snapshot JSONB extended) |
| 21 | `additional_locations` | data-and-listings.ts | D&L | S1 §1.14 | — |
| 22 | `zero_result_queries` | data-and-listings.ts | D&L | S1 §1.15 | — |
| 23 | `account_profiles` | data-and-listings.ts | D&L | S1 §2.1 | S4 (+paddleCustomerId) |
| 24 | `shortlists` | data-and-listings.ts | D&L | S1 §2.2 | — |
| 25 | `shortlist_items` | data-and-listings.ts | D&L | S1 §2.2 | — |
| 26 | `saved_searches` | data-and-listings.ts | D&L | S1 §2.2 | — |
| 27 | `enquiry_records` | data-and-listings.ts | PP | S1 §2.2 | S5 (+status) |
| 28 | `search_synonyms` | data-and-listings.ts | D&L | S1 §3.3 | — |
| 29 | `controlled_vocabulary` | data-and-listings.ts | D&L | S1 §8 | — |
| 30 | `pending_cancellations` | operations.ts | Ops | S4 §1.3 / S7 §2.4 | — |
| 31 | `processed_paddle_events` | operations.ts | Ops | S4 §1.4 | — |
| 32 | `grace_periods` | commercial.ts | CR | S4 §1.5 | — |
| 33 | `search_history` | buyer.ts | PP | S6 §1.1 | — |
| 34 | `support_tickets` | operations.ts | Ops | S7 §2.1 | — |
| 35 | `task_specs` | operations.ts | Ops | S7 §2.2 | — |
| 36 | `churn_risk_registry` | operations.ts | Ops | S7 §2.3 | — |
| 37 | `billing_holds` | operations.ts | Ops | S7 §2.5 | — |
| 38 | `compliance_register` | operations.ts | Ops | S7 §2.6 | — |
| 39 | `billing_reconciliation_status` | operations.ts | Ops | S7 §2.7 | — |
| 40 | `commercial_state` | commercial.ts | CR | S8 §2.1 | — |
| 41 | `churn_analysis_log` | commercial.ts | CR | S8 §2.2 | — |
| 42 | `sponsored_impressions` | commercial.ts | CR | S8 §2.3 | — |
| 43 | `enrichment_schedules` | intelligence.ts | D&L | S9 §2.1 | — |
| 44 | `decay_signals` | intelligence.ts | D&L | S9 §2.2 | — |
| 45 | `perception_aggregates` | intelligence.ts | All | S9 §2.3 | — |
| 46 | `ceremony_runs` | intelligence.ts | All | S9 §2.4 | — |
| 47 | `learning_hypotheses` | intelligence.ts | Ops | S9 §2.5 | — |
| 48 | `principal_briefings` | intelligence.ts | Ops | S9 §2.6 | — |

**Total: 48 Drizzle-defined table rows** in this summary (42 from S8 + 6 new S9 tables + 0 new S10 tables). S10 adds no new tables — it wires existing infrastructure. This file enumerates all Drizzle-defined tables without deduplication.

**Total pgEnums: 36** (32 from S8 + 4 new S9: `decay_signal_type`, `decay_signal_severity`, `enrichment_check_type`, `ceremony_type` + 0 new S10).

**Total decision types: 27** (26 from S9 + 1 new S10: `graduation_evaluation`). Stored in `decision_logs.decisionType` (text column, no DDL change). Plus 1 telemetry type: `algorithm_comparison`.

**Schema complete.** All 11 slices (S0–S10) accounted for. No further additions expected in the requirements phase.
