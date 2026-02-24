# Slice 5: Provider Experience

**Status:** Draft v2 — v1 + 12 stress test fixes (6 High, 4 Medium, 2 Low).
**Primary Owner:** Platform & Product
**Last updated:** 2026-02-14
**Dependencies:** S0 (event bus, scheduler, auth, email transport, notifications, service abstraction, tRPC, decision logging), S1 (Listing schema, engagement counters, quality scores, media, credits, taxonomy, verification, search), S3 (claim evaluation, claim_approved post-processing, verification tiers), S4 (subscriptions, feature gating middleware, computeFeatureAccess, TIER_LIMITS, applyDowngrade, restoreHiddenItems, pricing page)
**Inputs:** `interfaces/platform-and-product.md` (v6), `interfaces/data-and-listings.md` (v5), `interfaces/commercial-and-revenue.md` (v3), `interfaces/shared-infrastructure.md` (v8), `2-concept-design/platform-and-product.md` (v5 §6), `2-concept-design/data-and-listings.md` (v6 §1, §3), `2-concept-design/commercial-and-revenue.md` (v4 §4), `slices/slice-01-data-model.md` (v2), `slices/slice-02-onboarding.md` (v2), `slices/slice-03-claim-verify.md` (v2), `slices/slice-04-subscriptions.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S6 (Buyer Experience), S7 (Operations), S8 (Commercial), S9 (Entity Intelligence)

---

## Summary

S5 builds the provider dashboard — the primary interface through which claimed listing owners manage their presence, monitor performance, respond to enquiries, and manage their subscription. S5 does not introduce new domain logic; it surfaces data and actions already specified in S1–S4 through a unified dashboard experience with tier-gated analytics, multi-listing switching, quality score transparency, notification management, enquiry response tracking, and account settings (including closure initiation).

**Domain ownership:** Platform & Product owns all routes, components, and page rendering. Data reads come from D&L (engagement counters, quality scores via query interfaces), CR (feature access via `computeFeatureAccess`), and S4's `getSubscriptionStatus`. No new events are emitted — S5 reuses existing emission points (profile editing emits `profile_edited` via S1 routes, enquiry response emits `enquiry_responded` via S1 routes).

**Key constraint:** The provider dashboard is the largest UI surface in the application. PP-Q1 (component library / design system choice) should be resolved before S5 implementation begins. PP-Q5 (analytics / product metrics tooling) should be resolved for provider analytics display. Both are tracked as open questions in the requirements tracker.

## V1 Scope Boundary

**In scope:** Provider dashboard layout with listing context, multi-listing switcher (overview + detail views), analytics display (tier-gated: free = all-time totals, standard = 30d trends + top search terms, premium = 90d trends + viewer demographics + competitor benchmarking + enquiry response insights), quality score transparency panel (5 dimensions + top 3 improvements), profile strength meter (from S2), enquiry inbox with response tracking, notification centre (unread count, dismiss, 50 max per account), subscription management panel (current tier, billing details, upgrade CTA, Paddle portal link), account settings (email preferences, account closure initiation), 90-day listing update reminder scheduling, profile editor enhancement (concurrent edit handling), feature gate UI rendering (`mapFeatureAccessToUI`).

**Deferred to later slices:** Churn intervention UI (S8 — CR evaluates triggers, S5 provides display surface but S8 populates data). Sponsored placement display (S8). Revenue perception dashboard (S8). Admin review UI (S7). Quality scoring algorithm implementation (S9 — S5 displays scores computed by S1's zero-initialised values until S9 calibrates). Decay response automation (S9). Competitor benchmarking computation (S9 — S5 provides the UI panel gated by tier, but the data pipeline is S9). Viewer demographics computation (S9). Enrichment scheduling (S9).

---

## 1. Dashboard Routes

### 1.1 Route Structure

```
src/app/dashboard/
├── layout.tsx                     ← auth guard + listing context provider
├── page.tsx                       ← overview: all listings as cards
├── listings/
│   └── [listingId]/
│       ├── layout.tsx             ← listing-scoped layout + feature gate context
│       ├── page.tsx               ← listing detail: analytics + quality + enquiries
│       ├── edit/
│       │   └── page.tsx           ← profile editor (S2 form, S5 enhancements)
│       ├── enquiries/
│       │   └── page.tsx           ← enquiry inbox + response
│       ├── subscription/
│       │   └── page.tsx           ← subscription management + upgrade CTA
│       └── analytics/
│           └── page.tsx           ← full analytics view (tier-gated)
├── notifications/
│   └── page.tsx                   ← notification centre
└── settings/
    └── page.tsx                   ← email preferences + account closure
```

### 1.2 Auth Guard

All `/dashboard` routes require authenticated session. The layout wraps routes in a session check; unauthenticated requests redirect to `/login?redirect=/dashboard`.

```typescript
// src/app/dashboard/layout.tsx
export default async function DashboardLayout({ children }) {
  const session = await auth()
  if (!session) redirect("/login?redirect=/dashboard")

  return <DashboardShell session={session}>{children}</DashboardShell>
}
```

### 1.3 Listing Context Provider

Dashboard listing pages require ownership verification. The `[listingId]` layout loads the listing, verifies `listing.accountId === session.accountId`, and provides listing + feature access context to child routes.

```typescript
// src/app/dashboard/listings/[listingId]/layout.tsx
export default async function ListingLayout({ params, children }) {
  const session = await auth()
  const listing = await getListing(params.listingId)

  if (!listing || listing.accountId !== session.accountId) {
    notFound()
  }

  const featureAccess = computeFeatureAccess(listing.subscriptionTier)

  return (
    <ListingContext.Provider value={{ listing, featureAccess }}>
      {children}
    </ListingContext.Provider>
  )
}
```

---

## 2. Multi-Listing Management

[Source: PP concept design §6.2]

### 2.1 Overview Page

The dashboard root (`/dashboard`) displays all listings owned by the authenticated account as cards. Each card shows:

```typescript
type ListingCardData = {
  listingId: UUID
  name: string
  entityType: EntityType
  lifecycleStatus: LifecycleStatus
  subscriptionTier: SubscriptionTier
  verificationTier: VerificationTier
  profileViews: number       // all-time, from getEngagementCounters
  enquiriesReceived: number  // all-time
  profileStrength: number    // 0–100, S2 computation
}
```

**Loading strategy:** SQL join between `listings`, `engagements`, and `qualityScores` tables (all keyed by `listing_id`) for all owned listings. Profile strength computed from joined row. Single query, no per-listing function calls. Target: <500ms p95 for up to 50 listings per account. Analytics and enquiry details load on card selection (detail view).

**Archived listings** appear as greyed-out cards with a "Reactivate" button (calls S1's `listing.reactivate` mutation). Admin-suspended listings show "Suspended" badge with no reactivate action (FORBIDDEN guard from S1-ST-19).

**Empty state:** Account with no listings shows a CTA to create a listing (routes to S2 onboarding).

### 2.2 tRPC Route — Dashboard Overview

```typescript
// src/server/routers/dashboard.ts
export const dashboardRouter = router({
  getOverview: protectedProcedure
    .query(async ({ ctx }) => {
      // Single join query — no per-listing function calls [S5-ST-16]
      const rows = await db.select({
        listingId: listingsTable.id,
        name: listingsTable.name,
        entityType: listingsTable.entityType,
        lifecycleStatus: listingsTable.lifecycleStatus,
        subscriptionTier: listingsTable.subscriptionTier,
        verificationTier: listingsTable.verificationTier,
        profileViews: engagements.profileViews,
        enquiriesReceived: engagements.enquiriesReceived,
        qualityComposite: qualityScores.composite,
      })
        .from(listingsTable)
        .leftJoin(engagements, eq(engagements.listingId, listingsTable.id))
        .leftJoin(qualityScores, eq(qualityScores.listingId, listingsTable.id))
        .where(eq(listingsTable.accountId, ctx.session.accountId))

      const cards: ListingCardData[] = rows.map(row => ({
        ...row,
        profileViews: row.profileViews ?? 0,
        enquiriesReceived: row.enquiriesReceived ?? 0,
        profileStrength: computeProfileStrengthFromRow(row), // derived from joined columns
      }))

      const unreadCount = await getUnreadNotificationCount(ctx.session.accountId)

      return { cards, unreadCount }
    }),
})
```

---

## 3. Analytics Display

[Source: PP concept design §6.1, CR interface spec §4.1 (TIER_LIMITS), PP interface spec §2 (getListingAnalytics)]

### 3.1 Tier-Gated Analytics

Analytics display is the primary paid-tier differentiator. Feature access determines what data is rendered.

```typescript
// src/domains/platform/dashboard/map-analytics.ts

function mapAnalyticsToUI(
  tier: SubscriptionTier,
  counters: EngagementCounters,
  analytics: ListingAnalyticsSummary | null,
  featureAccess: FeatureAccess,
): AnalyticsDisplayData {
  const base: AnalyticsDisplayData = {
    // Free tier: all-time totals only (no time segmentation)
    totalProfileViews: counters.profileViews,
    totalSearchAppearances: counters.searchAppearances,
    totalEnquiriesReceived: counters.enquiriesReceived,
  }

  if (featureAccess.trendAnalytics !== "none" && analytics) {
    base.trendData = {
      period: analytics.period,
      views: analytics.views,
      searchAppearances: analytics.searchAppearances,
      enquiriesReceived: analytics.enquiriesReceived,
      viewsTrend: analytics.viewsTrend,
    }
  }

  if (featureAccess.topSearchTerms) {
    base.topSearchTerms = null // S5 provides UI panel; S9 provides data [S1-4]
  }

  if (featureAccess.viewerDemographics) {
    base.viewerDemographics = null // S5 provides UI panel; S9 provides data [S1-5]
  }

  if (featureAccess.competitorBenchmarking) {
    base.competitorBenchmarking = null // S5 provides UI panel; S9 provides data
  }

  if (featureAccess.enquiryResponseInsights) {
    base.enquiryResponseInsights = null // S5 provides UI panel; S9 computes from D&L + PP data [CR interface spec §5]
  }

  return base
}
```

**Tier summary:**

| Feature | Free | Standard | Premium/Partner |
|---|---|---|---|
| All-time totals (views, searches, enquiries) | Yes | Yes | Yes |
| 30-day trends | — | Yes | Yes |
| 90-day trends | — | — | Yes |
| Top search terms | — | Yes | Yes |
| Viewer demographics | — | — | Yes |
| Competitor benchmarking | — | — | Yes |
| Enquiry response insights | — | — | Yes |

**Upgrade CTA placement:** Free-tier analytics panel shows locked sections with "Upgrade to Standard" / "Upgrade to Premium" CTAs linking to the pricing page or S4 checkout flow.

### 3.2 tRPC Route — Listing Analytics

```typescript
// src/server/routers/dashboard.ts (continued)

  getListingDashboard: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      analyticsPeriod: z.enum(["7d", "30d", "90d"]).default("30d"),
    }))
    .query(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const featureAccess = computeFeatureAccess(listing.subscriptionTier)
      const counters = getEngagementCounters(input.listingId)

      // Only fetch time-series analytics if tier supports trends
      let analytics: ListingAnalyticsSummary | null = null
      if (featureAccess.trendAnalytics !== "none") {
        // Validate period against tier
        const maxPeriod = featureAccess.trendAnalytics // "30d" or "90d"
        const requestedPeriod = input.analyticsPeriod
        const effectivePeriod = comparePeriods(requestedPeriod, maxPeriod)
        analytics = await getListingAnalytics(input.listingId, effectivePeriod)
      }

      const qualityExplanation = await getQualityScoreExplanation(input.listingId)
      const profileStrength = await computeProfileStrength(input.listingId)
      const subscriptionStatus = await getSubscriptionStatus(ctx, input.listingId)

      return {
        analytics: mapAnalyticsToUI(listing.subscriptionTier, counters, analytics, featureAccess),
        quality: qualityExplanation,
        profileStrength,
        subscription: subscriptionStatus,
        featureAccess,
        listing: {
          id: listing.id,
          name: listing.name,
          entityType: listing.entityType,
          lifecycleStatus: listing.lifecycleStatus,
          verificationTier: listing.verificationTier,
          subscriptionTier: listing.subscriptionTier,
        },
      }
    }),
```

### 3.3 Period Validation

Standard tier gets 30-day max; Premium/Partner gets 90-day max. Free tier gets no time-series data.

```typescript
function comparePeriods(
  requested: "7d" | "30d" | "90d",
  max: "30d" | "90d",
): "7d" | "30d" | "90d" {
  const periodRank = { "7d": 1, "30d": 2, "90d": 3 } as const
  return periodRank[requested] <= periodRank[max] ? requested : max
}
```

---

## 4. Quality Score Transparency

[Source: PP concept design §6.3, D&L concept design §4b]

### 4.1 Quality Score Panel

Displays the D&L `QualityScoreExplanation` object. [Source: D&L interface spec §4]

Panel contents:
- **Composite score** (0–100) with visual indicator (progress ring or bar)
- **Dimension breakdown** (5 dimensions): completeness (0–25), freshness (0–25), accuracy (0–20), richness (0–15), verification (0–15). Each shows current score, max score, and factor list.
- **Top 3 improvements** ordered by impact estimate — each links to the relevant section of the profile editor (e.g., "Add 3 more portfolio images" → `/dashboard/listings/:id/edit#media`)
- **Methodology link** to published `/quality-methodology` page (static, SSG)

**Distinction from profile strength:** Quality score = overall listing performance (entity perception). Profile strength = field completeness only (provider self-service metric from S2 §7). Both display on the dashboard; they are complementary, not redundant.

### 4.2 tRPC Route — Quality Score

```typescript
  getQualityExplanation: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // QualityScoreExplanation from D&L — generated on quality score computation
      // S1 provides zero-initialised values; S9 provides calibrated scoring
      const explanation = await db.select()
        .from(qualityScoreExplanations)
        .where(eq(qualityScoreExplanations.listingId, input.listingId))
        .limit(1)

      return explanation[0] ?? null
    }),
```

### 4.3 Decay Warning Display

When PP consumes `decay_signal_detected` (high/critical severity), the dashboard displays a "may be outdated" warning banner on the affected listing. The warning links to the profile editor. The warning clears automatically when `quality_score_changed` arrives with `"freshness"` in `changedDimensions`.

```typescript
// S5 registers the UI state for decay warnings
// Already consumed by PP (interface spec §2) — S5 provides the rendering

type DecayWarningState = {
  listingId: UUID
  severity: "high" | "critical"
  signal: string
  detectedAt: ISO8601
  activeSupportTicket?: UUID
}
```

The warning is persisted as a notification (type `decay_warning`) via S0's notification system. Cleared by creating a replacement notification or by the `quality_score_changed` consumer removing the warning state.

---

## 5. Enquiry Management

[Source: PP concept design §5]

### 5.1 Enquiry Inbox

Displays all enquiries for the selected listing. Enquiries are stored in D&L's `enquiry_records` (buyer-sent) and `pending_enquiries` (unclaimed listing queue, delivered on claim approval by S3).

```typescript
// src/server/routers/enquiry.ts

export const enquiryRouter = router({
  getInbox: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      status: z.enum(["all", "unread", "responded", "stale"]).default("all"),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Query enquiry_records where listingId matches
      // Filter by status if not "all"
      // Order by createdAt DESC
      // Cursor-based pagination
      const enquiries = await db.select()
        .from(enquiryRecords)
        .where(and(
          eq(enquiryRecords.listingId, input.listingId),
          input.status !== "all"
            ? eq(enquiryRecords.status, input.status)
            : undefined,
        ))
        .orderBy(desc(enquiryRecords.createdAt))
        .limit(input.limit + 1) // +1 for cursor detection

      const hasMore = enquiries.length > input.limit
      const items = hasMore ? enquiries.slice(0, input.limit) : enquiries

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      }
    }),
```

### 5.2 Enquiry Response

Provider responds to an enquiry. Emits `enquiry_responded` event (PP-owned, already registered in S1 consumer table). Updates enquiry status to `"responded"`.

```typescript
  respondToEnquiry: protectedProcedure
    .input(z.object({
      enquiryId: z.string().uuid(),
      listingId: z.string().uuid(),
      responseMessage: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const enquiry = await db.select()
        .from(enquiryRecords)
        .where(and(
          eq(enquiryRecords.id, input.enquiryId),
          eq(enquiryRecords.listingId, input.listingId),
        ))
        .limit(1)

      if (enquiry.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" })
      }

      if (enquiry[0].status === "responded") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "already responded" })
      }

      const responseTime = Date.now() - new Date(enquiry[0].createdAt).getTime()

      // Update enquiry status
      await db.update(enquiryRecords).set({
        status: "responded",
        respondedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(enquiryRecords.id, input.enquiryId))

      // Send response email to enquirer (skip if anonymised) [S5-ST-20]
      if (enquiry[0].senderEmail) {
        await ctx.services.email.send({
          template: "enquiry_response",
          to: enquiry[0].senderEmail,
          data: {
            listingName: listing.name,
            responseMessage: input.responseMessage,
            providerName: listing.name,
          },
        })
      }

      // Emit enquiry_responded [PP interface spec §1.4]
      await emit(
        "enquiry_responded",
        {
          type: "enquiry_responded",
          listingId: input.listingId,
          enquiryId: input.enquiryId,
          responseTimeMinutes: Math.round(responseTime / (1000 * 60)),
          timestamp: new Date().toISOString(),
        },
        waitUntilFn,
      )

      return { success: true }
    }),
```

### 5.3 Enquiry Reminder Scheduling

7-day reminder for unresponded enquiries. Scheduled at enquiry delivery time (S3 `claim_approved` delivers pending enquiries; S6 delivers new enquiries directly).

```typescript
// Scheduled by the enquiry delivery flow
// S5 registers the deferred action handler

registerActionHandler("enquiry_response_reminder", async (params) => {
  const { enquiryId, listingId } = params
  const enquiry = await db.select()
    .from(enquiryRecords)
    .where(eq(enquiryRecords.id, enquiryId))
    .limit(1)

  if (enquiry.length === 0) return
  if (enquiry[0].status === "responded") return // already responded

  // Mark as stale
  await db.update(enquiryRecords).set({
    status: "stale",
    updatedAt: new Date(),
  }).where(eq(enquiryRecords.id, enquiryId))

  // Send reminder email
  const listing = await getListing(listingId)
  if (!listing.accountId) return

  await services.email.send({
    template: "enquiry_reminder",
    to: await getAccountEmail(listing.accountId),
    data: { listingName: listing.name, daysSinceEnquiry: 7 },
  })
})
```

### 5.4 Enquiry Response Email Template

S5 registers 1 email template for enquiry responses.

| Template ID | Trigger | Category | Unsubscribable | Owner |
|---|---|---|---|---|
| `enquiry_response` | Provider responds to enquiry | Transactional | No | PP |

**Merge fields:** `{ listingName, responseMessage, providerName }`

---

## 6. Notification Centre

[Source: PP concept design §6.1, SI §8]

### 6.1 Notification Display

The notification centre shows all notifications for the authenticated account, ordered by creation date (newest first). Max 50 per account; oldest auto-archived past this limit (S0 `notification_cleanup` deferred action handles retention).

```typescript
// src/server/routers/notification.ts

export const notificationRouter = router({
  list: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const notifications = await db.select()
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.accountId, ctx.session.accountId),
          eq(notificationsTable.dismissed, false),
        ))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(input.limit + 1)

      const hasMore = notifications.length > input.limit
      const items = hasMore ? notifications.slice(0, input.limit) : notifications

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      }
    }),

  dismiss: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(notificationsTable).set({
        dismissed: true,
        dismissedAt: new Date(),
      }).where(and(
        eq(notificationsTable.id, input.notificationId),
        eq(notificationsTable.accountId, ctx.session.accountId),
      ))
      return { success: true }
    }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(notificationsTable).set({
        readAt: new Date(),
      }).where(and(
        eq(notificationsTable.id, input.notificationId),
        eq(notificationsTable.accountId, ctx.session.accountId),
      ))
      return { success: true }
    }),

  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.accountId, ctx.session.accountId),
          isNull(notificationsTable.readAt),
          eq(notificationsTable.dismissed, false),
        ))
      return { count: result[0].count }
    }),
})
```

### 6.2 Unread Badge

Dashboard navigation shows unread notification count as a badge. Count query target: <50ms p95 (SI §8 NFR).

---

## 7. Subscription Management

[Source: PP concept design §6.4, S4 §3]

### 7.1 Subscription Panel

The subscription management page (`/dashboard/listings/:id/subscription`) displays:

- **Current tier** with feature summary (from `computeFeatureAccess`)
- **Billing details**: cadence (annual/monthly), start date, end date (if cancelling)
- **Grace period warning** if active (from S4 `getSubscriptionStatus`)
- **Upgrade CTA** if not at highest tier — routes to S4 checkout or upgrade flow
- **Paddle Customer Portal link** for billing management (payment method, invoices, receipts)
- **Downgrade impact preview** showing what features/data would be affected (hidden media/credit counts)

### 7.2 Paddle Portal Integration

Subscription billing management routes to Paddle's customer portal. No custom billing UI in V1.

```typescript
// src/server/routers/subscription.ts (S4 router, S5 extends)

  getPortalUrl: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // paddleCustomerId lives on accountProfiles, not listing [S5-retro-1]
      const profile = await getAccountProfile(ctx.session.accountId)
      if (!profile?.paddleCustomerId) return { portalUrl: null }

      const portalUrl = await deps.payment.getCustomerPortalUrl({
        paddleCustomerId: profile.paddleCustomerId,
      })

      return { portalUrl }
    }),
```

### 7.3 PaymentService Extension

S5 extends the `PaymentService` interface (SI §10.1) with customer portal URL generation.

```typescript
// S5 amendment to PaymentService (SI §10.1)
interface PaymentService {
  // ... existing methods from S4 ...
  getCustomerPortalUrl(params: {
    paddleCustomerId: string
  }): Promise<string>
}
```

---

## 8. Profile Editor Enhancements

[Source: PP concept design §1.4]

S2 provides the onboarding profile editor. S5 enhances it for ongoing profile management.

### 8.1 Concurrent Edit Handling

Optimistic concurrency control prevents conflicting edits (e.g., provider edits in one tab while admin suspends in another).

```typescript
// S5 amendment to S1/S2 profile edit mutation

  editListing: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      version: z.number(),  // S5 addition: optimistic lock
      // ... field updates from S2 ...
    }))
    .mutation(async ({ ctx, input }) => {
      const { listingId, version, ...updates } = input
      const listing = await getListing(listingId)
      if (listing.accountId !== ctx.session.accountId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Guard: cannot edit archived or suspended listings [S5-ST-17]
      if (listing.lifecycleStatus === "archived" || listing.lifecycleStatus === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "cannot edit listing in current state" })
      }

      // Optimistic concurrency check
      const result = await db.update(listingsTable).set({
        ...updates,
        version: version + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(listingsTable.id, listingId),
        eq(listingsTable.version, version),
      ))

      if (result.rowCount === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "listing was modified since you loaded it — reload and retry",
        })
      }

      // changedFields for profile_edited event
      const changedFields = Object.keys(updates)

      // Emit profile_edited [PP interface spec §1.7]
      await emit(
        "profile_edited",
        {
          type: "profile_edited",
          listingId,
          accountId: ctx.session.accountId,
          changedFields,
          timestamp: new Date().toISOString(),
        },
        waitUntilFn,
      )

      return { success: true, version: version + 1 }
    }),
```

### 8.2 Schema Addition — Version Column

```typescript
// Migration: add version column to listings
version: integer("version").notNull().default(1),
```

### 8.3 Feature-Gated Editor Sections

The profile editor renders sections conditionally based on tier limits:

- **Media section:** shows upload limit based on `featureAccess.maxMedia`. Displays hidden items count if any exist (from downgrade).
- **Credits section:** shows limit based on `featureAccess.maxCredits`. Displays hidden count.
- **Custom tags:** enabled only if `featureAccess.customTags === true`. Free tier shows "available with Standard" prompt.

---

## 9. 90-Day Listing Update Reminder

[Source: PP concept design §6.1]

When a provider edits their listing profile, S5 schedules (or reschedules) a 90-day reminder.

### 9.1 Deferred Action Handler

```typescript
registerActionHandler("listing_update_reminder", async (params) => {
  const { listingId } = params
  const listing = await getListing(listingId)

  if (!listing.accountId) return
  if (listing.lifecycleStatus !== "active") return

  await services.email.send({
    template: "listing_update_reminder",
    to: await getAccountEmail(listing.accountId),
    data: { listingName: listing.name },
  })

  // Schedule next reminder (self-perpetuating pattern from S0 §3)
  await scheduleDeferredAction({
    action: "listing_update_reminder",
    params: { listingId },
    executeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "platform",
  })
})
```

### 9.2 Scheduling Trigger

The 90-day reminder is scheduled on first profile edit after claim approval. The `profile_edited` consumer checks if a `listing_update_reminder` deferred action already exists for this listing; if not, schedules one. On subsequent edits, the existing action is cancelled and rescheduled (clock resets).

```typescript
// In PP's profile_edited consumer (already registered in S1 §10):
// S5 addition: schedule/reschedule 90-day reminder

async function onProfileEdited(event: ProfileEditedEvent): Promise<void> {
  // ... existing S1 logic (quality score recalc trigger) ...

  // S5: schedule or reschedule 90-day update reminder
  await cancelDeferredAction("listing_update_reminder", { listingId: event.listingId })
  await scheduleDeferredAction({
    action: "listing_update_reminder",
    params: { listingId: event.listingId },
    executeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "platform",
  })
}
```

---

## 10. Account Settings

### 10.1 Email Preferences

[Source: SI §5.3]

The account settings page exposes email preference management. Categories align with SI §5.3:

| Category | Default | Unsubscribable |
|---|---|---|
| Transactional | On | No |
| Enquiry notifications | On | Yes |
| Listing status | On | Yes |
| Profile nudges | On | Yes |
| Conversion marketing | On | Yes |
| Subscription | On | No |

```typescript
// src/server/routers/settings.ts

export const settingsRouter = router({
  getEmailPreferences: protectedProcedure
    .query(async ({ ctx }) => {
      const prefs = await db.select()
        .from(emailPreferences)
        .where(eq(emailPreferences.accountId, ctx.session.accountId))
      return prefs
    }),

  updateEmailPreference: protectedProcedure
    .input(z.object({
      category: z.enum(["enquiry_notifications", "listing_status", "profile_nudges", "conversion_marketing"]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(emailPreferences).set({
        enabled: input.enabled,
        updatedAt: new Date(),
      }).where(and(
        eq(emailPreferences.accountId, ctx.session.accountId),
        eq(emailPreferences.category, input.category),
      ))
      return { success: true }
    }),
})
```

### 10.2 Account Closure Initiation

[Source: PP interface spec §5]

The settings page exposes an "Close Account" action. Closure initiates the PP-orchestrated 6-step flow (PP interface spec §5).

```typescript
  initiateAccountClosure: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Confirmation guard — client must have shown confirmation dialog
      // before calling this mutation. The mutation itself is the point of no return.

      // Delegate to PP's account closure orchestrator (S0 orchestrated flow engine)
      await startOrchestratedFlow({
        flowType: "closure",
        triggeredBy: ctx.session.accountId,
        context: { accountId: ctx.session.accountId },
      })

      return { success: true }
    }),
```

The orchestrated flow itself is specified in PP interface spec §5 (6 steps). The admin UI for monitoring closure flows is deferred to S7. The erasure orchestrator (GDPR) is deferred to S10.

---

## 11. Feature Access UI Mapping

[Source: PP concept design §6.5]

Platform maps Commercial's `FeatureAccess` to UI rendering decisions. This mapping is a pure function — no business logic, just presentation rules.

```typescript
// src/domains/platform/dashboard/map-feature-access-to-ui.ts

type FeatureGateUIState = "available" | "locked" | "upgrade_prompt"

type UIFeatureMap = {
  analyticsPanel: {
    trendChart: FeatureGateUIState
    searchTerms: FeatureGateUIState
    viewerDemographics: FeatureGateUIState
    competitorBenchmarking: FeatureGateUIState
    enquiryResponseInsights: FeatureGateUIState
  }
  profileEditor: {
    mediaLimit: number
    creditLimit: number | "unlimited"
    customTags: FeatureGateUIState
  }
  searchVisibility: {
    rankingBoost: number
    sponsoredPlacementEligible: boolean
  }
  support: {
    prioritySupport: FeatureGateUIState
  }
}

function mapFeatureAccessToUI(access: FeatureAccess): UIFeatureMap {
  return {
    analyticsPanel: {
      trendChart: access.trendAnalytics !== "none" ? "available" : "locked",
      searchTerms: access.topSearchTerms ? "available" : "locked",
      viewerDemographics: access.viewerDemographics ? "available" : "locked",
      competitorBenchmarking: access.competitorBenchmarking ? "available" : "locked",
      enquiryResponseInsights: access.enquiryResponseInsights ? "available" : "locked",
    },
    profileEditor: {
      mediaLimit: access.maxMedia,
      creditLimit: access.maxCredits,
      customTags: access.customTags ? "available" : "locked",
    },
    searchVisibility: {
      rankingBoost: access.rankingBoost,
      sponsoredPlacementEligible: access.sponsoredPlacement,
    },
    support: {
      prioritySupport: access.prioritySupport ? "available" : "locked",
    },
  }
}
```

---

## 12. Event Consumers Registered in S5

S5 does not register new event consumers. It builds UI that renders data produced by existing consumers registered in S1–S4. The following existing consumers produce data that S5 displays:

| Event | Existing Consumer | Registered In | S5 Display |
|---|---|---|---|
| `quality_score_changed` | PP ranking recalculation | S1 | Quality score panel refresh |
| `decay_signal_detected` | PP "may be outdated" warning | S1 | Decay warning banner |
| `subscription_tier_changed` | PP feature access update | S4 | Subscription panel + feature gates |
| `subscription_ended` | PP downgrade + re-subscribe CTA | S4 | Subscription panel update |
| `conversion_milestone` | PP dashboard notification | S4 | Notification centre |
| `churn_risk_detected` | PP quality improvement suggestions | S4 | Notification centre |
| `verification_tier_changed` | PP badge update | S1 | Verification badge |

**No new `EVENT_CONSUMER_MATRIX` entries required.**

**S5 consumer extension [S5-ST-12]:** S5 extends PP's `profile_edited` consumer (registered in S1 §10) with 90-day reminder scheduling (§9.2). The consumer handler now performs two actions: (1) quality score recalc trigger (S1), (2) listing update reminder cancel/reschedule (S5). Both are async. No new `EVENT_CONSUMER_MATRIX` entry needed.

---

## 13. Deferred Actions Registered in S5

| Action | Handler | Retry | On Failure | Schedule |
|---|---|---|---|---|
| `listing_update_reminder` | Send 90-day stale listing email, reschedule self (§9.1) | `once` | `log` | 90 days after last profile edit |
| `enquiry_response_reminder` | Mark enquiry as stale, send reminder email (§5.3) | `once` | `log` | 7 days after enquiry delivery |

**`DeferredActionParamsMap` extension:**

```typescript
// Added to S0's DeferredActionParamsMap
listing_update_reminder: {
  listingId: UUID
}
enquiry_response_reminder: {
  enquiryId: UUID
  listingId: UUID
}
```

**SI §2.2 registered actions table additions:**

| Action | Owner | Schedule | Retry | On Failure |
|---|---|---|---|---|
| `listing_update_reminder` | Platform | 90 days after profile edit (recurring via self-scheduling) | `once` | `log` |
| `enquiry_response_reminder` | Platform | 7 days after enquiry delivery | `once` | `log` |

---

## 14. Email Templates Registered in S5

S5 registers 1 email template.

| Template ID | Trigger | Category | Unsubscribable | Owner |
|---|---|---|---|---|
| `enquiry_response` | Provider responds to enquiry via dashboard | Transactional | No | PP |

**Merge fields:** `{ listingName, responseMessage, providerName }`

**Template count after S5:** S0 (2) + S2 (7) + S3 (4) + S4 (1) + S5 (1) = 15 of 25.

**Note:** `listing_update_reminder` and `enquiry_reminder` templates are already registered in SI §5.2 / PP §4 — no new registration needed for those. S5 provides the deferred action handlers that trigger them.

---

## 15. Notification Types Used in S5

S5 uses existing notification types from SI §8.1:

| Type | Trigger | Recipient |
|---|---|---|
| `enquiry_received` | New enquiry delivered to claimed listing | Provider |
| `quality_score_changed` | D&L recomputes quality score | Provider |
| `decay_warning` | D&L detects freshness decay | Provider |
| `subscription_confirmed` | Checkout completed | Provider |
| `subscription_ending` | Grace period / voluntary cancellation | Provider |
| `conversion_milestone` | CR identifies conversion event | Provider |
| `churn_risk_suggestion` | CR detects churn risk factors | Provider |

All types already defined in SI §8.1. No extension needed.

---

## 16. Schema Additions

### 16.1 Listing Version Column

```typescript
// Migration: add version column to listings (S1 §1.2)
version: integer("version").notNull().default(1),
```

Required for optimistic concurrency in profile editor (§8.1).

### 16.2 Notification Table Migration [S5-ST-5]

```typescript
// Migration: amend notifications table (S0 §1.4)
// Remove: read: boolean
// Add: readAt: timestamp("read_at", { withTimezone: true })  — null = unread
// Add: dismissed: boolean("dismissed").notNull().default(false)
// Add: dismissedAt: timestamp("dismissed_at", { withTimezone: true })
```

Required for notification centre read/dismiss lifecycle (§6.1). S0 schema has `read: boolean`; S5 requires separate read and dismiss states.

### 16.3 Enquiry Status Column [S5-ST-14]

```typescript
export const enquiryStatusEnum = pgEnum("enquiry_status", [
  "unread", "responded", "stale",
])
// Add to enquiry_records (S1 §2.2):
// status: enquiryStatusEnum("status").notNull().default("unread"),
```

S1's `enquiry_records` table has no `status` column — only `respondedAt`. S5 requires a three-state lifecycle (`unread`, `responded`, `stale`) for enquiry inbox filtering (§5.1) and the `enquiry_response_reminder` handler (§5.3).

---

## 17. Quality Methodology Page

Static SSG page at `/quality-methodology`. Explains the 5 quality score dimensions, scoring methodology, and how providers can improve their scores. References the same methodology used by D&L concept design §3. Content is editorial — not generated from code constants.

---

## 18. Upstream Flag Resolutions

| Flag | Source | Resolution |
|---|---|---|
| S1-4 | Search terms + trend data deferred to S5/S9 | **Partially resolved.** S5 provides the UI panel gated by tier (`topSearchTerms`, `trendData`). The underlying data pipeline (aggregating search term frequencies, computing trend deltas) is deferred to S9. S5 renders `null` for these fields until S9 populates them. |
| S1-5 | Profile viewers (tier-gated) deferred to S5 | **Partially resolved.** S5 provides the UI panel gated by `viewerDemographics`. The data pipeline (viewer identity resolution, demographic bucketing) is deferred to S9. S5 renders `null` until S9 populates. |
| S2-5 | CDN cache purge for image replacement | **Resolved.** V1 uses content-addressed filenames (hash-based). No purge needed. If filename reuse is introduced in a future slice, cache purge must be added. No S5 action required. |
| S4-1 | Subscription analytics in provider dashboard | **Resolved.** S5 §7 implements subscription management panel displaying current tier, billing details, grace period status, and upgrade CTA. |
| S4-2 | Churn intervention UI | **Partially resolved.** S5 provides the notification display surface for `churn_risk_detected` events. The churn intervention trigger logic and retention data evaluation are deferred to S8 (CR evaluates, S5/S8 displays). |

---

## 19. Downstream Flags

| # | Flag | Target Slice | Source |
|---|---|---|---|
| S5-1 | Churn intervention UI: exit survey display, retention data presentation, win-back status — S8 evaluates CR triggers, S5 provides the rendering surface | S8 | §3 |
| S5-2 | Sponsored placement badge display on listings — S8 implements sponsored placement selection, S5 renders "Sponsored" label | S8 | CR concept design §4.4 |
| S5-3 | Competitor benchmarking data panel — S5 provides tier-gated UI, S9 computes benchmarking data from taxonomy overlap + engagement counters | S9 | §3.1 |
| S5-4 | Viewer demographics data panel — S5 provides tier-gated UI, S9 computes demographic bucketing from profile_viewed events | S9 | §3.1 |
| S5-5 | Enquiry response insights data panel — S5 provides tier-gated UI, S9 computes derived metrics from D&L counters + PP analytics | S9 | CR interface spec §5 |
| S5-6 | Top search terms data — S5 provides tier-gated UI, S9 aggregates search term frequencies per listing from zero_result_queries + search_performed events | S9 | §3.1 |
| S5-7 | Quality scoring calibration — S5 displays S1 zero-initialised scores until S9 implements calibrated scoring algorithms (computeQualityScore, scoreFreshness, etc.) | S9 | S1-2 |
| S5-8 | Enquiry inbox: buyer experience (enquiry submission form, anonymous enquiry flow, shortlist integration) — S5 provides provider-side inbox, S6 provides buyer-side submission | S6 | §5 |
| S5-9 | ~~`PaymentService.getCustomerPortalUrl` — SI §10.1 amendment.~~ **Resolved by S5 stress test (S5-ST-4).** Applied to SI §10.1. | SI update | §7.3 |

---

## 20. Open Question Resolutions

| # | Question | Resolution |
|---|---|---|
| PP-Q5 | Analytics / product metrics tooling | **Deferred — not resolved in S5.** S5 provides the dashboard UI consuming existing query interfaces. Product-level analytics tooling (Mixpanel, PostHog, etc.) for tracking user behaviour across the dashboard itself is a cross-cutting concern that should be resolved before S5 implementation begins. S5 does not depend on it structurally but benefits from it for entity perception (Layer 2). Flag remains open. |

---

## 21. Acceptance Criteria

### Dashboard Structure (5)

| # | Criterion | Test |
|---|---|---|
| AC-1 | Unauthenticated access to `/dashboard` redirects to `/login?redirect=/dashboard` | E2E |
| AC-2 | Dashboard overview shows all owned listings as cards with name, tier, verification badge, and all-time engagement totals | E2E |
| AC-3 | Archived listings appear greyed-out with "Reactivate" button; admin-suspended listings show "Suspended" with no reactivate action | E2E |
| AC-4 | Listing detail page returns 404 for listings not owned by authenticated user | Integration |
| AC-5 | Dashboard overview loads in <500ms p95 for accounts with up to 50 listings | Integration |

### Analytics (6)

| # | Criterion | Test |
|---|---|---|
| AC-6 | Free-tier listing shows all-time totals only — no trend chart, no search terms | E2E |
| AC-7 | Standard-tier listing shows 30-day trend chart and top search terms (renders placeholder until S9 data available) | E2E |
| AC-8 | Premium-tier listing shows 90-day trends, viewer demographics, competitor benchmarking, enquiry response insights (renders placeholder until S9 data available) | E2E |
| AC-9 | Analytics period selector on standard tier clamps to 30d maximum (requesting 90d returns 30d data) | Integration |
| AC-10 | `getListingAnalytics` query returns data within <200ms p95 | Integration |
| AC-11 | Locked analytics sections show upgrade CTA linking to pricing page | E2E |

### Quality Score (4)

| # | Criterion | Test |
|---|---|---|
| AC-12 | Quality score panel displays composite score and 5-dimension breakdown from `QualityScoreExplanation` | E2E |
| AC-13 | Top 3 improvements link to corresponding profile editor sections | E2E |
| AC-14 | Decay warning banner displays for listings with `decay_signal_detected` (high/critical severity) and clears when freshness improves | Integration |
| AC-15 | `/quality-methodology` page renders as static SSG | E2E |

### Enquiry Management (7)

| # | Criterion | Test |
|---|---|---|
| AC-16 | Enquiry inbox displays all enquiries for listing with cursor-based pagination (20 per page) | Integration |
| AC-17 | Enquiry status filter (all, unread, responded, stale) correctly filters results | Integration |
| AC-18 | `respondToEnquiry` updates status to "responded", sends response email (skipped if senderEmail null after GDPR erasure), and emits `enquiry_responded` [S5-ST-20] | Integration |
| AC-19 | Responding to an already-responded enquiry returns BAD_REQUEST | Integration |
| AC-20 | `enquiry_response_reminder` marks enquiry as stale and sends reminder email 7 days after delivery if unresponded | Integration |
| AC-21 | `enquiry_response_reminder` is a no-op if enquiry was already responded | Integration |
| AC-22 | `enquiry_responded` event payload includes `responseTimeMinutes` computed from `enquiry.createdAt` to response time | Integration |

### Notifications (4)

| # | Criterion | Test |
|---|---|---|
| AC-23 | Notification centre displays notifications ordered by newest first, with cursor-based pagination | Integration |
| AC-24 | Dismiss notification soft-deletes (excluded from list, retained in DB) | Integration |
| AC-25 | Unread notification count badge updates on mark-read and on new notification | Integration |
| AC-26 | Unread count query returns within <50ms p95 | Integration |

### Subscription Management (4)

| # | Criterion | Test |
|---|---|---|
| AC-27 | Subscription panel shows current tier, billing cadence, start date, and feature access summary | E2E |
| AC-28 | Grace period warning displays expiry date and payment recovery prompt when active | E2E |
| AC-29 | Upgrade CTA routes to S4 checkout flow for free-tier listings, upgrade flow for paid-tier listings | E2E |
| AC-30 | Paddle portal link opens customer billing management | E2E |

### Profile Editor (4)

| # | Criterion | Test |
|---|---|---|
| AC-31 | Concurrent edit on listing triggers CONFLICT error (optimistic lock via version column) | Integration |
| AC-32 | Successful edit increments version and emits `profile_edited` with `accountId` and `changedFields` array [S5-ST-13] | Integration |
| AC-33 | Media upload section shows tier limit and hidden item count | E2E |
| AC-34 | Custom tags section shows "available with Standard" prompt for free-tier listings | E2E |
| AC-45 | Editing an archived or suspended listing returns FORBIDDEN [S5-ST-17] | Integration |

### 90-Day Reminder (3)

| # | Criterion | Test |
|---|---|---|
| AC-35 | Profile edit schedules `listing_update_reminder` deferred action at 90 days | Integration |
| AC-36 | Subsequent profile edit cancels existing reminder and reschedules (clock reset) | Integration |
| AC-37 | `listing_update_reminder` handler sends email and reschedules itself (self-perpetuating) | Integration |

### Account Settings (4)

| # | Criterion | Test |
|---|---|---|
| AC-38 | Email preferences page displays all 4 subscribable categories with current opt-in/opt-out state | E2E |
| AC-39 | Updating email preference immediately changes delivery behaviour (SI §5.3 enforcement) | Integration |
| AC-40 | Account closure initiation starts orchestrated flow (flowType: "closure") | Integration |
| AC-41 | Account closure for account with active listings and subscriptions completes all 6 steps (archive → cancel → anonymise → delete/defer → deactivate → emit) | Integration |

### Feature Gating UI (3)

| # | Criterion | Test |
|---|---|---|
| AC-42 | `mapFeatureAccessToUI` returns correct gate states for each tier (free, standard, premium, partner) | Unit |
| AC-43 | Locked feature sections render "Upgrade" prompt with link to pricing page | E2E |
| AC-44 | Feature access context updates immediately after `subscription_tier_changed` event (no page reload required after webhook processes) | E2E |
| AC-46 | `mapFeatureAccessToUI` maps `prioritySupport` field correctly (Partner: available, others: locked) [S5-ST-8] | Unit |

**Total: 46 acceptance criteria.**

---

## 22. Stress Test Resolution Log (v2)

20 scenarios targeting S5's implementation delta against upstream interface specs (SI v4, D&L v4, Ops v3, PP v4, CR v2), prior slices (S0 v2, S1 v2, S2 v2, S3 v2, S4 v2), and concept design (PP v5 §6, D&L v6 §1/§3, CR v4 §4). 6 High, 4 Medium, 2 Low, 8 Pass. 12 fixes applied.

Full analysis: `stress-tests/s5-stress-test.md`

| # | Scenario | Severity | Resolution |
|---|----------|----------|------------|
| S5-ST-1 | DeferredActionParamsMap missing S5 entries | **High** | Sibling fix: SI §2.1 +2 entries. No slice change needed. |
| S5-ST-2 | SI §2.2 registered actions table missing S5 rows | **High** | Sibling fix: SI §2.2 +2 rows. No slice change needed. |
| S5-ST-3 | `enquiry_response` template missing from SI/PP inventory | **High** | §14 template count corrected 24→25. Sibling fix: SI §5.2 + PP §4.1 +1 template. |
| S5-ST-4 | `PaymentService.getCustomerPortalUrl` not in SI §10.1 | **Medium** | Downstream flag S5-9 resolved. Sibling fix: SI §10.1 +1 method. |
| S5-ST-5 | Notification schema mismatch — `read: boolean` vs `readAt`/`dismissed`/`dismissedAt` | **High** | §16.2 migration added. Sibling fix: SI §8.1, S0 §1.4 schema amended. |
| S5-ST-6 | S5 notification types vs SI §8.1 — all 7 present | Pass | Correct. No fix needed. |
| S5-ST-7 | `computeFeatureAccess` P4 import — simplified signature | Pass | Correct. No fix needed. |
| S5-ST-8 | `mapFeatureAccessToUI` missing `prioritySupport` field | **Medium** | §11 `UIFeatureMap` + `mapFeatureAccessToUI` extended. AC-46 added. |
| S5-ST-9 | Analytics tier table vs TIER_LIMITS — field alignment | Pass | Correct. No fix needed. |
| S5-ST-10 | Account closure initiation matches SI §13.2 and PP §5 | Pass | Correct. No fix needed. |
| S5-ST-11 | `getSubscriptionStatus` data source — intra-PP call | Pass | Correct. No fix needed. |
| S5-ST-12 | EVENT_CONSUMER_MATRIX — `profile_edited` handler expansion undocumented | **Medium** | §12 consumer extension note added. Sibling fix: S1 §10 note added. |
| S5-ST-13 | `profile_edited` emission missing `accountId` — P1 violation | **High** | §8.1 `emit()` payload fixed. AC-32 amended. |
| S5-ST-14 | `enquiry_records` table has no `status` column | **High** | §16.3 schema migration added. Sibling fix: S1 §2.2 note added. |
| S5-ST-15 | `enquiry_responded` payload matches PP §1.4 exactly | Pass | Correct. No fix needed. |
| S5-ST-16 | Dashboard overview N+1 query contradicts loading strategy | **Medium** | §2.1 loading strategy + §2.2 query rewritten as single join. |
| S5-ST-17 | Optimistic lock race with concurrent archival | **Low** | §8.1 lifecycle guard added. AC-45 added. |
| S5-ST-18 | Upstream flag S2-5 resolution accuracy | Pass | Correct. No fix needed. |
| S5-ST-19 | Upstream flag S4-1/S4-2 resolution completeness | Pass | Correct. No fix needed. |
| S5-ST-20 | Enquiry response email sent to null `senderEmail` after GDPR erasure | **Low** | §5.2 null guard added. AC-18 amended. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `interfaces/platform-and-product.md` (v4) | Emitted events §1 (`profile_edited`, `enquiry_responded` — S5 triggers via existing routes), consumed events §2 (S5 renders data from existing consumers), `getListingAnalytics` query §3, email templates §4, account closure §5 |
| `interfaces/data-and-listings.md` (v4) | `getEngagementCounters` query §3.2 (S5 calls for dashboard display), `QualityScoreExplanation` type §4 (S5 renders), emitted events consumed by PP §1 (quality_score_changed, decay_signal_detected, verification_tier_changed — S5 renders) |
| `interfaces/commercial-and-revenue.md` (v2) | `TIER_LIMITS` §4.1, `computeFeatureAccess` §4.2 (S5 imports for feature gate UI), `BasicAnalytics` §5 (S5 renders), `EnquiryResponseInsights` §5 (S5 renders placeholder until S9) |
| `interfaces/shared-infrastructure.md` (v4) | Deferred actions §2 (S5 adds 2), email transport §5 (S5 triggers 3 templates), notifications §8 (S5 renders), orchestrated flows §3 (S5 initiates closure), service abstraction §10 (`PaymentService.getCustomerPortalUrl` extension) |
| `slices/slice-00-infrastructure.md` (v2) | Event bus §2, deferred actions §3, notifications §8, service abstraction §11, tRPC §12 |
| `slices/slice-01-data-model.md` (v2) | Listing schema §1.2, engagement counters §1.6, quality_scores §1.5, media_items §1.9, credits §1.8, enquiry_records §2.2, event consumers §10. Downstream flags S1-4, S1-5 partially resolved. |
| `slices/slice-02-onboarding.md` (v2) | Profile editor §5, profile strength meter §7, progressive disclosure §6–§8. Downstream flag S2-5 resolved. |
| `slices/slice-03-claim-verify.md` (v2) | Claim evaluation §1, claim_approved post-processing §3 (delivers pending enquiries — S5 provides inbox), verification upgrade §7 |
| `slices/slice-04-subscriptions.md` (v2) | Feature gating §4 (`enforceFeatureGate`, `checkFeatureAccess`), `getSubscriptionStatus` §3.1, `applyDowngrade` §5.1, pricing page §6, event consumers §10 (subscription events produce data S5 renders). Downstream flags S4-1, S4-2 resolved/partially resolved. |
