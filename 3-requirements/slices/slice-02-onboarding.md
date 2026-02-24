# Slice 2: Onboarding

**Status:** Draft v2 — v1 + 16 stress test fixes (3 High, 8 Medium, 5 Low).
**Primary Owner:** Platform & Product
**Last updated:** 2026-02-12
**Dependencies:** S0 (event bus, scheduler, auth, email transport, R2, service abstraction, tRPC), S1 (Listing schema, Account profile, Taxonomy, integrity rules, image pipeline, engagement counters, email preferences)
**Inputs:** `interfaces/platform-and-product.md` (v6), `interfaces/data-and-listings.md` (v5), `interfaces/operations.md` (v4), `interfaces/shared-infrastructure.md` (v8), `2-concept-design/platform-and-product.md` (v5 §4), `2-concept-design/operations.md` (v6 §5–§6), `2-concept-design/data-and-listings.md` (v6 §4 batch integrity), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S3 (Claim & Verify), S5 (Provider Experience), S6 (Buyer Experience)

---

## Summary

S2 implements the three onboarding paths (freelancer, company, claim), the 4rfv seed data import pipeline, Article 14 GDPR batch notices, the profile strength meter, progressive disclosure email/in-app sequence, and intelligent taxonomy suggestions. This is the first slice that produces user-facing pages and the first to exercise the full listing creation flow end-to-end. This document covers only the implementation delta — for types, contracts, and principles, see upstream specs.

**Key architectural point:** S2 registers 7 email templates with S0's email transport (3 progressive disclosure + `welcome` + `listing_live` + `article_14_notice` + `enquiry_forwarded`). `email_verification` and `password_reset` are registered in S0 (auth). Claim-specific templates (`claim_approved`, `claim_rejected`, `claim_pending_review`) are registered in S3.

## V1 Scope Boundary

**In scope:** All three onboarding paths at V1 scale (~4,700 seed listings, ~200 new accounts in first 6 months). 4rfv batch import (5-phase pipeline). Article 14 GDPR batch. Profile strength meter. Progressive disclosure (Days 0–30). Intelligent taxonomy suggestions (3 curated sectors + generic fallback). Retroactive anonymous enquiry linking. Image processing pipeline (3 WebP variants).

**Deferred to later slices:** Claim evaluation logic and manual review routing (S3). Subscription tier selection during onboarding (S4). Provider dashboard beyond profile editor (S5). Search UI and buyer onboarding (S6). Quality scoring algorithms (S9 — S2 triggers the two-phase creation pattern from S1; zero-initialised scores are valid).

---

## 1. Onboarding Pages

### 1.1 Route Structure

```
src/app/
├── (auth)/
│   ├── signup/page.tsx            ← Account creation (Step 1–2)
│   └── verify-email/page.tsx      ← Email verification callback
├── (onboarding)/
│   ├── personalise/page.tsx       ← Step 3: "What do you do?" multi-select
│   ├── create-listing/
│   │   ├── type/page.tsx          ← Individual or Company selector
│   │   ├── freelancer/
│   │   │   ├── step-1/page.tsx    ← Sector + service area
│   │   │   ├── step-2/page.tsx    ← Details (title, location, day rate)
│   │   │   ├── step-3/page.tsx    ← Profile (headshot, bio, showreel)
│   │   │   └── review/page.tsx    ← Review + publish
│   │   └── company/
│   │       ├── step-1/page.tsx    ← Company identity + CH number
│   │       ├── step-2/page.tsx    ← Service areas + specialisations
│   │       ├── step-3/page.tsx    ← Details (description, logo, links)
│   │       └── review/page.tsx    ← Review + publish
│   └── claim/
│       └── [listingId]/page.tsx   ← Claim flow (review + edit pre-populated)
├── listing/
│   └── [slug]/
│       └── claim/page.tsx         ← "Is this your business?" entry point
```

All onboarding pages use CSR (client-rendered, behind auth). Listing profile pages (`/listing/[slug]`) remain SSG + ISR per S0 §8.

### 1.2 Rendering Strategy

| Route | Strategy | Auth Required |
|---|---|---|
| `/signup` | CSR | No |
| `/verify-email` | CSR | No |
| `/personalise` | CSR | Yes |
| `/create-listing/*` | CSR | Yes (verified email) |
| `/listing/[slug]/claim` | CSR | Yes (verified email) |

---

## 2. Account Creation Flow

### 2.1 Shared Foundation (All Paths)

Contract: `shared-infrastructure.md` §4 (auth), S0 §5 (Better Auth config).

```typescript
// src/server/routers/onboarding.ts
export const onboardingRouter = router({
  // Step 1–2: Better Auth handles signup + email verification natively (S0 §5)
  // S2 adds the post-verification hook:

  completePersonalisation: protectedProcedure
    .input(z.object({
      departments: z.array(z.string()).max(10).optional(),  // "What do you do?" multi-select, skippable
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Store department preferences on account profile (new column — §2.2)
      // 2. Return dashboard redirect URL
    }),
})
```

**Post-creation state:** Account exists with buyer facet active (`account_profiles` row from S1 §2.1). No listing. Dashboard shows buyer tools (search, shortlists) and "Create your listing" CTA.

### 2.2 Account Profile Extension

S2 adds one column to `account_profiles` (S1 §2.1):

```typescript
// Migration: add departments column to account_profiles
departments: text("departments").array().default([]),  // personalisation selections, max 10
```

This is a non-breaking additive migration. Existing S1 account creation logic continues to work — `departments` defaults to empty array.

### 2.3 Retroactive Anonymous Enquiry Linking

Downstream flag S1-ST-20. When a new account is created, the signup completion handler queries `enquiry_records` by `sender_email` and updates `sender_account_id` for any matching anonymous enquiries.

```typescript
// Post-signup hook (runs after account_profiles row creation)
async function linkAnonymousEnquiries(accountId: UUID, email: string): Promise<number> {
  // UPDATE enquiry_records SET sender_account_id = $1
  // WHERE sender_email = $2 AND sender_account_id IS NULL
  // Returns count of linked records
}
```

This uses the partial index on `enquiry_records(sender_email) WHERE sender_email IS NOT NULL AND sender_account_id IS NULL` defined in S1 §2.2.

---

## 3. Path A — Freelancer Listing Activation

Target: 3–5 minutes. [Source: PP concept design §4.2]

### 3.1 tRPC Routes

```typescript
// src/server/routers/listing-creation.ts
export const listingCreationRouter = router({
  createFreelancer: protectedProcedure
    .input(z.object({
      // Step 1 — Role
      primarySectorSlug: z.string(),
      primaryServiceAreaId: z.number().int(),
      additionalTags: z.array(z.object({
        sectorId: z.number().int(),
        serviceAreaId: z.number().int(),
        specialisationId: z.number().int().optional(),
      })).max(20).optional(),

      // Step 2 — Details
      headline: z.string().min(5).max(200),
      basePostcode: z.string().optional(),
      baseRegion: z.string(),
      dayRate: z.number().int().positive().max(99999).optional(),

      // Step 3 — Profile
      bio: z.string().max(2000).optional(),
      showreelUrl: z.string().url().optional(),
      // Headshot uploaded separately via media.uploadImage (S1 §5)
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check verified email (FORBIDDEN if not)
      // 2. Run integrity checks: checkDuplicate, checkCHUniqueness (Rule 3 n/a for freelancers without CH)
      //    [Source: S1 §6.2 runIntegrityChecks]
      // 3. Create listing (entityType = "freelancer", claimStatus = "claimed",
      //    subscriptionTier = "free", lifecycleStatus = "active", accountId = ctx.session.accountId)
      // 4. Create one-to-one rows: verification (tier = "claimed"), quality_scores (zeros),
      //    quality_score_explanations, engagements (zeros) — two-phase pattern [S1 §10]
      // 5. Create taxonomy tags
      // 6. Emit listing_created event (PP-owned emission [S1 Summary])
      // 7. Schedule progressive disclosure: profile_day1, profile_day3, profile_day7
      //    via deferred actions [§7]
      // 8. Send listing_live email
      // 9. Return listing slug for redirect
    }),
})
```

### 3.2 Field Validation

Contract: PP concept design §4.2 [PP-11]. Zod schemas enforce constraints.

| Field | Constraint | Zod |
|---|---|---|
| Name | Pre-filled from account `fullName` | — |
| Headline | 5–200 chars | `z.string().min(5).max(200)` |
| Bio | 0–2000 chars | `z.string().max(2000).optional()` |
| Location (region) | Required for search inclusion | `z.string()` |
| Day rate | Positive integer, max 99999 | `z.number().int().positive().max(99999).optional()` |
| Taxonomy tags | Min 1 service area | Enforced by required `primaryServiceAreaId` |

---

## 4. Path B — Company Listing Activation

Target: 8–15 minutes. [Source: PP concept design §4.3]

### 4.1 tRPC Routes

```typescript
export const listingCreationRouter = router({
  // ... createFreelancer above

  createCompany: protectedProcedure
    .input(z.object({
      // Step 1 — Company identity
      companyName: z.string().min(2).max(100),
      entityType: z.enum(["company", "education", "industry_body", "public_sector", "non_profit"]),
      companiesHouseNumber: z.string().optional(),

      // Step 2 — Services
      taxonomyTags: z.array(z.object({
        sectorId: z.number().int(),
        serviceAreaId: z.number().int(),
        specialisationId: z.number().int().optional(),
      })).min(1).max(30),

      // Step 3 — Details
      bio: z.string().max(2000).optional(),
      websiteUrl: z.string().url().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      basePostcode: z.string().optional(),
      baseRegion: z.string(),
      // Logo uploaded separately via media.uploadImage (S1 §5)
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check verified email (FORBIDDEN if not)
      // 2. Run full integrity checks: checkDuplicate, verifyNewListingIdentity (CH lookup),
      //    checkCHUniqueness [Source: S1 §6.2]
      // 3. If integrity flags: create listing with `lifecycleStatus = "suspended"`,
      //    `claimStatus = "pending_review"`. Return { status: "flagged", reason, listingId }.
      //    Provider notified "Your listing is being reviewed" with expected timeframe.
      //    Listing exists but is not searchable (suspended). S3 resolves review: approve
      //    (set active + claimed) or reject (archive + notify). [S2-ST-13]
      // 4. If integrity passes: create listing (entityType from input, claimStatus = "claimed",
      //    subscriptionTier = "free", lifecycleStatus = "active")
      // 5. If CH number provided + active match: verificationTier may upgrade to "verified"
      //    per D&L evaluateClaim() logic (auto-approve path). Full claim logic in S3.
      // 6. Create one-to-one rows, taxonomy tags (same pattern as freelancer)
      // 7. Emit listing_created event
      // 8. Schedule progressive disclosure deferred actions [§7]
      // 9. Send listing_live email
      // 10. Return listing slug or review status
    }),

  // Companies House lookup — used during company Step 1 for auto-population
  lookupCompaniesHouse: protectedProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ ctx, input }) => {
      // Calls ctx.services.companiesHouse.search(input.query)
      // Returns: { name, number, status, registeredAddress, directors[] }
      // Used for auto-populating fields + integrity pre-check UX
    }),
})
```

### 4.2 Companies House Auto-Population

When a provider enters a CH number in Step 1, the client calls `lookupCompaniesHouse` and pre-fills:
- Company name (from CH record)
- Registered address → `baseRegion`
- Status (shown as badge: "Active", "Dissolved" shown with warning)
- Director names (for identity verification UX — "Are you [director name]?")

If CH status is "dissolved", show warning: "This company appears dissolved at Companies House. You can still create a listing, but verification will require manual review."

### 4.3 Image Processing Pipeline

Contract: PP concept design §4.3 [PP-23]. On upload via S1's `media.uploadImage`, S2 adds a post-upload processing step.

```typescript
// src/lib/image-processing.ts
async function processListingImage(
  originalKey: string,
  storage: ObjectStorageService,
): Promise<ImageVariants> {
  // 1. Download original from R2
  // 2. Generate 3 WebP variants using sharp (or equivalent):
  //    - thumbnail: max 150px width
  //    - card: max 400px width
  //    - full: max 1200px width
  // 3. Upload variants to R2: listings/{listingId}/images/{imageId}_{variant}.webp
  //    access = "public"
  //    Cache-Control: public, max-age=31536000, immutable (content-addressed filenames)
  // 4. Return { thumbnailUrl, cardUrl, fullUrl }
}

type ImageVariants = {
  thumbnailUrl: string   // 150px
  cardUrl: string        // 400px
  fullUrl: string        // 1200px
}
```

**Storage estimate:** ~4,700 listings × ~3 images × 4 variants (original + 3 WebP) = ~56,400 objects. Well within R2 free tier.

**Implementation note:** S1's `media.uploadImage` uploads the original and creates the `media_items` row. S2 wraps this to add variant generation. The `media_items.url` field stores the `cardUrl` (default display). Variant URLs follow a deterministic naming convention — no additional DB columns needed.

**Deployment constraint [S2-ST-7]:** `sharp` is a native module (~40MB). Next.js bundles `@next/sharp` for its Image Optimization API, which Vercel supports natively. S2's variant generation should use Next.js `sharp` (available via `next/image` internals) or run variant generation as a post-upload background task via `waitUntil()` to avoid blocking the upload response. If `sharp` import size causes Vercel function size issues (50MB limit), fallback: use Cloudflare Image Transformations (R2-native, no code deployment needed) or defer variant generation to a CLI script similar to the import pipeline.

**Variant generation failure [S2-ST-18]:** If variant generation fails (corrupt image, processing error), the original image is preserved in R2 and `media_items.url` stores the original URL as fallback. The listing displays the original (unoptimised) image. A warning is logged via structured error logging. No user-visible error — the upload succeeds; optimisation is best-effort.

---

## 5. Path C — Claiming a Pre-Existing Listing

Target: 2–3 minutes. [Source: PP concept design §4.4]

### 5.1 Claim Entry Point

The claim CTA appears on unclaimed listing profile pages (`/listing/[slug]`). Pressing "Is this your business? Claim this listing" redirects to `/listing/[slug]/claim`, which requires authentication.

```typescript
// src/server/routers/claim.ts
export const claimRouter = router({
  // Fetch claim context (pre-populate form)
  getClaimContext: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 1. Verify listing exists and claimStatus === "unclaimed"
      // 2. Return pre-populated listing data for editable form
      // 3. Include endowment messaging data (§5.2)
      // 4. Return profile strength using fallback field-presence check (§8.2) [S2-ST-10]
      //    Import-created listings have zero-initialised quality scores — fallback
      //    inspects actual field presence (headline, bio, logo, etc.) instead.
    }),

  // Submit claim
  submitClaim: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      // Provider can edit any pre-populated field during claim
      edits: z.object({
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
          specialisationId: z.number().int().optional(),
        })).min(1).max(30).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify listing claimStatus === "unclaimed" (race condition guard)
      // 2. Create pre-claim snapshot [Source: S1 §1.13]
      // 3. Store edits in pre-claim snapshot alongside original data [S2-ST-14]
      //    Edits are NOT applied to the listing yet — they are held until claim approval.
      //    On approval (S3), edits are applied from snapshot. On rejection, snapshot is
      //    deleted and listing remains unmodified. This prevents rejected claims from
      //    leaving modified data on unclaimed listings.
      // 4. Run integrity checks [Source: S1 §6.2]
      // 5. Evaluate claim confidence (S3 provides full evaluateClaim — S2 provides a
      //    simplified pass-through that queues all claims for S3 processing):
      //    - S2 stub: set claimStatus = "pending_review", return { status: "pending_review" }
      //    - S3 replaces with full auto-approve/reject/manual-review logic
      // 6. Schedule pre-claim snapshot cleanup (90-day deferred action) [S2-ST-1]
      // 7. Return claim status
    }),
})
```

**S2/S3 boundary:** S2 implements the claim form, pre-population, snapshot creation, and snapshot cleanup scheduling. S3 implements `evaluateClaim()` with auto-approve/reject logic, competing claims, and manual review routing. S2's `submitClaim` sets `claimStatus = "pending_review"` for all claims. S3 upgrades this with confidence-based routing.

**Progressive disclosure scheduling for claims [S2-ST-17]:** Claim-path progressive disclosure is NOT scheduled during `submitClaim`. The claim is `pending_review` — the provider has no dashboard access yet, and the claim may be rejected. Progressive disclosure for claim paths is scheduled by S3's `claim_approved` handler, which calls `scheduleClaimProgressiveDisclosure(listingId, accountId)` (§7.2) after granting dashboard access. S2 provides the function; S3 invokes it.

### 5.2 Endowment Effect Messaging

[Source: PP concept design §4.4 [XP-17]]

```typescript
function getEndowmentMessaging(listing: ListingWithEngagement): EndowmentMessage {
  if (listing.engagements.profileViews >= 5) {
    return {
      type: "personal",
      text: `Your listing has been viewed ${listing.engagements.profileViews} times this month`,
    }
  }
  // Below 5 views: show category-level data
  // At launch, 4rfv listings start at 0 views — low counts undermine the effect
  return {
    type: "category",
    text: `Buyers search for ${listing.primaryServiceArea} on CALLSHEET`,
  }
}
```

### 5.3 Pending Enquiry Delivery

On claim approval (S3 emits `claim_approved`), PP's async consumer delivers queued enquiries. S2 provides the `deliverPendingEnquiries` callback that S3/S6 invokes. [Source: S1-10 downstream flag]

```typescript
// src/domains/platform/enquiry-delivery.ts
async function deliverPendingEnquiries(listingId: UUID, enquiryIds: UUID[]): Promise<number> {
  // 1. For each enquiryId: look up full enquiry from PP's enquiry_records
  // 2. Create notification for each enquiry in provider's inbox
  // 3. Send enquiry_forwarded email (batch, max 5 per email to avoid spam feel)
  // 4. Update pending_enquiries.forwardedAt
  // 5. Return count delivered
}
```

**Implementation note:** This function is registered as a callable service, not an event consumer. D&L reads `pending_enquiries` for the listing and passes the `enquiryIds` to PP's callback. Full delivery implementation may be deferred to S3/S6 depending on claim approval flow completion — S2 provides the function signature and stub.

---

## 6. 4rfv Seed Data Import

### 6.1 Import Pipeline

5-phase pipeline. [Source: Operations concept design §6, D&L concept design §4 batch integrity]

```
src/scripts/
├── import/
│   ├── pipeline.ts           ← orchestrates 5 phases sequentially
│   ├── phase-1-clean.ts      ← automated cleaning
│   ├── phase-2-ch-verify.ts  ← Companies House batch verification
│   ├── phase-3-export.ts     ← export flagged records for manual cleaning
│   ├── phase-4-removal.ts    ← archive flagged records
│   ├── phase-5-article14.ts  ← Article 14 notices (§6.5)
│   └── integrity.ts          ← batchImportIntegrity() [Source: D&L §4 X-16]
```

**Execution context:** CLI script, not tRPC route. Runs pre-launch against the production database. Requires `DATABASE_URL` and `COMPANIES_HOUSE_API_KEY` environment variables.

### 6.2 Phase 1: Automated Cleaning

Entity-driven. ~60–70% of records (3,000). 2–4 hours compute time. [Source: Ops §6 phase1]

```typescript
async function phase1AutomatedCleaning(records: ImportRecord[]): Promise<Phase1Result> {
  const cleaned: CleanedRecord[] = []
  const flagged: FlaggedRecord[] = []

  for (const record of records) {
    // 1. Format standardisation: trim whitespace, normalise case (title case for names)
    // 2. Postcode validation: UK postcode regex, correct common errors (O→0, l→1)
    // 3. Email format validation: basic RFC check, flag invalid
    // 4. URL normalisation: ensure https://, strip trailing slash
    // 5. Phone normalisation: UK format (+44 or 0)
    // Flagged records: invalid postcode + no alternative, invalid email, malformed data
  }

  return { cleaned, flagged, stats: { total: records.length, cleaned: cleaned.length, flagged: flagged.length } }
}
```

### 6.3 Phase 2: Companies House Batch Verification

Entity-driven. All records with CH numbers. ~40 minutes. [Source: Ops §6 phase2]

```typescript
async function phase2CHVerification(
  records: CleanedRecord[],
  companiesHouse: CompaniesHouseService,
): Promise<Phase2Result> {
  const verified: VerifiedRecord[] = []
  const dissolved: FlaggedRecord[] = []

  for (const record of records.filter(r => r.companiesHouseNumber)) {
    const result = await companiesHouse.lookup(record.companiesHouseNumber!)
    // Rate limit: CH API allows 600 requests/5 minutes. Batch with 500ms delay.
    if (result?.status === "dissolved") {
      dissolved.push({ ...record, flagReason: "dissolved_company" })
    } else if (result?.status === "active") {
      verified.push({ ...record, chVerified: true, chData: result })
    } else {
      verified.push({ ...record, chVerified: false })
    }
  }

  return { verified, dissolved }
}
```

### 6.4 Batch Import Integrity

[Source: D&L concept design §4 X-16, downstream flag S1-3]

```typescript
async function batchImportIntegrity(records: CleanedRecord[]): Promise<BatchIntegrityResult> {
  // Phase 1: Intra-batch deduplication (before any records committed)
  const sorted = records.sort((a, b) => a.name.localeCompare(b.name))

  // Name similarity clustering: sorted-neighbour sliding window.
  // O(n²) cross-join is impractical for ~4,700 records (~11M pairs).
  // Strategy: alphabetically sorted records compared only within a sliding window
  // of 10 neighbours. pg_trgm similarity() called in PostgreSQL for each candidate
  // pair. Threshold: similarity > 0.9. Catches most duplicates (name variations like
  // "Smith Camera Ltd" / "Smith Cameras Ltd") while keeping comparison count ~47K. [S2-ST-16]
  const nameClusters = clusterByNameSimilarity(sorted, 0.9)

  // CH number clustering: exact match
  const chClusters = clusterByCHNumber(sorted)

  // Merge clusters, select most complete record per cluster
  const allClusters = mergeClusters(nameClusters, chClusters)
  const primary: CleanedRecord[] = []
  const duplicates: FlaggedRecord[] = []

  for (const cluster of allClusters) {
    const best = selectMostComplete(cluster)  // highest non-null field count
    primary.push(best)
    for (const dup of cluster.filter(r => r !== best)) {
      duplicates.push({ ...dup, flagReason: "duplicate", mergeCandidate: best.id })
    }
  }

  // Rule 2 (identity verification) skipped — no Account exists for batch imports
  // Rule 3 (CH uniqueness) applied via chClusters above

  return { committed: primary, flagged: duplicates }
}
```

### 6.5 Phase 5: Article 14 GDPR Notices

[Source: Operations concept design §5, shared-infrastructure §5.2]

Must complete within 30 days of data import. Clock starts at Phase 1 completion (data collection date). [Source: UK GDPR Art 14(3)(a)]

```typescript
async function phase5Article14(
  listings: ImportedListing[],
  emailService: EmailService,
): Promise<Article14Result> {
  const withEmail = listings.filter(l => l.contactEmail)
  const withoutEmail = listings.filter(l => !l.contactEmail)

  // Listings WITH email: send Article 14 notice
  let sent = 0
  let failed = 0
  for (const listing of withEmail) {
    const result = await emailService.send({
      to: listing.contactEmail!,
      template: "article_14_notice",
      data: {
        businessName: listing.name,
        listingUrl: `${BASE_URL}/listing/${listing.slug}`,
        claimUrl: `${BASE_URL}/listing/${listing.slug}/claim`,
        dataCategories: summariseDataCategories(listing),
        // Template content per Ops §5 [X-15]:
        // Legal notice (Ops-owned) + Claim CTA (D&L-owned) + Unsubscribe (Ops-owned)
      },
      category: "transactional",  // non-unsubscribable — compliance obligation
    })
    if (result.status === "sent") sent++
    else failed++

    // Rate limit: Resend Pro tier required for Article 14 batch (~3,000 emails).
    // Free tier caps at 100 emails/day — insufficient for 30-day compliance window.
    // Resend Pro ($20/month, 50K/month) supports 10 emails/second.
    // Strategy: send in daily batches of ~150 emails over 20 days (allows 10-day buffer).
    // Pipeline tracks daily send count; `article_14_progress_check` monitors progress. [S2-ST-12]
    await delay(600)  // ~100 emails/minute within daily batch
  }

  // Listings WITHOUT email: Art 14(5)(b) exemption
  // On-page notice added to listing profile (rendered by SSG/ISR)
  for (const listing of withoutEmail) {
    await addArticle14OnPageNotice(listing.id)
    await logComplianceAction({
      type: "article_14_exemption",
      listingId: listing.id,
      reason: "no_contact_email",
      exemption: "Art 14(5)(b)",
      remediation: "on_page_notice",
    })
  }

  return { emailsSent: sent, emailsFailed: failed, onPageNotices: withoutEmail.length }
}
```

**`article_14_notice` template structure [X-15]:**
1. Legal notice section (Ops-owned, compliance-reviewed): controller identity, purposes, lawful basis (legitimate interest), data categories held, retention periods, rights (access, rectification, erasure, restriction, object, complain to ICO), data source (publicly available industry records)
2. Claim CTA section (D&L-owned, conversion-oriented): "Claim your listing" button + benefits
3. Unsubscribe/opt-out (Ops-owned, compliance): "Remove my listing" link

**Compliance monitoring:** Schedule a `article_14_progress_check` deferred action (daily, self-perpetuating via S0 §3.2 pattern) that checks send progress. Alert principal if <80% sent by day 20.

### 6.6 Import Record Schema

```typescript
type ImportRecord = {
  sourceId: string                    // 4rfv identifier
  name: string
  entityType: "freelancer" | "company"
  companiesHouseNumber?: string
  contactEmail?: string
  contactPhone?: string
  websiteUrl?: string
  basePostcode?: string
  baseRegion?: string
  bio?: string
  services: string[]                  // raw service descriptions, mapped to taxonomy in Phase 1
  source: "4rfv_import"              // batch identifier for Article 14 scoping
}

type ImportedListing = {
  id: UUID
  slug: string
  name: string
  contactEmail?: string
  // ... all listing fields
  importBatchId: string              // tracks this listing back to 4rfv import
}
```

### 6.7 Listing Import Commit

Listings created from the import pipeline are committed with specific defaults:

```typescript
// Per imported record:
{
  entityType: inferred,               // from import record
  claimStatus: "unclaimed",
  verificationTier: "unclaimed",
  subscriptionTier: "free",
  lifecycleStatus: "active",
  accountId: null,                    // no account — unclaimed
  source: "4rfv_import",             // added column — see §6.8
}
```

**Two-phase pattern for imports [S2-ST-4]:** Each imported listing must also create one-to-one rows (verification, quality_scores, quality_score_explanations, engagements) with zero-initialised values, following S1 §10. Without these rows, downstream queries (profile strength, search ranking, dashboard) fail on missing joins. The import pipeline creates all rows within a single transaction per listing.

**Event emission for imports [S2-ST-3]:** The import pipeline does NOT emit `listing_created` events. The `ListingCreatedEvent` payload requires `accountId: UUID` (PP §1.6), but imported listings have `accountId = null`. Emitting would violate the type contract. Import-created listings are indexed directly by the pipeline (search vector trigger fires on INSERT). The `listing_created` consumer's primary actions (initial quality score, onboarding volume tracking) are handled differently for imports: quality scores are zero-initialised (S9 computes real values), and import volume is tracked by the pipeline's own completion log. If `listing_created` emission is needed for imports in future, `ListingCreatedEvent.accountId` must be changed to `UUID | null` — this is a contract change requiring cross-domain coordination.

### 6.8 Schema Addition: Import Source Tracking

S2 adds one column to `listings` (S1 §1.2):

```typescript
// Migration: add source column to listings
source: text("source"),  // null for user-created, "4rfv_import" for seed data
```

Used by:
- Article 14 scoping: `WHERE source = '4rfv_import'`
- `listing_live` email suppression: seed imports do NOT trigger `listing_live` email [PP-ST-20]
- Analytics: distinguish organic vs seeded listings

---

## 7. Progressive Disclosure

### 7.1 Standard Path (Paths A + B)

Deferred actions schedule the email sequence at listing creation. [Source: PP concept design §4.6]

```typescript
// Called from createFreelancer / createCompany after listing creation
async function scheduleProgressiveDisclosure(
  listingId: UUID,
  accountId: UUID,
  path: "freelancer" | "company",
): Promise<void> {
  const now = new Date()

  // Day 1: listing_live confirmation (sent immediately, not deferred)
  // — already sent in creation mutation

  // Day 1: profile_day1 (24 hours after creation)
  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day1", path },
    executeAt: addHours(now, 24),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding",
  })

  // Day 3: profile_day3
  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day3", path },
    executeAt: addHours(now, 72),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding",
  })

  // Day 7: profile_day7
  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day7", path },
    executeAt: addHours(now, 168),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding",
  })
}
```

**Handler:** `send_progressive_email` action handler checks current profile strength before sending. If the targeted action is already complete (e.g., day 3 says "add portfolio" but portfolio already uploaded), the email is skipped (suppressed, not sent). This prevents irrelevant nudges.

```typescript
// src/lib/scheduler/handlers/progressive-email.ts
registerActionHandler("send_progressive_email", async (params) => {
  const { listingId, accountId, template, path } = params
  const listing = await getListingWithRelations(listingId)

  // Skip if listing no longer active (archived, suspended)
  if (listing.lifecycleStatus !== "active") return

  // Skip if target action already completed
  if (isProgressiveActionComplete(listing, template)) return

  await emailService.send({
    to: listing.account.email,  // from auth user table
    template,
    data: buildProgressiveEmailData(listing, path),
    category: "profile_nudge",
    accountId,
  })
})
```

### 7.2 Claim Path (Path C)

Claim path uses different messaging — references existing data, not empty fields. [Source: PP concept design §4.6 [PP-25]]

```typescript
async function scheduleClaimProgressiveDisclosure(
  listingId: UUID,
  accountId: UUID,
): Promise<void> {
  const now = new Date()

  // Claim path uses the same template IDs but with path = "claim"
  // Template renderer branches on path to produce different copy:
  // - Standard: "Add your bio for better visibility"
  // - Claim: "The bio was imported — update it in your own words"

  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day1", path: "claim" },
    executeAt: addHours(now, 24),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding_claim",
  })

  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day3", path: "claim" },
    executeAt: addHours(now, 72),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding_claim",
  })

  await scheduleDeferredAction({
    action: "send_progressive_email",
    params: { listingId, accountId, template: "profile_day7", path: "claim" },
    executeAt: addHours(now, 168),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "onboarding_claim",
  })
}
```

### 7.3 In-App Progressive Prompts

Day 0 and Day 14 prompts are in-app (not email). Implemented as notifications via S0 §9.

```typescript
// Day 0: immediate notification after listing creation
await createNotification({
  accountId,
  type: "onboarding_prompt",
  title: path === "claim"
    ? "You've claimed your listing — review your imported data."
    : "Your listing is live! Here's what to do next.",
  body: buildDay0Body(profileStrength),
  link: `/dashboard/listing/${listingId}/edit`,
})
```

**Day 14 scheduling:** Added to `scheduleProgressiveDisclosure` (§7.1) and `scheduleClaimProgressiveDisclosure` (§7.2):

```typescript
// Day 14: in-app prompt (added to both scheduleProgressiveDisclosure and scheduleClaimProgressiveDisclosure)
await scheduleDeferredAction({
  action: "onboarding_day14_prompt",
  params: { listingId, accountId },
  executeAt: addHours(now, 336),   // 14 days
  retryPolicy: "once",
  onFailure: "log",
  createdBy: "onboarding",
})
```

### 7.4 Day 14 Prompt Handler [S2-ST-2]

```typescript
registerActionHandler("onboarding_day14_prompt", async (params) => {
  const { listingId, accountId } = params
  const listing = await getListingWithRelations(listingId)

  // Skip if listing no longer active
  if (listing.lifecycleStatus !== "active") return

  // Skip if profile already strong
  const strength = computeProfileStrength(listing)  // uses fallback at S2
  if (strength.percentage >= 80) return

  await createNotification({
    accountId,
    type: "onboarding_prompt",
    title: "Your listing could be performing better",
    body: `Your profile is ${strength.percentage}% complete. ${strength.nextActions[0]?.label ?? "Add more details"} to improve your visibility.`,
    link: `/dashboard/listing/${listingId}/edit`,
  })
})
```

---

## 8. Profile Strength Meter

### 8.1 Computation

Maps D&L `qualityScore.completeness` (0–25) to a 0–100% display. PP owns the UI mapping; D&L owns the score. [Source: PP concept design §4.6]

```typescript
// src/domains/platform/profile-strength.ts
function computeProfileStrength(listing: ListingWithQualityScore): ProfileStrength {
  const completeness = listing.qualityScores.completeness  // 0–25, from S1 §1.4
  const percentage = Math.round((completeness / 25) * 100)

  const level: ProfileStrengthLevel =
    percentage <= 20 ? "Getting Started" :
    percentage <= 40 ? "Basic" :
    percentage <= 60 ? "Good" :
    percentage <= 80 ? "Strong" :
    "Excellent"

  const nextActions = identifyMissingFields(listing)
    .sort((a, b) => b.completenessWeight - a.completenessWeight)
    .slice(0, 3)
    .map(field => ({
      field: field.fieldId,
      label: `Add ${field.displayName}`,
      impactEstimate: `+${field.completenessWeight}pp profile strength`,  // percentage points [S2-ST-8]
      timeEstimate: field.estimatedTime,
    }))

  return {
    percentage,
    level,
    nextActions,
    searchVisibilityNote: percentage < 60
      ? "Profiles above 60% appear in 3x more search results"
      : "Your profile is performing well in search",
  }
}
```

### 8.2 Missing Field Identification

PP-owned function. Sources field definitions from D&L quality score explanation. [Source: PP concept design §4.6 [XP-4]]

```typescript
// src/domains/platform/profile-strength.ts
const FIELD_DISPLAY_MAP: Record<string, string> = {
  missing_headline: "a headline",
  missing_bio: "a bio or description",
  missing_headshot: "a profile photo",
  missing_logo: "your company logo",
  missing_credits: "professional credits",
  missing_portfolio: "portfolio work",
  missing_social_links: "social profiles",
  missing_contact_email: "a contact email",
  missing_website: "your website",
  // Extended as S9 adds quality score factors
}

// Weights are percentage-point estimates (how much the 0–100% bar moves when field is added).
// Completeness is 0–25 points; display is 0–100%. A 5-point completeness gain = +20pp.
// These values are approximate and calibrated for the fallback field-presence check.
// S9 replaces with data-driven weights from quality score explanations. [S2-ST-8]
const FIELD_WEIGHT_MAP: Record<string, number> = {
  missing_headline: 8,
  missing_bio: 12,
  missing_headshot: 8,
  missing_logo: 8,
  missing_credits: 10,
  missing_portfolio: 10,
  missing_social_links: 4,
  missing_contact_email: 6,
  missing_website: 4,
}

const FIELD_TIME_MAP: Record<string, string> = {
  missing_headline: "~1 minute",
  missing_bio: "~3 minutes",
  missing_headshot: "~2 minutes",
  missing_logo: "~2 minutes",
  missing_credits: "~5 minutes",
  missing_portfolio: "~5 minutes",
  missing_social_links: "~1 minute",
  missing_contact_email: "~1 minute",
  missing_website: "~1 minute",
}

function identifyMissingFields(listing: ListingWithQualityScore): MissingField[] {
  const explanation = listing.qualityScoreExplanations?.explanation
  if (!explanation) return []

  const completeness = explanation.dimensions?.find(d => d.name === "completeness")
  if (!completeness) return []

  return completeness.factors
    .filter(f => f.impact === "negative")
    .map(f => ({
      fieldId: f.factor,
      displayName: FIELD_DISPLAY_MAP[f.factor] ?? f.factor,
      completenessWeight: FIELD_WEIGHT_MAP[f.factor] ?? 2,
      estimatedTime: FIELD_TIME_MAP[f.factor] ?? "~2 minutes",
    }))
}
```

**Dependency note:** `identifyMissingFields` depends on `quality_score_explanations` being populated. At S2, quality scoring algorithms are not yet implemented (S9). The two-phase creation pattern (S1 §10) initialises quality scores to zero. Until S9 provides real scoring, the profile strength meter uses a fallback: direct field presence checks on the listing record.

```typescript
// Fallback until S9 provides real quality score explanations
function identifyMissingFieldsFallback(listing: Listing): MissingField[] {
  const missing: MissingField[] = []
  if (!listing.headline) missing.push({ fieldId: "missing_headline", ...defaults })
  if (!listing.bio) missing.push({ fieldId: "missing_bio", ...defaults })
  if (!listing.headshotUrl && listing.entityType === "freelancer")
    missing.push({ fieldId: "missing_headshot", ...defaults })
  if (!listing.logoUrl && listing.entityType !== "freelancer")
    missing.push({ fieldId: "missing_logo", ...defaults })
  // ... remaining field checks
  return missing
}
```

### 8.3 tRPC Route

```typescript
// src/server/routers/profile-strength.ts
export const profileStrengthRouter = router({
  get: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      // Return computeProfileStrength(listing) or fallback
    }),
})
```

---

## 9. Intelligent Taxonomy Suggestions

Rule-based system at V1. [Source: PP concept design §4.5]

### 9.1 Suggestion Map

```typescript
// src/domains/platform/suggestions.ts
type SuggestionRule = {
  trigger: { sectorSlug: string; serviceAreaSlug: string }
  suggestions: { specialisationSlug: string; confidence: number; reasoning: string }[]
}

const SUGGESTION_MAP: SuggestionRule[] = [
  // Camera
  {
    trigger: { sectorSlug: "camera", serviceAreaSlug: "director-of-photography" },
    suggestions: [
      { specialisationSlug: "drone-operation", confidence: 0.8, reasoning: "80% of DPs also list Drone Operation" },
      { specialisationSlug: "steadicam", confidence: 0.8, reasoning: "Common secondary skill for DPs" },
      { specialisationSlug: "lighting-camera", confidence: 0.8, reasoning: "Frequently paired with DP work" },
    ],
  },
  {
    trigger: { sectorSlug: "camera", serviceAreaSlug: "camera-operator" },
    suggestions: [
      { specialisationSlug: "drone-operation", confidence: 0.7, reasoning: "Growing demand for drone-certified operators" },
      { specialisationSlug: "jimmy-jib", confidence: 0.7, reasoning: "Common specialist equipment skill" },
      { specialisationSlug: "underwater-camera", confidence: 0.7, reasoning: "Niche but highly valued" },
    ],
  },
  // Post-Production
  {
    trigger: { sectorSlug: "post-production", serviceAreaSlug: "offline-editor" },
    suggestions: [
      { specialisationSlug: "online-editing", confidence: 0.6, reasoning: "Many editors work across both stages" },
      { specialisationSlug: "colour-grading", confidence: 0.6, reasoning: "Expanding skillset for editors" },
    ],
  },
  {
    trigger: { sectorSlug: "post-production", serviceAreaSlug: "colourist" },
    suggestions: [
      { specialisationSlug: "online-editing", confidence: 0.7, reasoning: "Often paired with colour work" },
      { specialisationSlug: "hdr-mastering", confidence: 0.7, reasoning: "Growing broadcast requirement" },
    ],
  },
  // Sound
  {
    trigger: { sectorSlug: "sound", serviceAreaSlug: "sound-recordist" },
    suggestions: [
      { specialisationSlug: "boom-operator", confidence: 0.8, reasoning: "Core on-set sound team role" },
      { specialisationSlug: "sound-mixer", confidence: 0.8, reasoning: "Natural progression from recordist" },
    ],
  },
]
```

### 9.2 Suggestion Query

```typescript
function getSuggestions(selectedTags: TaxonomyTag[]): SuggestionResult[] {
  const results: SuggestionResult[] = []

  for (const tag of selectedTags) {
    const matchingRules = SUGGESTION_MAP.filter(
      r => r.trigger.sectorSlug === tag.sectorSlug && r.trigger.serviceAreaSlug === tag.serviceAreaSlug,
    )
    for (const rule of matchingRules) {
      for (const suggestion of rule.suggestions) {
        // Exclude already-selected tags
        if (selectedTags.some(t => t.specialisationSlug === suggestion.specialisationSlug)) continue
        results.push({
          ...suggestion,
          triggerTag: tag,
        })
      }
    }
  }

  // Deduplicate and sort by confidence, return top 5
  return deduplicateBySlug(results)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
}
```

### 9.3 Generic Fallback

Sectors not in the curated map use a data-driven fallback once listings exist:

```typescript
// Generic fallback: "Providers in [sector] commonly also list: [top 5 service areas by listing count]"
async function getGenericSuggestions(sectorId: number): Promise<GenericSuggestion[]> {
  // SELECT service_area_id, COUNT(*) as listing_count
  // FROM listing_taxonomy_tags WHERE sector_id = $1
  // GROUP BY service_area_id ORDER BY listing_count DESC LIMIT 5
  // Returns top 5 service areas by usage within the sector
}
```

At launch (pre-listings), generic fallback returns empty. Populates as listings are created.

### 9.4 UX Guard

Suggestions are labelled "Providers like you commonly offer these" — not "You should add these." Provider makes the decision. Suggestions are additive only (presented as chips/buttons to add, never auto-selected).

---

## 10. Email Templates Registered in S2

S2 registers 7 templates with S0's email template registry (S0 §6.2). Each slice registers its templates during module init.

| Template ID | Trigger | Category | Unsubscribable | Owner |
|---|---|---|---|---|
| `welcome` | Post-email-verification | Transactional | No | PP |
| `listing_live` | Listing published (user-initiated only, NOT seed import [PP-ST-20]) | Transactional | No | PP |
| `profile_day1` | Day 1 deferred action | Profile nudge | Yes | PP |
| `profile_day3` | Day 3 deferred action | Profile nudge | Yes | PP |
| `profile_day7` | Day 7 deferred action | Profile nudge | Yes | PP |
| `article_14_notice` | 4rfv seed import Phase 5 | Transactional | No | Ops |
| `enquiry_forwarded` | Unclaimed listing enquiry + claim CTA | Enquiry notification | Yes | PP |

**`listing_live` suppression:** Seed import listings (where `source = '4rfv_import'`) do NOT trigger `listing_live` email. Seed data uses `article_14_notice` for GDPR notification. [Source: PP-ST-20]

**`enquiry_forwarded` trigger [S2-ST-5]:** This template is registered in S2 but not triggered by S2 code. Two trigger paths exist, both deferred: (1) On claim approval, `deliverPendingEnquiries` (§5.3, stub in S2, implemented S3/S6) sends batched `enquiry_forwarded` emails for queued enquiries. (2) For unclaimed listings with a `contactEmail`, new enquiries could be forwarded directly with a claim CTA — this path is deferred to S6 (buyer experience). S2 registers the template so that S3/S6 can use it without a migration.

---

## 11. Article 14 On-Page Notice

Listings without contact email receive an on-page transparency notice instead of email. [Source: Art 14(5)(b)]

### 11.1 Schema Addition

```typescript
// Migration: add article_14_notice_displayed column to listings
article14NoticeDisplayed: boolean("article_14_notice_displayed").notNull().default(false),
```

### 11.2 Rendering

Unclaimed listings where `article14NoticeDisplayed = true` AND `source = '4rfv_import'` display a banner:

> **About this listing:** This listing was created from publicly available industry records. [Data controller] holds the following data: [categories]. You have the right to access, rectify, erase, restrict, or object to this data. [Learn more] | [Claim this listing] | [Request removal]

The banner is rendered as part of the listing profile page (SSG/ISR). It is removed when the claim is approved — S3's `claim_approved` handler sets `article14NoticeDisplayed = false`. The banner persists during `claimStatus = "pending_review"` because the claim has not yet been verified. [S2-ST-6]

---

## 12. Deferred Actions Registered in S2

S2 registers 4 action handlers with S0's deferred action scheduler (S0 §3). [S2-ST-1, S2-ST-2]

| Action | Handler | Retry | On Failure | Schedule |
|---|---|---|---|---|
| `send_progressive_email` | Send profile nudge email (§7.1) | `once` | `log` | Day 1, 3, 7 per listing creation |
| `onboarding_day14_prompt` | In-app notification if profile <80% (§7.4) | `once` | `log` | Day 14 per listing creation |
| `pre_claim_snapshot_cleanup` | Delete pre-claim snapshot (§5.1) | `retry_3` | `log` | 90 days after claim submission |
| `article_14_progress_check` | Check Article 14 send progress, alert if behind (§6.5) | `once` | `alert_principal` | Daily, self-perpetuating |

**`DeferredActionParamsMap` extension:**

```typescript
// Added to S0's DeferredActionParamsMap
send_progressive_email: {
  listingId: UUID
  accountId: UUID
  template: "profile_day1" | "profile_day3" | "profile_day7"
  path: "freelancer" | "company" | "claim"
}
onboarding_day14_prompt: {
  listingId: UUID
  accountId: UUID
}
pre_claim_snapshot_cleanup: {
  listingId: UUID        // pre_claim_snapshots PK is listingId, not claimId [S2-ST-1]
}
article_14_progress_check: {
  importBatchId: string
  importDate: ISO8601
}
```

**`pre_claim_snapshot_cleanup` handler [S2-ST-1]:**

```typescript
registerActionHandler("pre_claim_snapshot_cleanup", async (params) => {
  const { listingId } = params
  // DELETE FROM pre_claim_snapshots WHERE listing_id = $1
  // No-op if snapshot already deleted (idempotent)
})
```

**Note:** SI §2.2 defines `delete_claim_snapshot` with `{ claimId: UUID }` for S3's claim resolution path. S2's `pre_claim_snapshot_cleanup` is distinct — it handles the 90-day TTL cleanup independent of claim outcome. S3 may cancel this deferred action if the claim resolves earlier.

---

## 13. Open Question Interactions

### NotificationType Extension [S2-ST-15]

S2 extends the `NotificationType` union (SI §8.1) with `"onboarding_prompt"`. This covers Day 0 immediate notifications and Day 14 deferred notifications. SI §8.1 documents the union as extensible per slice.

### PP-Q1: Component Library (partial resolution)

S2 is the first slice producing user-facing pages. S2 establishes the UI component convention but does not fully resolve PP-Q1. S2 uses:
- Form components: multi-step wizard, field validation, progress indicator
- Taxonomy selector: hierarchical multi-select with search
- Profile strength meter: progress bar with action items

PP-Q1 full resolution deferred to S5 (provider dashboard — the largest UI surface).

---

## 14. Acceptance Criteria

### Account Creation (5)

| # | Criterion | Test |
|---|---|---|
| AC-01 | Signup creates Better Auth user + `account_profiles` row with default email preferences | Integration |
| AC-02 | Email verification sends `email_verification` template, account browsable before verification | E2E |
| AC-03 | Personalisation step stores departments array on account profile; skippable | Integration |
| AC-04 | Anonymous enquiry retroactive linking: signup with email matching `enquiry_records.sender_email` updates `sender_account_id` | Integration |
| AC-05 | Listing creation blocked for unverified email (returns FORBIDDEN) | Integration |

### Freelancer Path (5)

| # | Criterion | Test |
|---|---|---|
| AC-06 | Freelancer listing created with correct defaults: `entityType = "freelancer"`, `claimStatus = "claimed"`, `verificationTier = "claimed"`, `subscriptionTier = "free"` | Integration |
| AC-07 | Integrity checks run before creation; `flag_for_review` blocks listing and returns reason | Integration |
| AC-08 | `listing_created` event emitted after successful creation | Integration |
| AC-09 | Progressive disclosure deferred actions scheduled: Day 1, 3, 7 | Integration |
| AC-10 | `listing_live` email sent after creation | Integration |

### Company Path (5)

| # | Criterion | Test |
|---|---|---|
| AC-11 | Company listing created with correct entity type and taxonomy tags (min 1) | Integration |
| AC-12 | Companies House lookup returns company data for auto-population | Integration |
| AC-13 | CH number for dissolved company shows warning in UI | E2E |
| AC-14 | Full integrity pipeline runs: duplicate check, identity verification, CH uniqueness | Integration |
| AC-15 | Flagged company listing created with `lifecycleStatus = "suspended"`, `claimStatus = "pending_review"`; provider receives "being reviewed" response [S2-ST-13] | Integration |

### Claim Path (7) [S2-ST-1, S2-ST-14, S2-ST-17]

| # | Criterion | Test |
|---|---|---|
| AC-16 | Claim form pre-populates with existing listing data; profile strength uses fallback [S2-ST-10] | E2E |
| AC-17 | Endowment messaging: shows view count when ≥ 5 views, category-level when < 5 | Integration |
| AC-18 | Pre-claim snapshot created and stored; includes provider edits (held, not applied) [S2-ST-14] | Integration |
| AC-19 | Claim submission sets `claimStatus = "pending_review"` (S2 stub; S3 provides full logic) | Integration |
| AC-20 | Claim-path progressive disclosure NOT scheduled at submission — deferred to S3 `claim_approved` handler [S2-ST-17] | Integration |
| AC-21 | `pre_claim_snapshot_cleanup` deferred action scheduled (90 days) with correct `listingId` param [S2-ST-1] | Integration |
| AC-45 | `pre_claim_snapshot_cleanup` handler deletes snapshot; idempotent if already deleted | Integration |

### 4rfv Import (9) [S2-ST-3, S2-ST-4]

| # | Criterion | Test |
|---|---|---|
| AC-22 | Phase 1: automated cleaning normalises postcodes, emails, URLs; flags invalid records | Integration |
| AC-23 | Phase 2: CH batch verification identifies dissolved companies | Integration |
| AC-24 | Batch integrity: intra-batch deduplication clusters by name similarity (>0.9) and CH number | Integration |
| AC-25 | Non-flagged records committed with `claimStatus = "unclaimed"`, `source = "4rfv_import"` | Integration |
| AC-26 | `listing_live` email NOT sent for seed import listings | Integration |
| AC-46 | Import pipeline creates one-to-one rows (verification, quality_scores, quality_score_explanations, engagements) per listing [S2-ST-4] | Integration |
| AC-47 | Import pipeline does NOT emit `listing_created` events (accountId is null, violates type) [S2-ST-3] | Integration |
| AC-27 | Phase 5: Article 14 email sent to all listings with contact email | Integration |
| AC-28 | Phase 5: On-page Article 14 notice added for listings without email | Integration |

### Profile Strength (3)

| # | Criterion | Test |
|---|---|---|
| AC-29 | Profile strength computed from quality score completeness dimension (0–25 → 0–100%) | Unit |
| AC-30 | Missing field identification returns ranked actions with impact estimates | Unit |
| AC-31 | Fallback field-presence check works when quality score explanations absent (pre-S9) | Unit |

### Progressive Disclosure (6) [S2-ST-2]

| # | Criterion | Test |
|---|---|---|
| AC-32 | `send_progressive_email` handler skips email if target action already complete | Integration |
| AC-33 | `send_progressive_email` handler skips email if listing no longer active | Integration |
| AC-34 | Day 14 in-app notification created only if profile strength < 80% | Integration |
| AC-35 | Email preference unsubscribe for `profile_nudge` suppresses progressive emails | Integration |
| AC-48 | `onboarding_day14_prompt` handler creates notification only if profile strength < 80%; skips if listing inactive [S2-ST-2] | Integration |
| AC-49 | Day 14 deferred action scheduled during `scheduleProgressiveDisclosure` (Paths A+B) [S2-ST-2] | Integration |

### Suggestions (3)

| # | Criterion | Test |
|---|---|---|
| AC-36 | Curated suggestions return for Camera, Post-Production, Sound sectors | Unit |
| AC-37 | Suggestions exclude already-selected tags | Unit |
| AC-38 | Generic fallback returns top 5 service areas by listing count (empty when no listings) | Integration |

### Image Processing (4) [S2-ST-18]

| # | Criterion | Test |
|---|---|---|
| AC-39 | Image upload generates 3 WebP variants (150px, 400px, 1200px) | Integration |
| AC-40 | Variant URLs follow deterministic naming convention | Unit |
| AC-41 | Original image preserved in R2 for admin access | Integration |
| AC-50 | Variant generation failure: `media_items.url` falls back to original URL; error logged [S2-ST-18] | Integration |

### Article 14 Compliance (3) [S2-ST-11]

| # | Criterion | Test |
|---|---|---|
| AC-42 | `article_14_progress_check` deferred action alerts principal if <80% sent by day 20 | Integration |
| AC-43 | Claiming a 4rfv listing removes on-page Article 14 notice (`article14NoticeDisplayed = false`) on claim approval (not on submission) [S2-ST-6] | Integration |
| AC-44 | `article_14_progress_check` correctly computes days elapsed since `importDate` and percentage sent vs total | Integration |

---

## 15. Downstream Flags

| # | Flag | Target Slice | Source |
|---|---|---|---|
| S2-1 | Claim evaluation logic (`evaluateClaim`, auto-approve/reject, competing claims, manual review routing) — S2 stubs with `pending_review` for all claims. S3 provides full logic. | S3 | S2/S3 boundary |
| S2-2 | `deliverPendingEnquiries` stub registered in S2. Full implementation (actual email delivery of queued enquiries to new claimant) in S3 or S6. | S3/S6 | S1-10 |
| S2-3 | Profile strength meter depends on S9 quality score explanations for `identifyMissingFields`. S2 uses fallback field-presence check. S9 wires real scoring. | S9 | S2/S9 boundary |
| S2-4 | Generic taxonomy suggestions (non-curated sectors) require listing data to populate. Empty at launch. Data-driven once sufficient listings exist. | S9 | PP §4.5 |
| S2-5 | Image variant generation may need CDN cache purge on image replacement. V1 uses content-addressed filenames (no purge needed). If filename reuse introduced, add purge. | S5 | PP §4.3 |
| S2-6 | 4rfv import Phase 3 (manual cleaning) requires Operations TaskSpec and contractor procurement — specified in Ops §6, implemented in S7. S2 provides the export script (`phase-3-export.ts`). S7 provides the admin UI and task routing. | S7 | Ops §6 Phase 3 |
| S2-7 | Companies House API rate limit (600 req/5min) may require batch throttling for Phase 2. S2 uses 500ms delay. If import scale increases, add queue. | N/A | Ops §6 Phase 2 |
| S2-8 | Claim-path progressive disclosure (`scheduleClaimProgressiveDisclosure`) is defined in S2 but invoked by S3's `claim_approved` handler. S3 must import and call it. [S2-ST-17] | S3 | S2/S3 boundary |
| S2-9 | Claim edits stored in pre-claim snapshot, applied by S3 on approval, discarded on rejection. S3 must read edits from snapshot and apply. [S2-ST-14] | S3 | S2/S3 boundary |
| S2-10 | `ListingCreatedEvent.accountId` is `UUID` (not nullable). If future requirements need import-created listings to emit `listing_created`, the payload type must be changed to `UUID | null` — cross-domain contract change. [S2-ST-3] | N/A | PP §1.6 |

---

## 16. Stress Test Resolution Log (v2)

20 scenarios targeting S2 implementation delta against upstream specs (SI v3, D&L v3, Ops v3, PP v3, S0 v2, S1 v2). 3 High, 8 Medium, 5 Low, 4 Pass. 16 fixes applied. 43→50 acceptance criteria. 7→10 downstream flags.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| S2-ST-1 | `DeferredActionParamsMap` missing `pre_claim_snapshot_cleanup`. §5.1 schedules 90-day snapshot cleanup but no action/handler in §12. SI §2.2 `delete_claim_snapshot` uses `claimId` but snapshots are keyed by `listingId`. | **High** | Fixed. New `pre_claim_snapshot_cleanup` action added to §12 with `{ listingId: UUID }` params. Handler documented. Distinct from SI's `delete_claim_snapshot` (S3's claim resolution path). |
| S2-ST-2 | `onboarding_day14_prompt` handler not implemented. Registered in §12 but no handler code, no scheduling call in progressive disclosure functions. | **High** | Fixed. §7.4 added: handler with profile strength check + inactive listing guard. Scheduling call added to §7.1 and §7.2. AC-48, AC-49 added. |
| S2-ST-3 | Import pipeline emits `listing_created` but `ListingCreatedEvent.accountId` is `UUID` (non-nullable) and imports have `accountId = null`. Type violation. | **High** | Fixed. §6.7 documents: import pipeline does NOT emit `listing_created`. Search vector trigger handles indexing. S2-10 downstream flag added for future contract change if needed. AC-47 added. |
| S2-ST-4 | Import pipeline does not create one-to-one rows (verification, quality_scores, quality_score_explanations, engagements). Breaks downstream queries. | **Medium** | Fixed. §6.7 documents two-phase pattern for imports: all one-to-one rows created in same transaction. AC-46 added. |
| S2-ST-5 | `enquiry_forwarded` template registered but no trigger documented in S2. | **Medium** | Fixed. §10 note added: template registered for S3/S6 use. Two trigger paths documented (claim approval delivery, unclaimed listing forwarding). Both deferred. |
| S2-ST-6 | Article 14 banner during `pending_review` — should it persist? AC-43 implies removal on claim but S2 stub sets `pending_review`, not `claimed`. | **Medium** | Fixed. §11.2 updated: banner removed on claim approval (S3 handler), not submission. AC-43 wording updated. |
| S2-ST-7 | `sharp` native module may exceed Vercel function size limit (50MB). | **Low** | Fixed. §4.3 deployment note added: use Next.js built-in sharp, `waitUntil()` for background processing, or Cloudflare Image Transformations as fallback. |
| S2-ST-8 | Profile strength `FIELD_WEIGHT_MAP` values are percentage points but `impactEstimate` displays as `+X%` — misleading when raw completeness is 0–25. | **Medium** | Fixed. Comment clarifies weights are percentage-point estimates. Display changed to `+Xpp profile strength`. |
| S2-ST-9 | `addHours` utility not defined. | **Low** | Pass. Standard `date-fns` utility. Implementation detail. |
| S2-ST-10 | `getClaimContext` returns profile strength from quality scores, but import listings have zero-initialised scores. Returns 0% always. | **Medium** | Fixed. §5.1 step 4 updated: uses fallback field-presence check for claim context. |
| S2-ST-11 | No AC for Article 14 deadline computation accuracy. | **Low** | Fixed. AC-44 added: progress check correctly computes days elapsed and percentage sent. |
| S2-ST-12 | Resend free tier (100 emails/day) insufficient for ~3,000 Article 14 emails in 30-day window. | **Medium** | Fixed. §6.5 rate limit note updated: Resend Pro required for batch. Daily batch strategy (150/day over 20 days) documented. |
| S2-ST-13 | `createCompany` step 3 says "Listing NOT created" for flagged records, but AC-15 says "enters review queue". Contradictory. | **Medium** | Fixed. §4.1 step 3 updated: listing created with `lifecycleStatus = "suspended"`, `claimStatus = "pending_review"`. Not searchable but exists. AC-15 updated. |
| S2-ST-14 | `submitClaim` applies edits in step 5 but claim may be rejected. Rejected claim leaves modified unclaimed listing. | **Medium** | Fixed. §5.1 steps reordered: edits stored in snapshot, NOT applied to listing. S3 applies on approval, discards on rejection. S2-9 downstream flag added. AC-18 updated. |
| S2-ST-15 | `"onboarding_prompt"` notification type not in SI §8.1 `NotificationType` union. | **Low** | Fixed. §13 note added: S2 extends `NotificationType` with `"onboarding_prompt"` per SI extensibility pattern. |
| S2-ST-16 | `batchImportIntegrity` implies O(n²) cross-join for name similarity. Impractical for ~4,700 records. | **Low** | Fixed. §6.4 documents sorted-neighbour sliding window (window size 10, ~47K comparisons). |
| S2-ST-17 | Claim progressive disclosure scheduled during `submitClaim` but claim is `pending_review` — provider has no dashboard. Premature. | **Medium** | Fixed. §5.1 step 7 removed. S2/S3 boundary note updated: scheduling deferred to S3's `claim_approved` handler. S2-8 downstream flag added. AC-20 updated. |
| S2-ST-18 | No fallback for image variant generation failure. | **Low** | Fixed. §4.3 note added: fallback to original URL on failure, error logged. AC-50 added. |
| S2-ST-19 | Cross-reference cites `TIER_LIMITS` import but S2 does not consume it directly (S1 does). | **Low** | Pass. Cross-reference is inherited context, not incorrect. |
| S2-ST-20 | `deliverPendingEnquiries` flow correctness — PP looks up own enquiry records by PP's enquiryId. | Pass | Pass. Flow is correct per S1-ST-3 and S1-10. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `interfaces/platform-and-product.md` (v3) | 9 emitted events (S2 exercises `listing_created`, `profile_edited` via creation flow), email templates (§4 — S2 registers 7 of 23), account closure (not S2 scope) |
| `interfaces/data-and-listings.md` (v3) | Integrity rules consumed (§3.1 `computeTaxonomyOverlap`, claim-related events), `listing_created` emission |
| `interfaces/operations.md` (v3) | Article 14 compliance, `listing_created` consumer (Ops increment counter) |
| `interfaces/shared-infrastructure.md` (v3) | Email transport (§5 — template registration, preference enforcement), deferred actions (§2 — progressive disclosure scheduling), auth (§4 — signup flow), R2 (§6 — image pipeline), rendering (§7 — SSG/ISR pages) |
| `interfaces/commercial-and-revenue.md` (v2) | `TIER_LIMITS` import for media upload limits during creation (P4) |
| `2-concept-design/platform-and-product.md` (v5 §4) | Onboarding paths, field validation, image processing, progressive disclosure, profile strength, suggestions |
| `2-concept-design/operations.md` (v6 §5–§6) | Article 14 obligation, 4rfv import pipeline |
| `2-concept-design/data-and-listings.md` (v6 §4) | Batch import integrity mode |
| `slices/slice-00-infrastructure.md` (v2) | S0 §2 (event bus), §3 (scheduler — progressive disclosure), §5 (auth), §6 (email transport), §7 (R2), §8 (rendering), §9 (notifications) |
| `slices/slice-01-data-model.md` (v2) | S1 §1 (listing schema), §2 (account profiles), §3 (search), §4 (CRUD routes — S2 extends), §5 (image pipeline — S2 wraps with variant generation), §6 (integrity rules), §8 (taxonomy seed — prerequisite for S2 import) |
