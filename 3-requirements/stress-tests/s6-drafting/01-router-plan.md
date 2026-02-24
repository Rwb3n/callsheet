# S6 Router Plan — Buyer Experience

**Generated:** 2026-02-14
**Slice:** `slices/slice-06-buyer-experience.md`
**Skeleton sections covered:** §1 Search, §2 Listing Profile, §3 Enquiry, §4 Shortlist, §5 Saved Searches & History, §6 Buyer Dashboard, §7 Contact Attempt, §8 Cross-Role Nudge, §9 Feature Gating

---

## 1. File Tree

```
src/app/
├── search/
│   └── page.tsx                          # SSR — query-dependent search results
├── providers/
│   └── [slug]/
│       └── page.tsx                      # SSG+ISR — listing profile (15-min revalidate)
├── dashboard/
│   ├── layout.tsx                        # auth guard (existing from S5)
│   ├── enquiries-sent/
│   │   └── page.tsx                      # CSR — buyer's sent enquiries
│   ├── shortlists/
│   │   └── page.tsx                      # CSR — shortlist management
│   └── searches/
│       └── page.tsx                      # CSR — saved searches + search history

src/server/routers/
├── search.ts                             # Search + autocomplete + save
├── shortlist.ts                          # Shortlist CRUD + item management
├── enquiry.ts                            # Enquiry submission (amends S1 listing.search)
├── searchHistory.ts                      # Search history list + clear
└── listing.ts                            # Extended: reportContactAttempt (amends S1)
```

**Notes on file tree:**
- `/search/page.tsx` is a new public page. S1 defines `listing.search` tRPC route; S6 extracts search into a dedicated router with richer capabilities (autocomplete, facets, save).
- `/providers/[slug]/page.tsx` is a new public page consuming S1's `listing.getBySlug` data with SSG+ISR rendering. [Source: SI §7.1, PP concept design §3]
- Dashboard pages nest under S5's existing `/dashboard/layout.tsx` auth guard. No new layout needed — buyer dashboard pages inherit the same session check. Buyer sections do not require provider listing ownership (unlike `/dashboard/listings/[listingId]/*` which uses `providerProcedure`).
- `enquiry.ts` is a new router. S1 defines `enquiry_records` schema; S6 adds submission and buyer-side read routes.
- `listing.ts` is amended — `reportContactAttempt` added as a new route on the existing listing router.

---

## 2. tRPC Router Inventory

### 2.1 search router (`src/server/routers/search.ts`)

S6 introduces a dedicated search router. S1's `listing.search` route remains for backward compatibility but S6's `search.query` is the canonical buyer-facing search endpoint with full ranking, facets, sponsored section, and event emission.

| Route | Access | Input | Return | Rendering | Description |
|-------|--------|-------|--------|-----------|-------------|
| `search.query` | `publicProcedure` | `SearchQueryInput` | `SearchResultOutput` | SSR | Execute full-text search with ranking, facets, sponsored section. Emits `search_performed`. |
| `search.suggest` | `publicProcedure` | `{ prefix: string }` | `string[]` | CSR | Autocomplete from taxonomy terms + synonym table. Debounced client-side. |
| `search.saveSearch` | `protectedProcedure` | `{ name: string, query?: string, filters?: SearchFilters }` | `SavedSearch` | CSR | Persist search to `saved_searches` table (S1 §2.2). |
| `search.getSavedSearches` | `protectedProcedure` | `{ limit?: number }` | `SavedSearch[]` | CSR | List saved searches for current account. Default limit 10. |
| `search.deleteSavedSearch` | `protectedProcedure` | `{ savedSearchId: uuid }` | `void` | CSR | Delete a saved search. Ownership check: `savedSearch.accountId === session.userId`. |

**Input/output types:**

```typescript
// SearchQueryInput — maps to PP concept design §2.1 SearchQuery
const searchQueryInput = z.object({
  query: z.string().optional(),
  filters: z.object({
    sectors: z.array(z.string()).optional(),
    serviceAreas: z.array(z.string()).optional(),
    specialisations: z.array(z.string()).optional(),
    location: z.string().optional(),               // region or postcode [PP-ST-10]
  }).optional(),
  sort: z.enum(["relevance", "quality_score", "recently_updated"]).default("relevance"),
  cursor: z.string().optional(),                    // cursor-based pagination
  limit: z.number().int().min(1).max(50).default(20),
})

// SearchResultOutput — maps to PP concept design §2.1 SearchResult
type SearchResultOutput = {
  results: ListingSummary[]                         // organic results, ranked
  sponsoredResults: ListingSummary[]                 // premium/partner tier, max 3 [PP concept design §2.3]
  totalCount: number
  facets: FacetCounts                               // sector, serviceArea, location counts
  nextCursor?: string
  suggestedFilters?: string[]                        // "Did you mean..." alternatives
  zeroResultSuggestions?: string[]                   // alternative queries if no results
}

// ListingSummary — returned per search result
type ListingSummary = {
  slug: string
  name: string
  headline?: string
  entityType: EntityType
  baseRegion?: string
  verificationTier: VerificationTier
  isSponsored: boolean                              // derived server-side from subscriptionTier [PP-33]
  qualityScore: number                              // composite 0–100
  taxonomyTags: string[]                            // top 3–5 for display
  headshotUrl?: string                              // thumbnail variant (150px)
  logoUrl?: string
  lifecycleStatus: LifecycleStatus                  // always "active" in results [PP-1]
}

// FacetCounts — per PP concept design §2.1
type FacetCounts = {
  sectors: { slug: string; label: string; count: number }[]
  serviceAreas: { slug: string; label: string; count: number }[]
  locations: { slug: string; label: string; count: number }[]
  verificationTiers: { tier: VerificationTier; count: number }[]
}
```

**`search.query` implementation outline:**

```
search.query(input):
  // 1. Expand query terms via synonym_lookup [S1 §3.3]
  expandedTerms = expandSynonyms(input.query)

  // 2. Base filter: WHERE lifecycle_status = 'active' [PP-1]
  // 3. Apply user filters as WHERE clauses via taxonomy joins
  // 4. Execute tsvector query with ts_rank_cd [S1 §3.2]
  // 5. Apply ranking: buildSearchQuery(expandedTerms, input.filters) [S1 §3.2]
  //    quality_boost = quality_scores.composite / 100 * 0.5
  //    paid_boost = TIER_LIMITS[listing.subscriptionTier].rankingBoost / 100 — imported from CR §4.1 (P4)
  // 6. Compute facet counts via COUNT(*) GROUP BY on active listings matching filters
  // 7. Fetch sponsored listings separately: premium/partner tier + matching query, max 3

  // 8. Zero-result handling [PP concept design §2.2]:
  if results.length === 0:
    logZeroResultQuery(input.query, input.filters)    // → zero_result_queries table [S1-ST-6]
    suggestedFilters = broadenFilters(input.filters)  // remove most restrictive filter
    zeroResultSuggestions = findNearestMatches(input.filters)

  // 9. Emit search_performed event [PP §1.1 — P1 compliant]
  emit({
    type: "search_performed",
    query: input.query ?? "",
    filters: input.filters ?? {},                     // SearchFilters type [PP-ST-10]
    resultCount: totalCount,
    sessionId: ctx.session?.id,                       // optional — null for anonymous
    timestamp: new Date().toISOString(),
  })

  // 10. Record in search_history if authenticated [S1-6 flag resolution]
  if ctx.session:
    insertSearchHistory(ctx.session.userId, input.query, input.filters, totalCount)

  return { results, sponsoredResults, totalCount, facets, nextCursor, suggestedFilters, zeroResultSuggestions }
```

**`search.suggest` implementation outline:**

```
search.suggest({ prefix }):
  // Query taxonomy tables (sectors, serviceAreas, specialisations) + synonym_lookup
  // WHERE name ILIKE prefix% OR term ILIKE prefix%
  // ORDER BY match quality, LIMIT 10
  // No event emission — lightweight autocomplete
  return suggestions: string[]
```

---

### 2.2 shortlist router (`src/server/routers/shortlist.ts`)

All routes require authentication. Maximum 10 shortlists per account, 50 items per shortlist. [Source: PP concept design §7.2]

| Route | Access | Input | Return | Rendering | Description |
|-------|--------|-------|--------|-----------|-------------|
| `shortlist.list` | `protectedProcedure` | none | `ShortlistSummary[]` | CSR | All shortlists for current account with item counts. |
| `shortlist.getItems` | `protectedProcedure` | `{ shortlistId: uuid, cursor?: string }` | `{ items: ShortlistItemWithListing[], nextCursor? }` | CSR | Paginated items with joined listing display data. Batch query — no N+1. |
| `shortlist.create` | `protectedProcedure` | `{ name: string }` | `Shortlist` | CSR | Create shortlist. Rejects if account already has 10. |
| `shortlist.rename` | `protectedProcedure` | `{ shortlistId: uuid, name: string }` | `void` | CSR | Rename shortlist. Ownership check. |
| `shortlist.delete` | `protectedProcedure` | `{ shortlistId: uuid }` | `void` | CSR | Delete shortlist. Cascades items via FK. Ownership check. |
| `shortlist.addItem` | `protectedProcedure` | `{ shortlistId: uuid, listingId: uuid }` | `void` | CSR | Add listing to shortlist. Rejects if shortlist has 50 items. Emits `shortlist_added`. |
| `shortlist.removeItem` | `protectedProcedure` | `{ shortlistId: uuid, listingId: uuid }` | `void` | CSR | Remove listing from shortlist. Soft delete: sets `status = "removed"`. |

**Types:**

```typescript
type ShortlistSummary = {
  id: UUID
  name: string
  itemCount: number                // COUNT of active items
  createdAt: ISO8601
}

type ShortlistItemWithListing = {
  shortlistItemId: number
  listingId: UUID
  displayStatus: "active" | "archived" | "suspended"  // S6 schema addition [pre-draft §5.2]
  addedAt: ISO8601
  listing: {                       // joined from listings table — batch query
    slug: string
    name: string
    headline?: string
    entityType: EntityType
    verificationTier: VerificationTier
    baseRegion?: string
    headshotUrl?: string
    logoUrl?: string
    lifecycleStatus: LifecycleStatus
  }
}
```

**`shortlist.getItems` — N+1 prevention [checklist §8.5]:**

```
shortlist.getItems({ shortlistId, cursor }):
  // Ownership check: shortlist.accountId === session.userId
  // Single query: JOIN shortlist_items → listings
  // WHERE shortlist_items.shortlistId = :shortlistId AND shortlist_items.status = 'active'
  // ORDER BY shortlist_items.addedAt DESC
  // Cursor pagination on addedAt
  // Returns listing display data in same query — no per-item lookups
```

**`shortlist.addItem` emission [PP §1.5 — P1 compliant]:**

```
shortlist.addItem({ shortlistId, listingId }):
  // Ownership check: shortlist.accountId === session.userId
  // Capacity check: count(active items) < 50
  // Duplicate check: unique(shortlist_id, listing_id) constraint
  // Insert with status = "active", displayStatus = "active"
  emit({
    type: "shortlist_added",
    listingId: listingId,
    accountId: ctx.session.userId,
    timestamp: new Date().toISOString(),
  })
```

---

### 2.3 enquiry router (`src/server/routers/enquiry.ts`)

Enquiry submission is open to anonymous users (email required in form). Buyer-side read routes require authentication. [Source: PP concept design §5.2, §7.1]

| Route | Access | Input | Return | Rendering | Description |
|-------|--------|-------|--------|-----------|-------------|
| `enquiry.submit` | `publicProcedure` | `EnquirySubmitInput` | `{ enquiryId: uuid }` | CSR | Submit enquiry. Routes by claim status (claimed → deliver, unclaimed+email → forward, unclaimed+no email → reject with contact fallback, disputed → silent queue). Emits `enquiry_submitted`. |
| `enquiry.listSent` | `protectedProcedure` | `{ cursor?: string, limit?: number }` | `{ enquiries: EnquirySentView[], nextCursor? }` | CSR | Buyer's sent enquiries with response status. Reads `enquiry_records` filtered by `senderAccountId`. |
| `enquiry.getSent` | `protectedProcedure` | `{ enquiryId: uuid }` | `EnquirySentDetail` | CSR | Single enquiry detail with response status. Ownership check: `enquiry.senderAccountId === session.userId`. |

**Input/output types:**

```typescript
const enquirySubmitInput = z.object({
  listingId: z.string().uuid(),
  senderName: z.string().min(1).max(100),
  senderEmail: z.string().email().optional(),           // required if anonymous, pre-filled if authenticated
  senderCompany: z.string().max(200).optional(),
  projectType: z.enum([
    "feature", "tv_series", "tv_one_off", "short", "commercial",
    "corporate", "music_video", "digital_social", "live_event",
  ]).optional(),                                         // CreditFormat enum values [S1 §1.1]
  message: z.string().min(20).max(2000),                 // min 20 chars [PP concept design §5.2]
  budget: z.enum(["low", "medium", "high", "undisclosed"]).optional(),
  timeline: z.string().max(200).optional(),
  honeypot: z.string().max(0).optional(),                // spam prevention — must be empty
})

type EnquirySentView = {
  enquiryId: UUID
  listingSlug: string
  listingName: string
  message: string                                        // truncated to 200 chars for list view
  status: "unread" | "responded" | "stale"               // S5 enquiry_status enum
  submittedAt: ISO8601
  respondedAt?: ISO8601
}

type EnquirySentDetail = {
  enquiryId: UUID
  listingId: UUID
  listingSlug: string
  listingName: string
  senderName: string
  senderCompany?: string
  projectType?: string
  message: string
  budget?: string
  timeline?: string
  status: "unread" | "responded" | "stale"
  submittedAt: ISO8601
  respondedAt?: ISO8601
}
```

**`enquiry.submit` implementation outline:**

```
enquiry.submit(input):
  // 0. Spam prevention: honeypot check, rate limit (10/email/hour) [PP concept design §5.2]
  if input.honeypot: throw SPAM_DETECTED
  rateLimitCheck(senderEmail, 10, "1h")

  // 1. Resolve sender identity
  senderEmail = ctx.session?.email ?? input.senderEmail
  senderAccountId = ctx.session?.userId ?? null
  if !senderEmail: throw BAD_REQUEST("Email required for anonymous enquiries")

  // 2. Load listing + determine routing
  listing = getListing(input.listingId)
  if !listing || listing.lifecycleStatus !== "active": throw NOT_FOUND

  // 3. Route by claim status [PP concept design §5.3]
  match listing.claimStatus:
    "claimed" | "verified" | "premium_verified":
      // Direct delivery: create enquiry_records row + email notification to provider
      enquiryId = insertEnquiryRecord({ ...input, senderAccountId, senderEmail, status: "unread" })
      sendEmail("new_enquiry", { to: listing.accountEmail, enquiryId, listingName: listing.name })

    "unclaimed" | "pending_review":
      if listing.contactEmail:
        // Forward via email + queue [PP concept design §5.3 branch 1/3]
        enquiryId = insertEnquiryRecord({ ...input, senderAccountId, senderEmail, status: "unread" })
        sendEmail("enquiry_forwarded", { to: listing.contactEmail, enquiryId, claimCTA: generateClaimCTA(listing.id) })
        queuePendingEnquiry(listing.id, enquiryId)      // D&L pending_enquiries — 90-day TTL
      else:
        // No email — return contact fallback, do not create enquiry record [PP concept design §5.3 branch 2]
        throw BAD_REQUEST({ code: "NO_EMAIL", contactMethods: { phone: listing.phone, website: listing.website } })

    "disputed":
      // Silent queue — buyer sees normal confirmation [PP concept design §5.3 branch 4]
      enquiryId = insertEnquiryRecord({ ...input, senderAccountId, senderEmail, status: "unread" })
      queuePendingEnquiry(listing.id, enquiryId)

  // 4. Emit enquiry_submitted [PP §1.3 — P1 compliant, no PII per PP-ST-12]
  emit({
    type: "enquiry_submitted",
    enquiryId: enquiryId,
    listingId: input.listingId,
    timestamp: new Date().toISOString(),
  })

  return { enquiryId }
```

**`enquiry.listSent` query strategy:**

```
enquiry.listSent({ cursor, limit }):
  // Single query: JOIN enquiry_records → listings (for display name + slug)
  // WHERE sender_account_id = session.userId
  // ORDER BY submitted_at DESC
  // Cursor pagination on submitted_at
  // Index: (sender_account_id) — defined in S1 §2.2
```

---

### 2.4 searchHistory router (`src/server/routers/searchHistory.ts`)

Resolves S1-6 downstream flag. All routes require authentication. Data stored in `search_history` table (new in S6, pre-draft checklist §5.1).

| Route | Access | Input | Return | Rendering | Description |
|-------|--------|-------|--------|-----------|-------------|
| `searchHistory.list` | `protectedProcedure` | `{ limit?: number }` | `SearchHistoryEntry[]` | CSR | Recent searches for current account. Default limit 10, max 50. |
| `searchHistory.clear` | `protectedProcedure` | none | `void` | CSR | Delete all search history for current account. |

**Types:**

```typescript
type SearchHistoryEntry = {
  id: UUID
  query?: string
  filters?: SearchFilters
  resultCount: number
  createdAt: ISO8601
}
```

**Note:** Search history writes happen inside `search.query` (§2.1) for authenticated users. `searchHistory` router provides read/delete access only. 12-month retention enforced via application-level batch cleanup (deferred action or cron). [Source: Ops §5]

---

### 2.5 listing router amendments (`src/server/routers/listing.ts`)

S6 adds one route to the existing listing router from S1.

| Route | Access | Input | Return | Rendering | Description |
|-------|--------|-------|--------|-----------|-------------|
| `listing.reportContactAttempt` | `publicProcedure` | `{ listingId: uuid, result: "reached" \| "unreachable" }` | `void` | CSR | Buyer feedback on unclaimed listing contact attempt. Emits `contact_attempt`. |

**`listing.reportContactAttempt` implementation outline:**

```
listing.reportContactAttempt({ listingId, result }):
  listing = getListing(listingId)
  if !listing: throw NOT_FOUND
  // Only valid for unclaimed listings without email (where contact fallback is shown)
  if listing.claimStatus !== "unclaimed" || listing.contactEmail: throw BAD_REQUEST

  // Rate limit: 1 report per session per listing per day (prevent abuse)

  // Emit contact_attempt [PP §1.8 — P1 compliant]
  emit({
    type: "contact_attempt",
    listingId: listingId,
    result: result,                                     // "reached" | "unreachable" — maps to PP §1.8
    reporterAccountId: ctx.session?.userId,              // optional — null for anonymous
    timestamp: new Date().toISOString(),
  })
```

---

### 2.6 Non-route buyer features

Two buyer features do not require dedicated tRPC routes:

**Listing profile page (`/providers/[slug]/page.tsx`):** SSG+ISR page, not a tRPC route. Consumes S1's `listing.getBySlug` at build time via `generateStaticParams` (known slugs) and on-demand for new listings. Renders listing data, verification badge, quality score display, media gallery, taxonomy tags, contact/enquiry CTA, JSON-LD structured data. [Source: PP concept design §3, SI §7]

Profile view tracking: `profile_viewed` event emitted server-side during page render (SSG revalidation or SSR fallback), not client-side. Avoids double-counting on client navigation.

```
// providers/[slug]/page.tsx (server component)
export default async function ListingProfilePage({ params }) {
  const listing = await trpc.listing.getBySlug({ slug: params.slug })
  if (!listing || listing.lifecycleStatus !== "active") notFound()

  // Emit profile_viewed [PP §1.2 — P1 compliant]
  await emit({
    type: "profile_viewed",
    listingId: listing.id,
    source: inferSource(headers),                       // "search" | "direct" | "shortlist"
    timestamp: new Date().toISOString(),
  })

  // CTA logic [PP concept design §3.1]
  const cta = resolveProfileCTA(listing)
  //   claimed/verified/premium → enquiry form
  //   unclaimed + email → enquiry form (forwarded)
  //   unclaimed + no email → contact details + feedback buttons
  //   disputed → enquiry form (silent queue)

  // JSON-LD [SI §7.3]
  const jsonLd = generateJsonLd(listing)
  //   @type: LocalBusiness (company) | Person (freelancer)

  return <ProfilePageLayout listing={listing} cta={cta} jsonLd={jsonLd} />
}

export async function generateStaticParams() {
  const slugs = await db.select({ slug: listings.slug })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))
  return slugs.map(s => ({ slug: s.slug }))
}

// ISR revalidation: 15-minute default [SI §7.1]
// On-demand revalidation via revalidatePath('/providers/' + slug) on:
//   claim_approved, listing_suspended, listing_archived,
//   listing_reactivated, erasure_completed [SI §7.2]
export const revalidate = 900
```

**Cross-role nudge (`evaluateCrossRoleNudge`):** Pure function computed on buyer dashboard page load. No tRPC route — reads `search_history` data already loaded for the dashboard. [Source: PP concept design §7.3]

```
function evaluateCrossRoleNudge(searchHistory: SearchHistoryEntry[]): CrossRoleNudge | null
  if account.listings.length > 0: return null             // already a provider

  // Nudge 1: 5+ searches in same service area within 30 days
  topCategory = searchHistory
    .filter(s => s.createdAt > now() - 30days)
    .groupBy(s => s.filters?.serviceAreas?.[0])
    .sortByCountDesc()
    .first()

  if topCategory && topCategory.count >= 5:
    return {
      type: "category_concentration",
      message: "You've searched for {topCategory.label} {topCategory.count} times. Do you offer this service?",
      action: { label: "Create your listing", target: "/dashboard/listings/create" },
    }

  // Nudge 2: 20+ total searches, no listing, account older than 14 days
  if searchHistory.length > 20 && accountAge > 14days:
    return {
      type: "engagement_threshold",
      message: "You've been actively searching CALLSHEET. Are you also a provider?",
      action: { label: "Create your listing", target: "/dashboard/listings/create" },
    }

  return null
```

---

## 3. Rendering Strategy Summary

| Page | Strategy | Rationale |
|------|----------|-----------|
| `/search` | SSR | Query-dependent, SEO-relevant (search results pages indexable), results must be fresh. Target: <500ms TTFB p95 [SI §10]. |
| `/providers/[slug]` | SSG+ISR (15 min) | SEO-critical (core content page), content changes infrequently. On-demand revalidation for 5 lifecycle events [SI §7.2]. |
| `/dashboard/enquiries-sent` | CSR | Authenticated, personalised, no SEO value. |
| `/dashboard/shortlists` | CSR | Authenticated, personalised, no SEO value. |
| `/dashboard/searches` | CSR | Authenticated, personalised, no SEO value. |

All dashboard pages inherit S5's auth guard (`/dashboard/layout.tsx`). Buyer dashboard pages use `protectedProcedure` (any authenticated user), not `providerProcedure` (listing owner).

---

## 4. Cross-Domain Read Patterns

S6 reads data from other domains via established query interfaces. These are legitimate cross-domain reads, not P1 violations. [Source: pre-draft checklist §8.7]

| Read | Source Domain | Interface | Used By |
|------|-------------|-----------|---------|
| Listing data (name, slug, taxonomy, media, verification) | D&L | `listing.getBySlug` (S1 §4.2) | Profile page, search results, shortlist display |
| Engagement counters (profile views, enquiries received) | D&L | `getEngagementCounters` (D&L §3.1) | Profile page display ("X profile views") |
| Feature access (tier limits for gated display) | CR | `computeFeatureAccess(tier)` (CR §4.2) | Profile CTA logic, feature gating |
| `TIER_LIMITS` (ranking boost values) | CR | `TIER_LIMITS` const (CR §4.1) | Search ranking formula |
| Synonym lookup | D&L | `synonym_lookup` table (S1 §3.3) | Search query expansion |

---

## 5. Event Emission Summary

5 events emitted by S6. All payloads verified against `EventPayloadMap` (SI §1.2). [Source: pre-draft checklist §3]

| Event | Route | Payload (P1 fields only) | Consumer Domains |
|-------|-------|--------------------------|-----------------|
| `search_performed` | `search.query` | `query`, `filters: SearchFilters`, `resultCount`, `sessionId?`, `timestamp` | D&L (zero-result tracking) |
| `profile_viewed` | `/providers/[slug]/page.tsx` | `listingId`, `source`, `timestamp` | D&L (engagement metric) |
| `enquiry_submitted` | `enquiry.submit` | `enquiryId`, `listingId`, `timestamp` | D&L (engagement + queue), CR (conversion trigger) |
| `shortlist_added` | `shortlist.addItem` | `listingId`, `accountId`, `timestamp` | No cross-domain consumers |
| `contact_attempt` | `listing.reportContactAttempt` | `listingId`, `result`, `reporterAccountId?`, `timestamp` | D&L (data quality), Ops (outreach) |

**Critical check confirmed:** `enquiry_submitted` carries no PII (`senderEmail`, `senderAccountId` excluded per PP-ST-12).

---

## 6. Route-to-Skeleton Section Mapping

| Skeleton Section | Primary Routes | Notes |
|-----------------|---------------|-------|
| §1 Search Implementation | `search.query`, `search.suggest` | Ranking formula from S1 §3.2, synonym expansion from S1 §3.3 |
| §2 Listing Profile Page | `/providers/[slug]/page.tsx`, `listing.getBySlug` (S1) | SSG+ISR, JSON-LD, CTA logic |
| §3 Enquiry Submission | `enquiry.submit` | Routes by claim status, 4-branch decision tree |
| §4 Shortlist Management | `shortlist.*` (7 routes) | Max 10 shortlists, 50 items each |
| §5 Saved Searches & History | `search.saveSearch`, `search.getSavedSearches`, `search.deleteSavedSearch`, `searchHistory.*` | Saved searches (S1 table) + search history (S6 table) |
| §6 Buyer Dashboard | `enquiry.listSent`, `enquiry.getSent`, dashboard pages | Reads from shortlist, search history, enquiry routes |
| §7 Contact Attempt Feedback | `listing.reportContactAttempt` | Unclaimed + no email only |
| §8 Cross-Role Nudge | `evaluateCrossRoleNudge()` (pure function) | No route — computed on dashboard load |
| §9 Feature Gating | `computeFeatureAccess` (CR import) | Controls CTA display, analytics visibility on profile page |
