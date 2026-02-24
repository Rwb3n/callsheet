# Slice 1: Data Model

**Status:** Draft v2 — v1 + 16 stress test fixes (3 High, 8 Medium, 5 Low).
**Primary Owner:** Data & Listings
**Last updated:** 2026-02-12
**Dependencies:** S0 (event bus, scheduler, auth, email transport, R2, service abstraction, tRPC, database connection)
**Inputs:** `interfaces/data-and-listings.md` (v5), `interfaces/shared-infrastructure.md` (v8), `2-concept-design/data-and-listings.md` (v6), `slices/slice-00-infrastructure.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S2 (Onboarding), S3 (Claim & Verify), S4 (Subscriptions), S5 (Provider Experience), S6 (Buyer Experience)

---

## Summary

S1 implements the core data model that every feature slice depends on. Deliverables: Drizzle schema for Listing, Account profile, Taxonomy, QualityScore, Engagement, Enquiry, and supporting entities; PostgreSQL full-text search via `tsvector` + `pg_trgm`; CRUD tRPC routes for listings and profiles; image upload pipeline via R2; listing integrity rules (duplicate detection, identity verification, CH uniqueness); JSON-LD structured data generation; and the email preference storage that S0's email transport depends on. This document covers only the implementation delta — for types, contracts, and principles, see upstream specs.

**Event emission ownership [S1-ST-1]:** tRPC routes in `src/server/routers/` are Platform's web application surface. Platform emits its own events (`listing_created`, `profile_edited`, `search_performed`, `profile_viewed`, `enquiry_submitted`, `enquiry_responded`, `contact_attempt`) from route handlers after D&L domain logic completes. D&L provides schema and domain logic (integrity checks, taxonomy overlap, quality score storage); Platform owns the HTTP surface and emits Platform-owned events. This is consistent with PP interface spec §1.

## V1 Scope Boundary

**In scope:** All Listing, Account, Taxonomy, and QualityScore schema and CRUD at V1 scale (~4,700 listings, ~200 accounts). Search index. Image pipeline. Integrity rules. JSON-LD. Email preferences.

**Deferred to later slices:** Claim evaluation logic (S3), subscription tier management (S4), provider dashboard UI (S5), buyer-facing search UI (S6), admin views (S7), quality scoring algorithms (S9), decay detection (S9).

---

## 1. Schema: Data & Listings

### 1.1 Drizzle pgEnum Declarations

All enums are standalone named constants per S0 pattern. [Source: S0 §1.2, S0-1]

```typescript
// src/db/schema/data-and-listings.ts

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

export const shortlistItemStatusEnum = pgEnum("shortlist_item_status", [  // [S1-ST-7]
  "active", "archived", "suspended", "removed",
])

export const mediaTypeEnum = pgEnum("media_type", [  // [S1-ST-8]
  "logo", "headshot", "portfolio", "gallery", "showreel_url",
])

export const vocabularyCategoryEnum = pgEnum("vocabulary_category", [  // [S1-ST-11]
  "equipment", "software", "genre", "region", "transaction_type",
])
```

### 1.2 Listings Table

The core directory record. Maps to D&L concept design §1 entity model. Listing exists independently of Account (unclaimed records have `accountId = null`). [Source: D&L §1 D3]

```typescript
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

  // Commercial (tier managed by S4; stored here for query co-location)
  budgetTier: budgetTierEnum("budget_tier"),
  dayRate: integer("day_rate"),
  currency: text("currency").default("GBP"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("free"),

  // Lifecycle
  lifecycleStatus: lifecycleStatusEnum("lifecycle_status").notNull().default("active"),
  lastProviderLogin: timestamp("last_provider_login", { withTimezone: true }),
  mergedInto: uuid("merged_into"),
  succeededBy: uuid("succeeded_by"),

  // Search — requires custom tsvector type factory in src/db/types.ts (Drizzle has no built-in tsvector) [S1-ST-15]
  searchVector: tsvectorType("search_vector"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Indexes
// GIN index on searchVector for full-text search
// Index: (account_id) WHERE account_id IS NOT NULL
// Index: (companies_house_number) WHERE companies_house_number IS NOT NULL — for CH uniqueness check (Rule 3)
// Index: (lifecycle_status) — partial index WHERE lifecycle_status = 'active' for search queries
// Index: (slug) — unique, already covered by unique constraint
// Index: (entity_type, lifecycle_status) — for filtered queries
```

### 1.3 Verification Table

One-to-one with Listing. Verification lives on Listing, not Account — each listing represents a distinct business identity verified independently. [Source: D&L §1]

```typescript
export const verifications = pgTable("verifications", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  tier: verificationTierEnum("tier").notNull().default("unclaimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationMethods: verificationMethodEnum("verification_methods").array().default([]),
  lastVerificationCheck: timestamp("last_verification_check", { withTimezone: true }),
  verificationScore: integer("verification_score").notNull().default(0),
})
```

### 1.4 Quality Score Table

One-to-one with Listing. Entity-calculated, not provider-controlled. Scoring algorithms live in S9; S1 provides the storage schema. [Source: D&L interface spec §4 `QualityScore`]

```typescript
export const qualityScores = pgTable("quality_scores", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  completeness: integer("completeness").notNull().default(0),     // 0–25
  freshness: integer("freshness").notNull().default(0),           // 0–25
  accuracy: integer("accuracy").notNull().default(0),             // 0–20
  richness: integer("richness").notNull().default(0),             // 0–15
  verification: integer("verification").notNull().default(0),     // 0–15
  composite: integer("composite").notNull().default(0),           // 0–100
  lastCalculated: timestamp("last_calculated", { withTimezone: true }).notNull().defaultNow(),
})
```

### 1.5 Quality Score Explanation

Stored alongside QualityScore. Structured JSON — not a normalised table. [Source: D&L concept design §4b]

```typescript
export const qualityScoreExplanations = pgTable("quality_score_explanations", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  explanation: jsonb("explanation").notNull().$type<QualityScoreExplanation>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

### 1.6 Engagement Counters

One-to-one with Listing. Single source of truth for engagement data — other domains read these values. [Source: D&L interface spec §3.2]

```typescript
export const engagements = pgTable("engagements", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  profileViews: integer("profile_views").notNull().default(0),
  searchAppearances: integer("search_appearances").notNull().default(0),
  enquiriesReceived: integer("enquiries_received").notNull().default(0),
  enquiryResponseRate: real("enquiry_response_rate"),                   // null for unclaimed
  enquiryResponseTime: real("enquiry_response_time"),                   // minutes, null for unclaimed
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

### 1.7 Taxonomy Tags

Many-to-many between Listing and taxonomy hierarchy. Tags stored as junction table rows, not JSON array — enables search filtering and overlap computation. [Source: D&L interface spec §4 `TaxonomyTag`]

```typescript
export const taxonomySectors = pgTable("taxonomy_sectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const taxonomyServiceAreas = pgTable("taxonomy_service_areas", {
  id: serial("id").primaryKey(),
  sectorId: integer("sector_id").notNull().references(() => taxonomySectors.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Unique: (sector_id, slug)

export const taxonomySpecialisations = pgTable("taxonomy_specialisations", {
  id: serial("id").primaryKey(),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Unique: (service_area_id, slug)

export const listingTaxonomyTags = pgTable("listing_taxonomy_tags", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  sectorId: integer("sector_id").notNull().references(() => taxonomySectors.id),
  serviceAreaId: integer("service_area_id").notNull().references(() => taxonomyServiceAreas.id),
  specialisationId: integer("specialisation_id").references(() => taxonomySpecialisations.id),  // optional — Level 3 is optional
})
// Index: (listing_id)
// Index: (sector_id, service_area_id)
// Unique: (listing_id, sector_id, service_area_id, specialisation_id) — prevents duplicate tags WHERE specialisation_id IS NOT NULL
// Partial unique: (listing_id, sector_id, service_area_id) WHERE specialisation_id IS NULL — PostgreSQL NULL != NULL in unique constraints [S1-ST-16]
```

### 1.8 Credits

Provider-claimed professional credits. [Source: D&L concept design §1 `Credit`]

```typescript
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
```

### 1.9 Media Items

Listing portfolio media — images, showreel URLs. [Source: D&L concept design §1 `MediaItem`]

```typescript
export const mediaItems = pgTable("media_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),         // aligned with upload input types [S1-ST-8]
  url: text("url").notNull(),                    // R2 public URL for images, external URL for showreels
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id, sort_order)
```

### 1.10 Social Profiles

```typescript
export const socialProfiles = pgTable("social_profiles", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),         // "imdb" | "linkedin" | "instagram" | "vimeo" | "website" — text not pgEnum: extensible value set, validated at application layer via Zod [S1-ST-9]
  url: text("url").notNull(),
})
// Index: (listing_id)
```

### 1.11 Accreditations

```typescript
export const accreditations = pgTable("accreditations", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  body: text("body").notNull(),                 // trade body or certification body name
  membershipType: text("membership_type"),       // e.g., "Full Member", "Associate"
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
})
// Index: (listing_id)
```

### 1.12 Pending Enquiries (Unclaimed Listings)

Queue for enquiries to unclaimed listings. Max 90 days, delivered on claim. [Source: D&L concept design §4 "Enquiries to Unclaimed Listings"]

**`enquiryId` is PP's ID, not D&L's [S1-ST-3]:** `pending_enquiries.enquiryId` stores PP's `EnquirySubmittedEvent.enquiryId` — a cross-domain reference, not D&L's `enquiry_records.id`. D&L queues the reference; PP owns the full enquiry content. On claim approval, D&L reads `pending_enquiries` for the listing and invokes PP's `deliverPendingEnquiries(listingId, enquiryIds)` callback to trigger forwarding. The callback is defined by PP — S1 consumes it; PP implements it in S3 or S6. See S1-10 downstream flag.

```typescript
export const pendingEnquiries = pgTable("pending_enquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  enquiryId: uuid("enquiry_id").notNull(),      // PP's enquiry ID from EnquirySubmittedEvent, not D&L's enquiry_records.id [S1-ST-3]
  forwardedAt: timestamp("forwarded_at", { withTimezone: true }),  // null if no email available
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (listing_id)
// Partial index: WHERE expires_at > now() for active enquiries
```

### 1.13 Pre-Claim Snapshots

Frozen listing state at moment of claim. Retained 90 days. Deleted via deferred action. [Source: D&L concept design §4 stress test #31]

```typescript
export const preClaimSnapshots = pgTable("pre_claim_snapshots", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),         // serialised Listing state at claim time
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

### 1.14 Additional Locations

```typescript
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
```

### 1.15 Zero-Result Query Log [S1-ST-6]

Storage for the `search_performed` consumer's zero-result tracking. Feeds quarterly Taxonomy Review ceremony. [Source: D&L concept design §5 Layer 4]

```typescript
export const zeroResultQueries = pgTable("zero_result_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  filters: jsonb("filters").$type<SearchFilters>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (created_at DESC)
```

---

## 2. Schema: Account Extensions

Better Auth manages the core `user` table (S0 §5). S1 adds CALLSHEET-specific account data. `accountId` throughout CALLSHEET = Better Auth `user.id`. [Source: S0 §5, S0-8]

### 2.1 Account Profiles

CALLSHEET-specific account data beyond what Better Auth stores. One-to-one with Better Auth user.

```typescript
export const accountProfiles = pgTable("account_profiles", {
  accountId: uuid("account_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  emailPreferences: jsonb("email_preferences").notNull().$type<EmailPreferences>().default({
    enquiry_notification: true,
    listing_status: true,
    profile_nudge: true,
    conversion_marketing: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

**Email preferences implementation note:** S0 defines the `EmailPreferences` type and the preference enforcement mechanism in `ResendEmailService.send()`. S0 integration tests use an in-memory preference store. S1's `account_profiles.emailPreferences` column is the production storage. `ResendEmailService` in production reads from this column via the service abstraction layer. [Source: S0 §6.3, S0-10]

### 2.2 Buyer Facet Tables

Buyer facet is always active for every account. [Source: D&L concept design §1]

```typescript
export const shortlists = pgTable("shortlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My Shortlist"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)

export const shortlistItems = pgTable("shortlist_items", {
  id: serial("id").primaryKey(),
  shortlistId: uuid("shortlist_id").notNull().references(() => shortlists.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  status: shortlistItemStatusEnum("status").notNull().default("active"),  // [S1-ST-7]
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
})
// Unique: (shortlist_id, listing_id)
// Index: (listing_id) — for shortlist updates on listing state changes

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query"),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (account_id)

export const enquiryRecords = pgTable("enquiry_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderAccountId: uuid("sender_account_id").references(() => users.id, { onDelete: "set null" }),
  senderEmail: text("sender_email"),             // for anonymous enquiries (no account)
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  subject: text("subject"),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  responseTimeMinutes: integer("response_time_minutes"),
})
// Index: (sender_account_id) WHERE sender_account_id IS NOT NULL
// Index: (listing_id, sent_at DESC)
// Index: (sender_email) WHERE sender_email IS NOT NULL AND sender_account_id IS NULL — for retroactive linking [XP-10]
```

**S5 schema extension [S5-ST-14]:** S5 adds `status: enquiryStatusEnum("status").notNull().default("unread")` column to `enquiry_records` for three-state enquiry lifecycle tracking (`unread`, `responded`, `stale`). See S5 §16.3.

**Retroactive linking [S1-ST-20]:** When an anonymous enquirer later creates an account with the same email, the signup handler (S2 Onboarding) queries `enquiry_records` by `sender_email` and updates `sender_account_id` to the new account ID. The partial index supports this lookup.

---

## 3. Full-Text Search

### 3.1 Search Vector Composition

PostgreSQL `tsvector` on Listing, combining weighted fields. `pg_trgm` extension for fuzzy matching on listing name.

```sql
-- Migration: add tsvector and trgm support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigger function to maintain search vector
CREATE OR REPLACE FUNCTION update_listing_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.headline, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.base_region, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listing_search_vector_update
  BEFORE INSERT OR UPDATE OF name, headline, bio, base_region
  ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_search_vector();

-- GIN index for tsvector search
CREATE INDEX idx_listings_search_vector ON listings USING GIN (search_vector);

-- GiST trigram index for fuzzy name matching (duplicate detection, name search)
CREATE INDEX idx_listings_name_trgm ON listings USING GIST (name gist_trgm_ops);
```

### 3.2 Search Ranking Formula

Base ranking uses `ts_rank_cd` combined with quality score and paid boost. Platform's search handler (S6) applies this formula.

```typescript
function buildSearchQuery(query: string, filters: SearchFilters): SQL {
  // ts_rank_cd(search_vector, plainto_tsquery('english', query)) * (1 + quality_boost + paid_boost)
  // quality_boost = quality_scores.composite / 100 * 0.5  (max 0.5 boost)
  // paid_boost = TIER_LIMITS[listing.subscriptionTier].rankingBoost / 100  (0 / 0.15 / 0.25 / 0.25) — imported from CR §4.1 (P4) [S1-ST-13]
  // Filtering by taxonomy tags, location, entity type applied as WHERE clauses via joins
}
```

Contract: `shared-infrastructure.md` §7.1 (SSR for search). Ranking weights are entity perception signals — S9 calibrates them. S1 provides the mechanism.

### 3.3 Synonym/Alias Lookup Table

Query-time expansion for search. [Source: D&L concept design §5 Layer 5 assets]

```typescript
export const searchSynonyms = pgTable("search_synonyms", {
  id: serial("id").primaryKey(),
  term: text("term").notNull(),
  synonym: text("synonym").notNull(),
  weight: real("weight").notNull().default(1.0),  // relevance weight for synonym expansion
})
// Index: (term)
```

Search handler expands query terms against synonyms before executing the `tsvector` query. Synonyms are curated during quarterly Taxonomy Review ceremony.

---

## 4. CRUD: tRPC Routes

### 4.1 Module Layout

```
src/server/routers/
├── listing.ts          ← Listing CRUD + search
├── profile.ts          ← Account profile management
├── taxonomy.ts         ← Read-only taxonomy queries
├── media.ts            ← Image upload/delete
└── engagement.ts       ← Engagement counter reads (query interface for D&L §3.2)
```

### 4.2 Listing Routes

```typescript
// listing.ts
export const listingRouter = router({
  // Public
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(/* listing + verification + qualityScore + taxonomyTags + credits + media */),

  search: publicProcedure
    .input(z.object({
      query: z.string().optional(),
      filters: searchFiltersSchema,
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(/* full-text search with ranking, emits search_performed event */),

  // Protected (listing owner)
  create: protectedProcedure
    .input(listingCreateSchema)
    .mutation(/* integrity checks → create → emit listing_created */),

  update: protectedProcedure
    .input(listingUpdateSchema)
    .mutation(/* ownership check → update → trigger search vector update → emit profile_edited */),

  archive: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(/* [S1-ST-2, S1-ST-19]
      Pre-conditions: verify ownership, verify lifecycleStatus is "active" or "inactive" (cannot archive already-archived).
      Post-conditions: set lifecycleStatus = "archived", emit listing_archived.
      pending_cancellation_created emission deferred to S4 — requires paddleSubscriptionId from subscription data. See S1-9. */),

  reactivate: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(/* [S1-ST-19]
      Pre-conditions: verify ownership, verify lifecycleStatus === "archived".
      Guard: if listing was admin-suspended (listing_suspended event, not voluntary archive), reject with FORBIDDEN.
      Provider cannot self-reactivate admin-suspended listings — requires admin action. See AC-42.
      Post-conditions: set lifecycleStatus = "active", emit listing_reactivated. */),

  // Admin
  listAll: adminProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), filters: adminFiltersSchema.optional() }))
    .query(/* paginated listing list for admin */),
})
```

### 4.3 Profile Routes

```typescript
// profile.ts
export const profileRouter = router({
  get: protectedProcedure.query(/* account profile + email preferences */),

  update: protectedProcedure
    .input(profileUpdateSchema)
    .mutation(/* update fullName, email preferences */),

  updateEmailPreferences: protectedProcedure
    .input(emailPreferencesSchema)
    .mutation(/* update email preferences only */),
})
```

### 4.4 Taxonomy Routes

```typescript
// taxonomy.ts — read-only, public
export const taxonomyRouter = router({
  getSectors: publicProcedure.query(/* all sectors with service area counts */),

  getServiceAreas: publicProcedure
    .input(z.object({ sectorSlug: z.string() }))
    .query(/* service areas for sector, with specialisation counts */),

  getSpecialisations: publicProcedure
    .input(z.object({ serviceAreaId: z.number().int() }))
    .query(/* specialisations for service area */),

  search: publicProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(/* fuzzy search across all taxonomy levels */),
})
```

### 4.5 Engagement Counter Query Interface

Implements D&L interface spec §3.2. This is the cross-domain query interface consumed by PP and CR.

```typescript
// engagement.ts
export const engagementRouter = router({
  getCounters: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(/* returns EngagementCounters from engagements table */),
})
```

**NFR:** <50ms p95. [Source: D&L interface spec §5]

---

## 5. Image Upload Pipeline

Images uploaded to R2 via S0's `ObjectStorageService`. S1 provides the listing-specific upload logic.

### 5.1 Upload Flow

```typescript
// media.ts
export const mediaRouter = router({
  uploadImage: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      type: z.enum(["logo", "headshot", "portfolio", "gallery"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify listing ownership
      // 2. Check tier media limit: TIER_LIMITS[listing.subscriptionTier].maxMedia
      // 3. Upload to R2: key = `listings/${listingId}/images/${imageId}.${ext}`
      //    access = "public", maxSizeBytes = 10MB, contentType in ["image/jpeg", "image/png", "image/webp"]
      // 4. Create mediaItems row
      // 5. If type is "logo" or "headshot", update listing.logoUrl or listing.headshotUrl
      // 6. Return public URL
    }),

  deleteImage: protectedProcedure
    .input(z.object({ mediaItemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify listing ownership
      // 2. Delete from R2
      // 3. Delete mediaItems row
      // 4. If was logo/headshot, null out listing field
    }),

  reorderImages: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      mediaItemIds: z.array(z.string().uuid()),
    }))
    .mutation(/* update sortOrder for all items */),
})
```

**Tier limit enforcement:** `TIER_LIMITS` imported from Commercial (P4). S1 counts existing media items and rejects upload if limit reached.

---

## 6. Listing Integrity Rules

Three entity-enforced rules at listing creation and claim. [Source: D&L concept design §4 "Listing Integrity Rules"]

### 6.1 Module Layout

```
src/domains/data-and-listings/
├── integrity/
│   ├── duplicate-detection.ts      ← Rule 1: >80% taxonomy overlap
│   ├── identity-verification.ts    ← Rule 2: CH director check + name similarity
│   ├── ch-uniqueness.ts            ← Rule 3: CH number uniqueness
│   └── index.ts                    ← runIntegrityChecks() — sequential pipeline
├── taxonomy/
│   ├── overlap.ts                  ← computeTaxonomyOverlap (D&L interface §3.1)
│   └── index.ts
└── index.ts
```

### 6.2 Pipeline

```typescript
async function runIntegrityChecks(
  listing: NewListingInput,
  accountId: UUID,
  services: Services,
): Promise<IntegrityResult> {
  // Sequential — fail fast on first flag
  const dupeResult = await checkDuplicate(listing, accountId)
  if (dupeResult.action !== "allow") return dupeResult

  const identityResult = await verifyNewListingIdentity(listing, accountId, services.companiesHouse)
  if (identityResult.action !== "allow" && identityResult.action !== "allow_with_warning")
    return identityResult

  const chResult = await checkCHUniqueness(listing)
  if (chResult.action !== "allow") return chResult

  return { action: "allow", warnings: identityResult.action === "allow_with_warning" ? identityResult.reasons : [] }
}

type IntegrityResult =
  | { action: "allow"; warnings?: string[] }
  | { action: "flag_for_review"; reasons: string[]; taskSpec?: TaskSpec }
  | { action: "reject"; reasons: string[] }
  | { action: "flag_duplicate"; reasons: string[]; existingListing: UUID }
  | { action: "flag_co_director"; reasons: string[]; existingListing: UUID; existingAccount: UUID | null }
```

### 6.3 computeTaxonomyOverlap

Cross-domain query interface. Jaccard similarity at Service Area level. [Source: D&L interface spec §3.1]

```typescript
function computeTaxonomyOverlap(tagsA: TaxonomyTag[], tagsB: TaxonomyTag[]): number {
  const setA = new Set(tagsA.map(t => `${t.sector}:${t.serviceArea}`))
  const setB = new Set(tagsB.map(t => `${t.sector}:${t.serviceArea}`))
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  return intersection.size / union.size
}
```

**NFR:** <50ms p95. [Source: D&L interface spec §5]

---

## 7. JSON-LD Structured Data

Downstream flag from S0: `S0-14`. Listing profiles carry JSON-LD `LocalBusiness` (companies) or `Person` (freelancers). [Source: S0 §8.3, shared-infrastructure §7.3]

```typescript
function generateListingJsonLd(listing: ListingWithRelations): JsonLd {
  if (listing.entityType === "freelancer") {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      name: listing.name,
      jobTitle: listing.headline,
      description: listing.bio,
      url: `${BASE_URL}/listing/${listing.slug}`,
      image: listing.headshotUrl || listing.logoUrl,
      address: listing.baseRegion ? {
        "@type": "PostalAddress",
        addressRegion: listing.baseRegion,
        addressCountry: "GB",
      } : undefined,
      sameAs: listing.socialProfiles?.map(sp => sp.url),
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    description: listing.bio,
    url: `${BASE_URL}/listing/${listing.slug}`,
    image: listing.logoUrl,
    address: listing.baseRegion ? {
      "@type": "PostalAddress",
      addressRegion: listing.baseRegion,
      addressCountry: "GB",
    } : undefined,
    foundingDate: listing.foundedYear?.toString(),
    sameAs: listing.socialProfiles?.map(sp => sp.url),
  }
}
```

No `aggregateRating` at V1 (no reviews). Sitemap at `/sitemap.xml` includes all active listing profiles + sector/location landings.

---

## 8. Taxonomy Seed Data

The 3-level taxonomy (7 sectors, ~51 service areas, ~209 specialisations) must be seeded before any listing data. [Source: D&L concept design §2]

```
src/db/seed/
├── taxonomy.ts         ← Seed script: inserts sectors, service areas, specialisations
└── taxonomy-data.json  ← Canonical taxonomy hierarchy (machine-readable)
```

**Seed ordering:** taxonomy first → then 4rfv listing import (S2). Taxonomy IDs are stable — seed uses `ON CONFLICT DO NOTHING` for idempotent re-runs.

---

## 9. Controlled Vocabularies

Equipment, software, genres, and regions stored as reference tables. Autocomplete and filter support for S5/S6.

```typescript
export const controlledVocabulary = pgTable("controlled_vocabulary", {
  id: serial("id").primaryKey(),
  category: vocabularyCategoryEnum("category").notNull(),  // [S1-ST-11]
  value: text("value").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})
// Unique: (category, value)
// Index: (category)
```

---

## 10. Event Consumers Registered in S1

S1 registers D&L's event consumers for events that affect data model state. Consumer handlers live in the D&L domain module.

**Two-phase listing creation [S1-ST-10]:** `listing.create` mutation creates the listing + zero-initialised one-to-one rows (verification, quality_scores, quality_score_explanations, engagements) in a single transaction, then emits `listing_created`. The async `listing_created` consumer computes the real quality score, overwriting the zero-initialised row. If the consumer fails, the listing remains at composite = 0 — a valid initial state. The listing is searchable but ranked lowest. Self-heals on next `profile_edited` event.

| Event | Consumer ID | Mode | Handler |
|---|---|---|---|
| `listing_created` | `data-and-listings:listing_created:initialQualityScore` | Async | Compute initial quality score, emit `quality_score_changed` |
| `profile_edited` | `data-and-listings:profile_edited:qualityScoreRecalc` | Async | Recalculate quality score, emit `quality_score_changed`. **PP consumer extended by S5 §9.2 with 90-day listing update reminder scheduling.** [S5-ST-12] |
| `search_performed` | `data-and-listings:search_performed:zeroResultTracking` | Async | Log zero-result queries for taxonomy review |
| `profile_viewed` | `data-and-listings:profile_viewed:engagementIncrement` | Async | Increment `profileViews` counter |
| `enquiry_submitted` | `data-and-listings:enquiry_submitted:engagementIncrement` | Async | Increment `enquiriesReceived`, queue `enquiryId` if unclaimed |
| `enquiry_responded` | `data-and-listings:enquiry_responded:responseMetrics` | Async | Update response rate and time |
| `contact_attempt` | `data-and-listings:contact_attempt:dataQualityFlag` | Async | Flag unreachable listing (`result === "unreachable"`) |
| `subscription_tier_changed` | `data-and-listings:subscription_tier_changed:tierUpdate` | Async | Update `listing.subscriptionTier`, recalculate enrichment cadence |
| `account_closed` | `data-and-listings:account_closed:suspendEnrichment` | Async | No-op at S1 — enrichment suspension requires S9. Registered for `EVENT_CONSUMER_MATRIX` completeness. [S1-ST-14] |

**9 consumers, all async.** [Source: D&L interface spec §2]

**`profile_viewed` idempotency [S1-ST-5]:** V1 accepts approximate counting for `profile_viewed`. Duplicate delivery of the same event instance may increment the counter twice. At V1 scale (~50–200 events/day), the error margin is negligible. S9 (Entity Intelligence) introduces calibrated deduplication. See S1-8 downstream flag.

S1 also updates `EVENT_CONSUMER_MATRIX` (S0 §2.3) to include these registrations.

---

## 11. Open Question Resolutions

### D&L-Q1: Drizzle Schema Patterns

**Resolved.** Listing + Account use separate tables with FK (`listings.account_id → users.id`). No polymorphic pattern. One-to-one related data (verification, quality score, engagement) uses separate tables with `listing_id` as PK + FK — avoids wide rows and allows independent lifecycle management. Many-to-many (taxonomy tags) uses junction table. JSONB used for: `preClaimSnapshots.snapshot` (opaque blob), `qualityScoreExplanations.explanation` (structured but not queried independently), `accountProfiles.emailPreferences` (small, read as whole), `savedSearches.filters` (variable structure).

### PP-Q1: Component Library (partial)

S1 does not resolve PP-Q1 fully (that's an S2/frontend concern). However, S1 establishes the convention that all schema and domain logic is in `src/db/schema/` and `src/domains/`, separate from presentation.

---

## 12. Acceptance Criteria

### Schema (10)

| # | Criterion | Test |
|---|---|---|
| AC-01 | Listing created with all required fields; `claimStatus` defaults to `"unclaimed"`, `subscriptionTier` to `"free"` | Integration |
| AC-02 | Listing with `accountId = null` (unclaimed) persists and queries correctly | Integration |
| AC-03 | Verification table created with listing; defaults to `tier = "unclaimed"`, `verificationScore = 0` | Integration |
| AC-04 | Quality score table created with listing; all dimensions default to 0, composite = 0 | Integration |
| AC-05 | Engagement counters table created with listing; all counters default to 0 | Integration |
| AC-06 | Account profile created on signup; email preferences default to all-true | Integration |
| AC-07 | Taxonomy hierarchy seed: 7 sectors, ~51 service areas, ~209 specialisations | Integration |
| AC-08 | Taxonomy seed is idempotent (`ON CONFLICT DO NOTHING`) | Integration |
| AC-09 | `listings.companiesHouseNumber` index supports < 10ms lookup | Integration |
| AC-10 | Cascade delete: listing deletion cascades to verification, quality score, engagement, taxonomy tags, credits, media, social profiles, accreditations, pending enquiries, pre-claim snapshot | Integration |

### Search (5)

| # | Criterion | Test |
|---|---|---|
| AC-11 | Search vector auto-updates on name/headline/bio/region change (trigger) | Integration |
| AC-12 | Full-text search returns results ranked by `ts_rank_cd` * quality/paid boost | Integration |
| AC-13 | Trigram index: `similarity(name, query) > 0.3` returns fuzzy matches | Integration |
| AC-14 | Taxonomy tag filtering: search with sector/serviceArea filter returns only matching listings | Integration |
| AC-15 | Empty search query returns all active listings sorted by composite quality score | Integration |

### CRUD (7)

| # | Criterion | Test |
|---|---|---|
| AC-16 | `listing.create` runs integrity checks; `flag_for_review` blocks creation and returns reason | Integration |
| AC-17 | `listing.update` verifies ownership; non-owner gets `FORBIDDEN` | Integration |
| AC-18 | `listing.update` triggers search vector update and emits `profile_edited` event | Integration |
| AC-19 | `listing.archive` sets `lifecycleStatus = "archived"`, emits `listing_archived` | Integration |
| AC-20 | `listing.reactivate` sets `lifecycleStatus = "active"`, emits `listing_reactivated` | Integration |
| AC-21 | `profile.updateEmailPreferences` persists; email service reads updated preferences | Integration |
| AC-22 | `taxonomy.search` returns matches across all 3 levels with relevance ordering | Integration |

### Image Pipeline (4)

| # | Criterion | Test |
|---|---|---|
| AC-23 | Image upload: verifies ownership, checks tier limit, uploads to R2, returns public URL | Integration |
| AC-24 | Image upload: rejects >10MB, rejects non-JPEG/PNG/WebP | Unit |
| AC-25 | Image delete: removes from R2 and mediaItems table | Integration |
| AC-26 | Logo/headshot upload updates listing field (`logoUrl` / `headshotUrl`) | Integration |

### Integrity Rules (5)

| # | Criterion | Test |
|---|---|---|
| AC-27 | Rule 1: Listing with >80% taxonomy overlap to same-account listing flagged | Integration |
| AC-28 | Rule 2: Listing with CH number not matching account holder flagged | Integration |
| AC-29 | Rule 3: Listing with CH number already used by different account flagged | Integration |
| AC-30 | Rule 2: Listing with dissolved CH number rejected | Integration |
| AC-31 | Integrity pipeline short-circuits on first non-allow result | Unit |

### JSON-LD (2)

| # | Criterion | Test |
|---|---|---|
| AC-32 | Freelancer listing generates valid `Person` JSON-LD | Unit |
| AC-33 | Company listing generates valid `LocalBusiness` JSON-LD | Unit |

### Event Consumers (5)

| # | Criterion | Test |
|---|---|---|
| AC-34 | `profile_viewed` increments `engagement.profileViews` by 1 | Integration |
| AC-35 | `enquiry_submitted` increments `engagement.enquiriesReceived`; if unclaimed, adds `pendingEnquiry` | Integration |
| AC-36 | `subscription_tier_changed` updates `listing.subscriptionTier` to `event.newTier` | Integration |
| AC-37 | `account_closed` consumer registered and executes without error (no-op at S1; enrichment suspension added in S9) [S1-ST-14] | Integration |
| AC-38 | `profile_viewed` event increments counter; V1 accepts approximate counting (no deduplication). Two distinct `profile_viewed` events for same listing produce +2. [S1-ST-5] | Integration |

### Query Interfaces (2)

| # | Criterion | Test |
|---|---|---|
| AC-39 | `getEngagementCounters` returns correct counters for listing, <50ms | Integration |
| AC-40 | `computeTaxonomyOverlap` returns 1.0 for identical tag sets, 0.0 for disjoint, correct Jaccard for partial | Unit |

### Zero-Result Tracking (1) [S1-ST-6]

| # | Criterion | Test |
|---|---|---|
| AC-41 | `search_performed` with `resultCount === 0` creates `zero_result_queries` entry queryable by date range | Integration |

### Route Pre-Conditions (1) [S1-ST-19]

| # | Criterion | Test |
|---|---|---|
| AC-42 | `listing.reactivate` on an admin-suspended listing returns `FORBIDDEN` | Integration |

---

## 13. Downstream Flags

| # | Flag | Target Slice | Source |
|---|---|---|---|
| S1-1 | Claim evaluation logic (evaluateClaim, competing claims, manual review routing) deferred to S3 | S3 | Scope boundary |
| S1-2 | Quality scoring algorithms (computeQualityScore, scoreFreshness, etc.) deferred to S9. S1 provides zero-initialised storage. | S9 | Scope boundary |
| S1-3 | Batch import integrity mode (4rfv import) deferred to S2. S1's integrity rules apply to incremental creation only. | S2 | D&L concept design §4 |
| S1-4 | `listing.engagement.searchTerms` (aggregated term frequencies) and `listing.engagement.trendData` deferred — requires sufficient usage data. Schema extensible via migration. | S5/S9 | D&L concept design §1 |
| S1-5 | `listing.engagement.profileViewers` (gated by tier) deferred to S5. | S5 | D&L concept design §1 |
| S1-6 | Buyer facet `searchHistory` table deferred to S6 — requires search UI. 12-month retention policy per Ops §5. | S6 | D&L concept design §1 |
| S1-7 | Cross-role reputation scoring deferred — post-V1, requires usage data. [D&L-Q4] | Post-V1 | D&L concept design §8 |
| S1-8 | `profile_viewed` P2 deduplication deferred to S9. V1 accepts approximate counting — duplicate delivery may double-increment. S9 introduces calibrated deduplication (event ID set or time-window check). [S1-ST-5] | S9 | P2 enforcement |
| S1-9 | `listing.archive` `pending_cancellation_created` emission requires `paddleSubscriptionId` from S4 subscription data. S1 implements archival and `listing_archived` emission only. Cancellation emission deferred to S4. [S1-ST-2] | S4 | D&L §1.10 |
| S1-10 | Pending enquiry delivery on claim approval requires PP's `deliverPendingEnquiries(listingId, enquiryIds)` callback. D&L reads `pending_enquiries`, invokes PP callback. PP implements the callback in S3 or S6. [S1-ST-3] | S3/S6 | PP §1.3 |
| S1-11 | `account_closed` D&L consumer is no-op at S1 — enrichment suspension requires S9 enrichment scheduling. Consumer registered for `EVENT_CONSUMER_MATRIX` completeness. [S1-ST-14] | S9 | D&L interface §2 |

---

## 15. Stress Test Resolution Log (v2)

20 scenarios targeting S1 implementation delta against upstream interface specs and S0 v2. 3 High, 8 Medium, 5 Low, 4 Pass. 16 fixes applied. 40→42 acceptance criteria. 8→11 downstream flags.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| S1-ST-1 | `listing_created` emitter mismatch — S1 `listing.create` emits PP-owned event. tRPC routes are PP surface, not D&L. | **Medium** | Fixed. Event emission ownership documented in Summary. tRPC routes are Platform surface; D&L provides schema/logic; Platform emits. |
| S1-ST-2 | `listing.archive` emits `pending_cancellation_created` but listing schema has no `paddleSubscriptionId`. S4 dependency. | **Medium** | Fixed. S1-9 downstream flag added. S1 emits `listing_archived` only. Cancellation emission deferred to S4. §4.2 archive pre-conditions documented. |
| S1-ST-3 | `pending_enquiries.enquiryId` relationship to PP's enquiry ID vs D&L's `enquiry_records.id` undocumented. Delivery mechanism on claim approval missing. | **High** | Fixed. §1.12 note clarifies `enquiryId` is PP's ID. Delivery callback documented. S1-10 downstream flag added. |
| S1-ST-4 | `enquiry_records` table ownership ambiguity — D&L or PP? | Pass | D&L owns buyer engagement data and pending enquiry queue. PP owns live enquiry workflow. Distinct concerns. |
| S1-ST-5 | AC-38 P2 idempotency contradictory — conflates duplicate delivery with distinct events | **High** | Fixed. AC-38 rewritten: V1 accepts approximate counting. S1-8 downstream flag updated to defer deduplication to S9. §10 note added. |
| S1-ST-6 | `search_performed` consumer logs zero-result queries but no storage table defined | **Medium** | Fixed. §1.15 `zero_result_queries` table added. AC-41 added. |
| S1-ST-7 | `shortlistItems.status` free string where pgEnum pattern required | **Low** | Fixed. `shortlistItemStatusEnum` extracted. §1.1, §2.2 updated. |
| S1-ST-8 | `mediaItems.type` free string, misaligned with upload input types (`"image"` vs `"logo"`/`"headshot"`) | **Medium** | Fixed. `mediaTypeEnum` extracted with purpose-based values matching upload input. §1.1, §1.9 updated. |
| S1-ST-9 | `socialProfiles.platform` free string | **Low** | Keep as text — extensible value set. Rationale note added to §1.10. Validated at application layer via Zod. |
| S1-ST-10 | Two-phase listing creation pattern (mutation creates zero rows, consumer computes) undocumented. Consumer failure recovery unclear. | **Medium** | Fixed. §10 note added: zero quality score is valid initial state. Self-heals on next `profile_edited`. |
| S1-ST-11 | `controlled_vocabulary.category` free string — closed value set | **Low** | Fixed. `vocabularyCategoryEnum` extracted. §1.1, §9 updated. |
| S1-ST-12 | Cascade delete coverage check | Pass | All FK references correctly cascade. `additionalLocations` included. `enquiry_records` uses `set null` for account (correct). |
| S1-ST-13 | Search ranking `paid_boost` references `tier_ranking_boost` as if stored column. Actually derived from CR `TIER_LIMITS`. Import undocumented. | **Medium** | Fixed. §3.2 formula updated with `TIER_LIMITS` import note. Cross-references updated. |
| S1-ST-14 | `account_closed` consumer "suspend enrichment" — enrichment doesn't exist until S9. AC-37 tests wrong thing (listings already archived by closure step 1). | **High** | Fixed. Consumer action updated to no-op at S1. AC-37 rewritten. S1-11 downstream flag added. |
| S1-ST-15 | `searchVector` custom type definition incomplete — Drizzle has no built-in `tsvector` | **Low** | Fixed. Note added to §1.2: requires custom type factory in `src/db/types.ts`. |
| S1-ST-16 | `listing_taxonomy_tags` unique constraint on nullable `specialisationId` — PostgreSQL `NULL != NULL` allows duplicate Level 2 tags | **Medium** | Fixed. Partial unique index added for `WHERE specialisation_id IS NULL`. §1.7 updated. |
| S1-ST-17 | Response rate/time computation logic unspecified | Pass | Implementation detail within handler. S1 provides storage and consumer registration. |
| S1-ST-18 | Account profile `onDelete: "cascade"` correctness | Pass | Correct. Auth user deletion cascades to profile. |
| S1-ST-19 | `listing.archive` and `listing.reactivate` missing pre-condition documentation. Admin-suspended listings reactivatable by provider. | **Medium** | Fixed. §4.2 pre-conditions documented for both routes. AC-42 added: admin-suspended listing reactivation returns `FORBIDDEN`. |
| S1-ST-20 | Anonymous enquiry retroactive linking mechanism undocumented. Index exists but linking flow absent. | **Low** | Fixed. Note added to §2.2: linking happens in S2 Onboarding. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `interfaces/data-and-listings.md` (v3) | 9 emitted events (S1 registers emitters), 9 consumed events (S1 registers consumers), 2 query interfaces (S1 implements), shared types (S1 schema encodes) |
| `interfaces/shared-infrastructure.md` (v3) | Event bus (§1 — S1 registers consumers), R2 storage (§6 — image pipeline), email preferences (§5 — S1 provides production storage) |
| `interfaces/commercial-and-revenue.md` (v2) | `TIER_LIMITS` (imported for media upload limits + search ranking boost [S1-ST-13]), `computeFeatureAccess` (not directly used in S1) |
| `interfaces/operations.md` (v3) | `hasActiveTicket` query (consumed by S1 integrity/decay — deferred to S9), `TaskSpec` type (S1 returns for integrity flags) |
| `2-concept-design/data-and-listings.md` (v6) | Entity model (§1), taxonomy (§2), quality score (§3), verification (§4), integrity rules (§4), enquiry handling (§4), GDPR erasure (§6) |
| `slices/slice-00-infrastructure.md` (v2) | Database connection (§1), event bus (§2), R2 (§7), auth (§5 — `users.id` = `accountId`), service abstraction (§11), tRPC (§12), email preferences structure (§6.3) |
