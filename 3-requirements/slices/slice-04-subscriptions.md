# Slice 4: Subscriptions

**Status:** Draft v2 — v1 + stress test: 17 scenarios (4 High, 7 Medium, 2 Low, 4 Pass), 16 fixes. See `stress-tests/s4-stress-test.md`.
**Primary Owner:** Ops / CR / PP (multi-domain — Ops handles webhook, CR defines business rules, PP owns pricing page + feature gating)
**Last updated:** 2026-02-13
**Dependencies:** S0 (event bus, scheduler, auth, email transport, service abstraction, tRPC, decision logging), S1 (Listing schema with `subscriptionTier` + `accountId`, engagement counters, taxonomy), S3 (claim evaluation — checkout requires `claimStatus = "claimed"`)
**Inputs:** `interfaces/commercial-and-revenue.md` (v3), `interfaces/operations.md` (v4), `interfaces/platform-and-product.md` (v6), `interfaces/shared-infrastructure.md` (v8), `2-concept-design/commercial-and-revenue.md` (v4 §1–§3), `slices/slice-00-infrastructure.md` (v2), `slices/slice-01-data-model.md` (v2), `slices/slice-03-claim-verify.md` (v2) [spec versions current as of S8 v2]
**Downstream:** S5 (Provider Experience), S6 (Buyer Experience), S7 (Operations), S8 (Commercial)

---

## Summary

S4 implements the subscription lifecycle end-to-end: Paddle integration (webhook handler, checkout session creation, cancellation API calls), tier management (`subscriptionTier` updates, feature gating via `computeFeatureAccess`), the pricing page (static SSG with tier comparison), launch discount coupon, downgrade data handling (media/credit visibility), grace period scheduling, the archival-path `pending_cancellation_created` emission (resolving S1-9), and the `listing.archive` subscription cancellation side-effect. S4 also introduces the subscription-related schema additions (`paddleSubscriptionId`, `paddleCustomerId`, `billingCadence`, pending cancellation registry) and registers 4 event consumers (D&L, PP×2, CR for `subscription_tier_changed` + `subscription_ended`).

**Domain ownership split:** Operations owns the Paddle webhook handler (signature verification, idempotency, event dispatch). Commercial owns business rules (`mapPaddleWebhook`, `computeFeatureAccess`, `TIER_LIMITS`, `PRICING`, cancellation reason inference). Platform owns the pricing page, checkout initiation, feature gating UI, and the `listing.archive` amendment for subscription cancellation.

**Event emission ownership:** Operations emits `subscription_tier_changed` and `subscription_ended` from the webhook handler. D&L emits `pending_cancellation_created` for the archival path only — D&L does NOT emit `subscription_ended` directly; Ops emits it after Paddle confirms cancellation, with `origin: "archival"` via pending_cancellation registry attribution [S4-ST-7]. PP writes `pending_cancellation` records directly for the closure path only — documented ownership exception [S4-ST-16] (PP interface spec §5 step 2).

## V1 Scope Boundary

**In scope:** Paddle checkout + webhook processing, tier upgrade/downgrade, feature gating enforcement, pricing page, launch discount coupon, grace period (14-day payment failure), downgrade data preservation (media/credit visibility), pending cancellation registry, archival-path subscription cancellation (resolves S1-9), Premium Verified subscription gate (resolves S3-1), win-back deferred action scheduling, churn intervention data display, billing cadence tracking, refund evaluation framework, multi-listing Paddle customer management.

**Deferred to later slices:** Churn intervention UI (S8 — CR evaluates, S5/S8 displays). Win-back email content and evaluation logic (S8 — CR provides merge fields). Conversion trigger evaluation (S8). Sponsored placement (S8). Revenue perception metrics and MRR dashboard (S8). Billing reconciliation monitoring UI (S7). Feature gate friction tracking (S7). Subscription analytics in provider dashboard (S5).

---

## 1. Schema Additions

### 1.1 Subscription Columns on Listings

S1 defined `subscriptionTier` on the listings table. S4 adds subscription metadata columns.

```typescript
// Migration: add subscription columns to listings (S1 §1.2)
paddleSubscriptionId: text("paddle_subscription_id"),  // set on checkout_completed
paddleCustomerId: text("paddle_customer_id"),          // set on first checkout, stored on account
billingCadence: text("billing_cadence"),               // "annual" | "monthly" | null (free)
subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
subscriptionEndDate: timestamp("subscription_end_date", { withTimezone: true }),  // set on cancellation, null while active
```

**Note:** `paddleCustomerId` is also stored on `account_profiles` (§1.2) for multi-listing customer reuse. The listing-level copy is denormalised for webhook handler convenience — Paddle webhooks reference subscription ID, and the handler needs the listing's customer context without joining.

### 1.2 Account-Level Paddle Customer

```typescript
// Migration: add paddleCustomerId to account_profiles (S1 §2.1)
paddleCustomerId: text("paddle_customer_id"),  // created on first checkout, reused for all listings
```

### 1.3 Pending Cancellation Registry

Operations stores pending cancellation records for Paddle webhook attribution. [Source: Ops interface spec §5, CR-X-4]

```typescript
// src/db/schema/operations.ts

export const pendingCancellations = pgTable("pending_cancellations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paddleSubscriptionId: text("paddle_subscription_id").notNull(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),  // CancellationReason: "voluntary" | "payment_failure" | "paddle_reconciliation" | "account_closed" | "listing_archived"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
// Index: (paddle_subscription_id) — primary lookup path for webhook handler
// Retention: cleaned up 24h after creation via inline check in webhook handler

// **Ownership exception [S4-ST-16]:** Operations owns `pending_cancellations`. For
// CR-emitted and D&L-emitted `pending_cancellation_created`, Ops' async consumer writes
// the record. For the account closure path, PP writes directly because the closure
// orchestrated flow requires the record to exist before calling
// `PaymentService.cancelSubscription` (Paddle may webhook immediately). PP's write is
// scoped to closure only — all other paths go through the event/consumer pattern.
```

### 1.4 Subscription Event Idempotency

```typescript
// src/db/schema/operations.ts

export const processedPaddleEvents = pgTable("processed_paddle_events", {
  eventId: text("event_id").primaryKey(),  // Paddle's unique event_id
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
})
// Retention: 30 days. Cleaned up by inline check within webhook handler — on each
// webhook invocation, delete rows where processedAt < now() - 30 days.
// Same pattern as pending_cancellation cleanup in §2.3 step 3. [S4-ST-5]
```

### 1.5 Grace Period Tracking

```typescript
// src/db/schema/commercial.ts

export const gracePeriods = pgTable("grace_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  paddleSubscriptionId: text("paddle_subscription_id").notNull(),
  previousTier: text("previous_tier").notNull(),  // SubscriptionTier at failure time
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),  // startedAt + 14 days
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),  // "payment_recovered" | "downgraded" | "cancelled_by_refund"
})
// Index: (listing_id)
// Index: (expires_at) WHERE resolved_at IS NULL — for grace period expiry check
```

---

## 2. Paddle Webhook Handler

Contract: Ops interface spec §5. CR interface spec §4.4–§4.5.

### 2.1 Module Layout

```
src/domains/operations/
├── paddle/
│   ├── webhook-handler.ts     ← signature verify, idempotency, dispatch
│   ├── pending-cancellations.ts ← registry CRUD
│   └── types.ts               ← PaddleWebhookEvent, raw Paddle types
src/domains/commercial/
├── subscription/
│   ├── map-paddle-webhook.ts  ← mapPaddleWebhook() + inferCancellationReason()
│   ├── feature-access.ts      ← computeFeatureAccess(), TIER_LIMITS
│   ├── pricing.ts             ← PRICING const
│   ├── downgrade.ts           ← applyDowngrade()
│   ├── grace-period.ts        ← grace period management
│   ├── refund.ts              ← evaluateRefund()
│   └── types.ts               ← SubscriptionEvent, CancellationReason, etc.
```

### 2.2 Webhook Endpoint

```typescript
// src/app/api/paddle/webhook/route.ts (Next.js API route — not tRPC)
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get("paddle-signature")

  // 1. Signature verification
  if (!verifyPaddleSignature(rawBody, signature, process.env.PADDLE_WEBHOOK_SECRET!)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const paddleEvent: PaddleWebhookEvent = JSON.parse(rawBody)

  // 2. Idempotency check
  const existing = await db.select()
    .from(processedPaddleEvents)
    .where(eq(processedPaddleEvents.eventId, paddleEvent.event_id))
    .limit(1)
  if (existing.length > 0) {
    return new Response("OK", { status: 200 })  // already processed
  }

  // 3. Record event ID (before processing — prevents race conditions on retries)
  await db.insert(processedPaddleEvents).values({ eventId: paddleEvent.event_id })

  // 4. Return 200 immediately — process async via waitUntil()
  // [Source: Ops interface spec §5, OPS-ST-16]
  const { waitUntil } = await import("next/server")
  waitUntil(processPaddleWebhook(paddleEvent))

  return new Response("OK", { status: 200 })
}
```

### 2.3 Webhook Processing

```typescript
// src/domains/operations/paddle/webhook-handler.ts

async function processPaddleWebhook(paddleEvent: PaddleWebhookEvent): Promise<void> {
  // 1. Map Paddle event to internal SubscriptionEvent (CR-owned logic, P4)
  const subscriptionEvent = mapPaddleWebhook(paddleEvent)
  if (!subscriptionEvent) return  // unrecognised or no-op event

  // 2. Process event and emit domain events
  // [Source: CR interface spec §4.5 mapping table]
  switch (subscriptionEvent.type) {
    case "checkout_completed":
      await handleCheckoutCompleted(subscriptionEvent)
      break
    case "subscription_upgraded":
      await handleSubscriptionUpgraded(subscriptionEvent)
      break
    case "subscription_downgraded":
      await handleSubscriptionDowngraded(subscriptionEvent)
      break
    case "billing_cadence_changed":
      await handleBillingCadenceChanged(subscriptionEvent)
      break
    case "subscription_cancelled":
      await handleSubscriptionCancelled(subscriptionEvent)
      break
    case "renewal_failed":
      await handleRenewalFailed(subscriptionEvent)
      break
  }

  // 3. Clean up old pending_cancellation records (>24h)
  await db.delete(pendingCancellations)
    .where(lt(pendingCancellations.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))

  // 4. Clean up old processedPaddleEvents records (>30 days) [S4-ST-5]
  await db.delete(processedPaddleEvents)
    .where(lt(processedPaddleEvents.processedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
}
```

### 2.4 Checkout Completed Handler

```typescript
async function handleCheckoutCompleted(event: CheckoutCompletedEvent): Promise<void> {
  const listing = await getListing(event.listingId)

  // Precondition guard [CR-X-1]: listing must be claimed with accountId
  if (listing.claimStatus !== "claimed" || !listing.accountId) {
    // Defer to retry queue — recheck every 5 minutes for up to 1 hour
    await scheduleDeferredAction({
      action: "checkout_precondition_retry",
      params: {
        paddleEvent: event,
        attemptCount: 1,
        maxAttempts: 12,  // 12 × 5min = 1 hour
      },
      executeAt: new Date(Date.now() + 5 * 60 * 1000),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "operations",
    })
    return
  }

  // Update listing subscription data
  await db.update(listings).set({
    subscriptionTier: event.tier,
    paddleSubscriptionId: event.paddleSubscriptionId,
    billingCadence: event.billingCadence,
    subscriptionStartDate: new Date(),
    subscriptionEndDate: null,
    updatedAt: new Date(),
  }).where(eq(listings.id, event.listingId))

  // Store paddleCustomerId on account if first checkout
  const accountProfile = await db.select()
    .from(accountProfiles)
    .where(eq(accountProfiles.accountId, listing.accountId))
    .limit(1)
  if (!accountProfile[0].paddleCustomerId) {
    const paddleCustomerId = extractPaddleCustomerId(event)
    await db.update(accountProfiles).set({
      paddleCustomerId,
      updatedAt: new Date(),
    }).where(eq(accountProfiles.accountId, listing.accountId))
    // Also denormalise to listing
    await db.update(listings).set({
      paddleCustomerId,
    }).where(eq(listings.id, event.listingId))
  }

  // Emit subscription_tier_changed (Ops is sole emitter) [Ops interface spec §1.1]
  await emit(
    "subscription_tier_changed",
    {
      type: "subscription_tier_changed",
      listingId: event.listingId,
      accountId: listing.accountId,
      previousTier: "free" as const,
      newTier: event.tier,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )

  // Log conversion decision
  await logDecision({
    domain: "commercial",
    decisionType: "conversion_trigger_evaluation",
    inputs: { listingId: event.listingId, previousTier: "free", newTier: event.tier, billingCadence: event.billingCadence },
    output: { action: "checkout_completed" },
    entityContext: { listingId: event.listingId, accountId: listing.accountId },
  })
}
```

### 2.5 Subscription Upgraded/Downgraded Handlers

```typescript
async function handleSubscriptionUpgraded(event: SubscriptionUpgradedEvent): Promise<void> {
  await db.update(listings).set({
    subscriptionTier: event.newTier,
    updatedAt: new Date(),
  }).where(eq(listings.id, event.listingId))

  const listing = await getListing(event.listingId)

  await emit(
    "subscription_tier_changed",
    {
      type: "subscription_tier_changed",
      listingId: event.listingId,
      accountId: listing.accountId!,
      previousTier: event.previousTier,
      newTier: event.newTier,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )
}

async function handleSubscriptionDowngraded(event: SubscriptionDowngradedEvent): Promise<void> {
  // applyDowngrade handles tier update, data preservation, notification, and event emission
  await applyDowngrade({
    listingId: event.listingId,
    previousTier: event.previousTier,
    newTier: event.newTier,
  })
}
```

### 2.6 Billing Cadence Changed Handler

```typescript
async function handleBillingCadenceChanged(event: BillingCadenceChangedEvent): Promise<void> {
  await db.update(listings).set({
    billingCadence: event.newCadence,
    updatedAt: new Date(),
  }).where(eq(listings.id, event.listingId))

  // No domain event — internal state update only [CR interface spec §4.5]
  // Log perception signal for entity learning
  await logDecision({
    domain: "commercial",
    decisionType: "billing_cadence_tracking",
    inputs: { listingId: event.listingId, previousCadence: event.previousCadence, newCadence: event.newCadence },
    output: { action: "cadence_updated" },
    entityContext: { listingId: event.listingId },
  })
}
```

### 2.7 Subscription Cancelled Handler

```typescript
async function handleSubscriptionCancelled(event: SubscriptionCancelledEvent): Promise<void> {
  const listing = await getListing(event.listingId)

  // Determine origin using pending_cancellation registry [Ops interface spec §5]
  const pendingRecord = await db.select()
    .from(pendingCancellations)
    .where(eq(pendingCancellations.paddleSubscriptionId, listing.paddleSubscriptionId!))
    .limit(1)

  const reason = pendingRecord.length > 0
    ? pendingRecord[0].reason as CancellationReason
    : event.reason  // inferred from Paddle data by mapPaddleWebhook

  const origin: "paddle" | "archival" | "closure" =
    reason === "listing_archived" ? "archival"
    : reason === "account_closed" ? "closure"
    : "paddle"

  // Grace period for payment failure [CR concept design §2.3]
  if (reason === "payment_failure") {
    await createGracePeriod(listing, event)
    return  // Do NOT emit subscription_ended yet — grace period active
  }

  // Voluntary or entity-initiated cancellation: apply grace period for voluntary only
  if (reason === "voluntary") {
    await createGracePeriod(listing, event)
    return
  }

  // Immediate cancellation (account_closed, listing_archived, paddle_reconciliation)
  await finaliseSubscriptionEnd(listing, reason, origin)
}

async function createGracePeriod(
  listing: Listing,
  event: SubscriptionCancelledEvent,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  await db.insert(gracePeriods).values({
    listingId: listing.id,
    paddleSubscriptionId: listing.paddleSubscriptionId!,
    previousTier: listing.subscriptionTier,
    expiresAt,
  })

  // Schedule grace period expiry check
  await scheduleDeferredAction({
    action: "grace_period_expiry",
    params: { listingId: listing.id, gracePeriodId: crypto.randomUUID() },
    executeAt: expiresAt,
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "commercial",
  })

  // Notify provider
  await createNotification({
    accountId: listing.accountId!,
    type: "subscription_ending",
    title: "Your subscription is ending",
    body: `Your ${listing.subscriptionTier} subscription for ${listing.name} will end in 14 days. Update your payment method to continue.`,
    link: `/dashboard/listings/${listing.id}/subscription`,
  })

  // Update listing end date
  await db.update(listings).set({
    subscriptionEndDate: expiresAt,
    updatedAt: new Date(),
  }).where(eq(listings.id, listing.id))
}

async function finaliseSubscriptionEnd(
  listing: Listing,
  reason: CancellationReason,
  origin: "paddle" | "archival" | "closure",
): Promise<void> {
  const previousTier = listing.subscriptionTier

  // Apply downgrade to free (suppress notification — subscription_ended consumers handle it) [S4-ST-8]
  await applyDowngrade({
    listingId: listing.id,
    previousTier,
    newTier: "free",
    suppressNotification: true,
  })

  // Clear subscription metadata
  await db.update(listings).set({
    paddleSubscriptionId: null,
    billingCadence: null,
    subscriptionEndDate: new Date(),
    updatedAt: new Date(),
  }).where(eq(listings.id, listing.id))

  // Emit subscription_ended [Ops interface spec §1.2]
  await emit(
    "subscription_ended",
    {
      type: "subscription_ended",
      listingId: listing.id,
      accountId: listing.accountId!,
      previousTier,
      reason: reason === "payment_failure" ? "grace_period_expired"
        : reason === "account_closed" ? "account_closure"
        : "cancellation",  // voluntary, listing_archived, paddle_reconciliation [S4-ST-3]
      origin,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )
}
```

### 2.8 Renewal Failed Handler

```typescript
async function handleRenewalFailed(event: RenewalFailedEvent): Promise<void> {
  const listing = await getListing(event.listingId)
  if (!listing.accountId) return

  // Payment warning notification (Paddle retries over 7 days) [CR concept design §2.3]
  if (event.attempt === 1) {
    await createNotification({
      accountId: listing.accountId,
      type: "subscription_ending",
      title: "Payment issue",
      body: `Your payment for ${listing.name} didn't go through. We'll retry automatically. Update your payment method to avoid interruption.`,
      link: `/dashboard/listings/${listing.id}/subscription`,
    })
  }

  // No domain event — Paddle handles retry. Eventual subscription_cancelled if unrecoverable.
  // [CR interface spec §4.5: renewal_failed → no domain event]
}
```

---

## 3. Checkout Initiation

### 3.1 tRPC Route

```typescript
// src/server/routers/subscription.ts
export const subscriptionRouter = router({
  createCheckout: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      tier: z.enum(["standard", "premium", "partner"]),
      billingCadence: z.enum(["annual", "monthly"]).default("annual"),
      couponCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)

      // Guard: caller must own this listing
      if (listing.accountId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "you do not own this listing" })
      }

      // Guard: listing must be claimed [CR-X-1]
      if (listing.claimStatus !== "claimed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "listing must be claimed before subscribing" })
      }

      // Guard: listing must not have an active subscription
      if (listing.subscriptionTier !== "free") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "listing already has an active subscription — use upgrade instead" })
      }

      // Resolve Paddle customer ID (reuse existing or let Paddle create)
      const accountProfile = await db.select()
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, ctx.session.userId))
        .limit(1)

      const checkoutResult = await ctx.services.payment.createCheckoutSession({
        accountId: ctx.session.userId,
        listingId: input.listingId,
        tier: input.tier,
        billingCadence: input.billingCadence,
        couponCode: input.couponCode,
        paddleCustomerId: accountProfile[0].paddleCustomerId ?? undefined,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/listings/${input.listingId}?checkout=success`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancelled`,
      })

      return { checkoutUrl: checkoutResult.checkoutUrl }
    }),

  upgrade: protectedProcedure
    .input(z.object({
      listingId: z.string().uuid(),
      newTier: z.enum(["standard", "premium", "partner"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)

      // Guard: caller must own this listing
      if (listing.accountId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Guard: must have active subscription
      if (listing.subscriptionTier === "free" || !listing.paddleSubscriptionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "no active subscription to upgrade" })
      }

      // Guard: new tier must be higher than current
      const tierRank = { free: 0, standard: 1, premium: 2, partner: 3 } as const
      if (tierRank[input.newTier] <= tierRank[listing.subscriptionTier]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "target tier must be higher than current tier" })
      }

      // Paddle handles proration via subscription update API
      // Redirect to Paddle checkout with subscription update context
      const checkoutResult = await ctx.services.payment.createCheckoutSession({
        accountId: ctx.session.userId,
        listingId: input.listingId,
        tier: input.newTier,
        existingSubscriptionId: listing.paddleSubscriptionId,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/listings/${input.listingId}?upgrade=success`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/listings/${input.listingId}/subscription`,
      })

      return { checkoutUrl: checkoutResult.checkoutUrl }
    }),

  getSubscriptionStatus: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await getListing(input.listingId)
      if (listing.accountId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const featureAccess = computeFeatureAccess(listing.subscriptionTier)
      const activeGrace = await db.select()
        .from(gracePeriods)
        .where(and(
          eq(gracePeriods.listingId, input.listingId),
          isNull(gracePeriods.resolvedAt),
        ))
        .limit(1)

      return {
        tier: listing.subscriptionTier,
        billingCadence: listing.billingCadence,
        subscriptionStartDate: listing.subscriptionStartDate,
        subscriptionEndDate: listing.subscriptionEndDate,
        featureAccess,
        gracePeriod: activeGrace.length > 0 ? {
          expiresAt: activeGrace[0].expiresAt,
          previousTier: activeGrace[0].previousTier,
        } : null,
      }
    }),
})
```

### 3.2 PaymentService Extension

S0 defined `PaymentService` in SI §10.1. S4 extends the interface for checkout creation with billing cadence and coupon support.

```typescript
// Extended PaymentService interface (S4 amendment to SI §10.1 — SI spec updated with optional params.
// S4 passes all params; prior callers pass none.) [S4-ST-4]
interface PaymentService {
  createCheckoutSession(params: {
    accountId: UUID
    listingId: UUID
    tier: SubscriptionTier
    billingCadence?: "annual" | "monthly"
    couponCode?: string
    paddleCustomerId?: string
    existingSubscriptionId?: string  // for upgrades
    successUrl: string
    cancelUrl: string
  }): Promise<{ checkoutUrl: string }>

  cancelSubscription(params: {
    paddleSubscriptionId: string
    reason: string
    effectiveFrom: "immediately" | "end_of_period"
  }): Promise<{ status: "cancelled" | "scheduled" }>

  listSubscriptions(params: {
    paddleCustomerId: string
  }): Promise<PaddleSubscription[]>
}
```

---

## 4. Feature Gating

### 4.1 computeFeatureAccess

CR-owned function, PP imports (P4). [Source: CR interface spec §4.2]

```typescript
// src/domains/commercial/subscription/feature-access.ts

function computeFeatureAccess(tier: SubscriptionTier): FeatureAccess {
  const limits = TIER_LIMITS[tier]
  return {
    ...limits,
    directContactVisible: true,
    organicSearchVisible: true,
    enquiriesEnabled: true,
    basicAnalytics: true,
  }
}
```

Contract: CR interface spec §4.1 (`TIER_LIMITS`), §4.2 (`computeFeatureAccess`). Types authoritative in CR interface spec §4.

### 4.2 Feature Gate Middleware

Platform enforces feature gates in tRPC routes and page rendering. S4 provides the middleware; S5 applies it to dashboard routes.

```typescript
// src/lib/feature-gate.ts

async function enforceFeatureGate(
  listingId: UUID,
  feature: keyof TierLimits,
): Promise<void> {
  const listing = await getListing(listingId)
  const access = computeFeatureAccess(listing.subscriptionTier)
  const value = access[feature]

  if (value === false || value === "none" || value === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${feature} requires a paid subscription`,
    })
  }
}

function checkFeatureAccess(
  tier: SubscriptionTier,
  feature: keyof TierLimits,
): boolean {
  const access = computeFeatureAccess(tier)
  const value = access[feature]
  return value !== false && value !== "none" && value !== 0
}
```

### 4.3 Media/Credit Limit Enforcement

S1 `media.uploadImage` already checks `TIER_LIMITS[listing.subscriptionTier].maxMedia`. S4 amends the check to also handle downgrade visibility.

S1's upload route rejects when count reaches limit. S4 adds: on downgrade, excess items get `visibility = "hidden"` (§5.1). On re-upgrade, `visibility` is restored. The upload route counts only `visible` items against the tier limit.

```typescript
// S4 amendment to S1 §5.1: count visible items only for limit enforcement
const visibleCount = await db.select({ count: sql<number>`count(*)` })
  .from(mediaItems)
  .where(and(
    eq(mediaItems.listingId, input.listingId),
    ne(mediaItems.visibility, "hidden"),
  ))
```

**Schema addition for media visibility:**

```typescript
// Migration: add visibility column to media_items (S1 §1.9)
export const mediaVisibilityEnum = pgEnum("media_visibility", ["visible", "hidden"])

// Add to media_items table:
visibility: mediaVisibilityEnum("visibility").notNull().default("visible"),
```

**Schema addition for credit visibility:**

```typescript
// Migration: add visibility column to credits (S1 §1.8)
// Reuse same enum
visibility: mediaVisibilityEnum("visibility").notNull().default("visible"),
```

---

## 5. Downgrade Data Handling

### 5.1 applyDowngrade

[Source: CR concept design §2.5]

```typescript
// src/domains/commercial/subscription/downgrade.ts

async function applyDowngrade(params: {
  listingId: UUID
  previousTier: SubscriptionTier
  newTier: SubscriptionTier
  suppressNotification?: boolean  // true when called from finaliseSubscriptionEnd [S4-ST-8]
}): Promise<void> {
  const { listingId, previousTier, newTier } = params
  const newLimits = TIER_LIMITS[newTier]
  const listing = await getListing(listingId)

  // 1. Update subscription tier
  await db.update(listings).set({
    subscriptionTier: newTier,
    updatedAt: new Date(),
  }).where(eq(listings.id, listingId))

  // 2. Hide excess media
  if (typeof newLimits.maxMedia === "number") {
    const allMedia = await db.select()
      .from(mediaItems)
      .where(eq(mediaItems.listingId, listingId))
      .orderBy(desc(mediaItems.createdAt))

    if (allMedia.length > newLimits.maxMedia) {
      const excessIds = allMedia.slice(newLimits.maxMedia).map(m => m.id)
      await db.update(mediaItems).set({ visibility: "hidden" })
        .where(inArray(mediaItems.id, excessIds))
    }
  }

  // 3. Hide excess credits (unless unlimited)
  if (typeof newLimits.maxCredits === "number") {
    const allCredits = await db.select()
      .from(credits)
      .where(eq(credits.listingId, listingId))
      .orderBy(desc(credits.createdAt))

    if (allCredits.length > newLimits.maxCredits) {
      const excessIds = allCredits.slice(newLimits.maxCredits).map(c => c.id)
      await db.update(credits).set({ visibility: "hidden" })
        .where(inArray(credits.id, excessIds))
    }
  }

  // 4. Emit subscription_tier_changed
  await emit(
    "subscription_tier_changed",
    {
      type: "subscription_tier_changed",
      listingId,
      accountId: listing.accountId!,
      previousTier,
      newTier,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )

  // 5. Notification (suppressed when part of finaliseSubscriptionEnd — subscription_ended consumers handle notification) [S4-ST-8]
  if (!params.suppressNotification) {
  const hiddenMedia = await db.select({ count: sql<number>`count(*)` })
    .from(mediaItems)
    .where(and(eq(mediaItems.listingId, listingId), eq(mediaItems.visibility, "hidden")))
  const hiddenCredits = await db.select({ count: sql<number>`count(*)` })
    .from(credits)
    .where(and(eq(credits.listingId, listingId), eq(credits.visibility, "hidden")))

  let body = `Your listing ${listing.name} is now on the ${newTier} tier.`
  if (hiddenMedia[0].count > 0) body += ` ${hiddenMedia[0].count} media items are now hidden from search.`
  if (hiddenCredits[0].count > 0) body += ` ${hiddenCredits[0].count} credits are now hidden.`

  await createNotification({
    accountId: listing.accountId!,
    type: "subscription_ending",
    title: "Subscription changed",
    body,
    link: `/dashboard/listings/${listingId}/subscription`,
  })
  } // end suppressNotification check [S4-ST-8]
}
```

### 5.2 Re-Upgrade Visibility Restoration

When a listing upgrades, previously hidden items are restored if they now fit within the new tier's limits.

```typescript
// Called after subscription_tier_changed with higher tier
async function restoreHiddenItems(listingId: UUID, newTier: SubscriptionTier): Promise<void> {
  const newLimits = TIER_LIMITS[newTier]

  // Restore media
  if (typeof newLimits.maxMedia === "number") {
    const visibleCount = await countVisible(mediaItems, listingId)
    const canRestore = newLimits.maxMedia - visibleCount
    if (canRestore > 0) {
      const hiddenItems = await db.select()
        .from(mediaItems)
        .where(and(eq(mediaItems.listingId, listingId), eq(mediaItems.visibility, "hidden")))
        .orderBy(asc(mediaItems.createdAt))
        .limit(canRestore)
      if (hiddenItems.length > 0) {
        await db.update(mediaItems).set({ visibility: "visible" })
          .where(inArray(mediaItems.id, hiddenItems.map(m => m.id)))
      }
    }
  } else {
    // Unlimited — restore all
    await db.update(mediaItems).set({ visibility: "visible" })
      .where(and(eq(mediaItems.listingId, listingId), eq(mediaItems.visibility, "hidden")))
  }

  // Same pattern for credits
  if (newLimits.maxCredits === "unlimited") {
    await db.update(credits).set({ visibility: "visible" })
      .where(and(eq(credits.listingId, listingId), eq(credits.visibility, "hidden")))
  } else {
    const visibleCount = await countVisible(credits, listingId)
    const canRestore = (newLimits.maxCredits as number) - visibleCount
    if (canRestore > 0) {
      const hiddenItems = await db.select()
        .from(credits)
        .where(and(eq(credits.listingId, listingId), eq(credits.visibility, "hidden")))
        .orderBy(asc(credits.createdAt))
        .limit(canRestore)
      if (hiddenItems.length > 0) {
        await db.update(credits).set({ visibility: "visible" })
          .where(inArray(credits.id, hiddenItems.map(c => c.id)))
      }
    }
  }
}
```

---

## 6. Pricing Page

SSG (static). [Source: SI §7.1]

```
src/app/pricing/page.tsx       ← public, SSG
```

### 6.1 Content

Renders `PRICING` and `TIER_LIMITS` from CR exports (P4). Tier comparison table with feature matrix. Annual pricing displayed by default, monthly available via toggle. VAT footnote: "All prices exclude VAT. VAT will be added at checkout where applicable."

### 6.2 Checkout CTA

Each paid tier card has a "Get Started" button. Button behaviour:
- **Unauthenticated:** redirects to `/signup?redirect=/pricing&tier={tier}`
- **Authenticated, no claimed listing:** redirects to `/create-listing/type` with message "Create a listing first"
- **Authenticated, has claimed listing(s):** opens Paddle checkout overlay via `subscription.createCheckout`

If the account has multiple claimed listings, the CTA opens a listing selector before checkout.

### 6.3 Launch Discount

```typescript
// src/domains/commercial/subscription/pricing.ts

const LAUNCH_DISCOUNT = {
  eligibleTier: "standard" as const,
  discountedAnnualPrice: 99,
  fullPrice: 199,
  couponCode: "LAUNCH2026",   // Paddle coupon code
  maxRedemptions: 500,
  restrictions: "annual_only" as const,
  displayBadge: "Launch offer: £99/year (normally £199)",
} as const
```

Pricing page displays the launch discount badge on the Standard annual card. Coupon auto-applied when `billingCadence === "annual"` and `tier === "standard"`.

---

## 7. Archival-Path Subscription Cancellation (Resolves S1-9)

S1 deferred `pending_cancellation_created` emission from `listing.archive` because `paddleSubscriptionId` was unavailable. S4 amends the archive route.

### 7.1 S1 Archive Route Amendment

```typescript
// S4 amendment to S1 §4.2 listing.archive mutation

// After S1's existing archival logic (set lifecycleStatus = "archived", emit listing_archived):

// S4 addition: if listing has active paid subscription, initiate Paddle cancellation
if (listing.subscriptionTier !== "free" && listing.paddleSubscriptionId) {
  // 1. Emit pending_cancellation_created (D&L is secondary emitter for archival path)
  // [Source: D&L interface spec §1.10, XI-1]
  await emit(
    "pending_cancellation_created",
    {
      type: "pending_cancellation_created",
      paddleSubscriptionId: listing.paddleSubscriptionId,
      listingId: listing.id,
      reason: "listing_archived" as CancellationReason,
      timestamp: new Date().toISOString(),
    },
    waitUntilFn,
  )

  // 2. subscription_ended will be emitted by Ops when Paddle confirms cancellation.
  // Ops uses pending_cancellation registry to attribute origin: "archival"
  // (reason "listing_archived" → origin "archival" via §2.7 mapping).
  // D&L does NOT emit subscription_ended directly — avoids double emission [S4-ST-7].
}
```

**Consumer for `pending_cancellation_created` (Ops):** Stores pending cancellation record, then calls `PaymentService.cancelSubscription`. Paddle webhook confirmation arrives later — Ops' `inferCancellationReason` matches the stored record.

---

## 8. Grace Period Management

### 8.1 Deferred Action: Grace Period Expiry

```typescript
// DeferredActionParamsMap extension
grace_period_expiry: {
  listingId: UUID
  gracePeriodId: UUID
}

// DeferredActionParamsMap extension
checkout_precondition_retry: {
  paddleEvent: CheckoutCompletedEvent
  attemptCount: number
  maxAttempts: number
}
```

### 8.2 Grace Period Expiry Handler

```typescript
registerActionHandler("grace_period_expiry", async (params) => {
  const { listingId } = params
  const listing = await getListing(listingId)

  // Find active grace period
  const grace = await db.select()
    .from(gracePeriods)
    .where(and(
      eq(gracePeriods.listingId, listingId),
      isNull(gracePeriods.resolvedAt),
    ))
    .limit(1)

  if (grace.length === 0) return  // already resolved (payment recovered or refund)

  // Check if payment was recovered during grace period
  // If listing is no longer in grace state (tier still active, Paddle subscription active),
  // mark grace as resolved
  if (listing.subscriptionTier !== "free" && listing.paddleSubscriptionId) {
    await db.update(gracePeriods).set({
      resolvedAt: new Date(),
      resolution: "payment_recovered",
    }).where(eq(gracePeriods.id, grace[0].id))
    return
  }

  // Grace period expired — finalise cancellation
  await db.update(gracePeriods).set({
    resolvedAt: new Date(),
    resolution: "downgraded",
  }).where(eq(gracePeriods.id, grace[0].id))

  await finaliseSubscriptionEnd(listing, "payment_failure", "paddle")
})
```

### 8.3 Checkout Precondition Retry Handler

```typescript
registerActionHandler("checkout_precondition_retry", async (params) => {
  const { paddleEvent, attemptCount, maxAttempts } = params
  const listing = await getListing(paddleEvent.listingId)

  if (listing.claimStatus === "claimed" && listing.accountId) {
    // Precondition met — process checkout
    await handleCheckoutCompleted(paddleEvent)
    return
  }

  if (attemptCount >= maxAttempts) {
    // 1 hour elapsed — refund and log anomaly
    await services.payment.refundTransaction(paddleEvent.paddleSubscriptionId)
    await logDecision({
      domain: "operations",
      decisionType: "checkout_precondition_failure",
      inputs: { listingId: paddleEvent.listingId, attempts: attemptCount },
      output: { action: "refunded" },
      entityContext: { listingId: paddleEvent.listingId },
    })
    return
  }

  // Retry
  await scheduleDeferredAction({
    action: "checkout_precondition_retry",
    params: { paddleEvent, attemptCount: attemptCount + 1, maxAttempts },
    executeAt: new Date(Date.now() + 5 * 60 * 1000),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "operations",
  })
})
```

---

## 9. Premium Verified Gate (Resolves S3-1)

S3 §8 defined the interface for `evaluatePremiumVerification`. S4 provides the subscription prerequisite check.

```typescript
// S4 provides the gate check consumed by S3's evaluatePremiumVerification

function isPremiumVerificationEligible(listing: Listing): boolean {
  return listing.subscriptionTier !== "free"
}
```

S3's `evaluatePremiumVerification` calls this gate before proceeding with enhanced credential checks. The full implementation remains in S3/S9; S4 provides only the subscription gate.

---

## 10. Event Consumers Registered in S4

S4 registers consumers that react to subscription events. These consumers belong to domains other than Operations (which emits the events).

| Event | Consumer ID | Domain | Mode | Handler |
|---|---|---|---|---|
| `subscription_tier_changed` | `data-and-listings:subscription_tier_changed:tierUpdate` | D&L | Async | Update `listing.subscriptionTier`, recalculate enrichment cadence — already registered in S1 §10. S4 ensures the handler also calls `restoreHiddenItems` on upgrade. |
| `subscription_tier_changed` | `platform:subscription_tier_changed:featureAccessUpdate` | PP | Async | Update feature gates for listing |
| `subscription_tier_changed` | `platform:subscription_tier_changed:providerNotification` | PP | Async | Dashboard notification + email |
| `subscription_tier_changed` | `commercial:subscription_tier_changed:revenueMetrics` | CR | Async | Log conversion/downgrade, update MRR |
| `subscription_ended` | `platform:subscription_ended:downgradeFeatureAccess` | PP | Async | Set feature access to free tier |
| `subscription_ended` | `platform:subscription_ended:resubscribeCTA` | PP | Async | Display re-subscribe CTA (skip if `event.origin === "closure"`) |
| `subscription_ended` | `commercial:subscription_ended:churnAndWinback` | CR | Async | Log churn. If `origin === "paddle"`: schedule `win_back_evaluation` at 60 days. If `origin === "archival"` or `"closure"`: churn log only. |
| `pending_cancellation_created` | `operations:pending_cancellation_created:storeAndCancel` | Ops | Async | Store pending cancellation record, call `PaymentService.cancelSubscription` |

**S1 consumer amendment:** The D&L `subscription_tier_changed` consumer registered in S1 §10 is extended in S4 to also call `restoreHiddenItems` when `event.newTier` rank > `event.previousTier` rank.

**All consumers are async.** No subscription event requires sync processing — the checkout UI uses client-side optimistic updates while webhooks process asynchronously. [Source: SQ-1]

**S4 additions to `EVENT_CONSUMER_MATRIX` (SI §1.5) [S4-ST-10]:**

```typescript
"subscription_tier_changed": [
  { domain: "data-and-listings", mode: "async" },  // existing (S1)
  { domain: "platform", mode: "async" },            // S4 (featureAccessUpdate, providerNotification)
  { domain: "commercial", mode: "async" },           // S4
],
"subscription_ended": [
  { domain: "platform", mode: "async" },             // S4 (downgradeFeatureAccess, resubscribeCTA)
  { domain: "commercial", mode: "async" },            // S4
],
"pending_cancellation_created": [
  { domain: "operations", mode: "async" },            // S4
],
```

---

## 11. Email Templates Registered in S4

S4 registers 1 email template. [S4-ST-9/14: `listing_decay_warning` already registered in SI §5.2 and PP §4.2 — no S4 action required. Belongs to S7 (Operations).]

| Template ID | Trigger | Category | Unsubscribable | Owner |
|---|---|---|---|---|
| `subscription_confirmed` | `checkout_completed` webhook processed | Subscription | No | PP |

**`subscription_confirmed` template:** Sent by the PP `subscription_tier_changed` consumer (provider notification action) on checkout events where `previousTier === "free"`. Merge fields: `{ listingName, tier, billingCadence, annualPrice }`. Added to SI §5.2 and PP §4 as a new template [S4-ST-13].

**Template count after S4:** S0 (2) + S2 (7) + S3 (4) + S4 (1) = 14 of 24 (total increased from 23 to 24 with `subscription_confirmed` addition to master inventory).

---

## 12. Deferred Actions Registered in S4

| Action | Handler | Retry | On Failure | Schedule |
|---|---|---|---|---|
| `grace_period_expiry` | Check if payment recovered; if not, finalise cancellation (§8.2) | `retry_3` | `alert_principal` | 14 days after grace period start |
| `checkout_precondition_retry` | Retry checkout for unclaimed listing; refund after 1 hour (§8.3) | `once` | `log` | 5 minutes after checkout_completed for unclaimed listing |

**`DeferredActionParamsMap` extension:** See §8.1.

---

## 13. Notification Types Used in S4

S4 uses 2 notification types from SI §8.1:

| Type | Trigger | Recipient |
|---|---|---|
| `subscription_confirmed` | Checkout completed | Provider |
| `subscription_ending` | Payment failure, grace period start, voluntary cancellation | Provider |

`subscription_confirmed` is already in SI §8.1. `subscription_ending` is already in SI §8.1.

---

## 14. Downstream Flags

| # | Flag | Target Slice | Source |
|---|---|---|---|
| S4-1 | Subscription analytics in provider dashboard (current tier, billing history, upcoming renewal, feature usage breakdown) — S5 displays, S4 provides data access | S5 | §3.1 |
| S4-2 | Churn intervention UI: retention data display, exit survey, win-back status — S8 evaluates churn triggers, S5 displays intervention prompts | S5/S8 | CR concept design §2.3 |
| S4-3 | Win-back email content, merge field population, and evaluation logic — S8 implements CR's `evaluateWinBack` decision architecture | S8 | CR concept design §2.4 |
| S4-4 | Conversion trigger evaluation (first_enquiry, competitor_upgraded, analytics_teaser, social_proof, view_milestone, engagement_summary) — S8 implements CR's conversion decision architectures | S8 | CR concept design §5 |
| S4-5 | Revenue perception metrics (MRR, ARR, tier distribution, churn rate, conversion rate) — S8 implements CR's revenue perception dashboard | S8 | CR concept design §6 |
| S4-6 | Billing reconciliation monitoring UI and failed event admin view — S7 provides the admin interface for billing health and subscription anomalies | S7 | Ops concept design §7 |
| S4-7 | Feature gate friction tracking (complaint logging per gate, friction ratio computation) — S7 provides admin data entry, Ops provides `getFeatureGateFrictionSummary` query implementation | S7 | Ops interface spec §3.4 |
| S4-8 | Refund processing UI — S7 admin interface for evaluating and executing refunds via Paddle API | S7 | CR concept design §2.6 |
| S4-9 | Sponsored placement tier gating — S8 implements sponsored listing selection with tier eligibility filter | S8 | CR concept design §4.4 |

---

## 15. Acceptance Criteria

### Webhook Handler (10)

| # | Criterion | Test |
|---|---|---|
| AC-1 | Paddle webhook with valid signature returns 200 | Integration |
| AC-2 | Paddle webhook with invalid signature returns 401 | Integration |
| AC-3 | Duplicate Paddle event ID returns 200 without reprocessing | Integration |
| AC-4 | `checkout_completed` sets `subscriptionTier`, `paddleSubscriptionId`, `billingCadence`, `subscriptionStartDate` on listing | Integration |
| AC-5 | `checkout_completed` for unclaimed listing defers to retry queue (does not process immediately) | Integration |
| AC-6 | Retry queue refunds after 12 failed attempts (1 hour) | Integration |
| AC-7 | `subscription_upgraded` emits `subscription_tier_changed` with correct `previousTier` and `newTier` | Integration |
| AC-8 | `subscription_downgraded` triggers `applyDowngrade` with data preservation | Integration |
| AC-9 | `billing_cadence_changed` updates `billingCadence` on listing, emits no domain event | Integration |
| AC-10 | `subscription_cancelled` with pending cancellation record uses stored reason (not Paddle-inferred) | Integration |

### Checkout (5)

| # | Criterion | Test |
|---|---|---|
| AC-11 | `createCheckout` returns Paddle checkout URL for claimed listing | Integration |
| AC-12 | `createCheckout` on unclaimed listing returns BAD_REQUEST | Integration |
| AC-13 | `createCheckout` on listing with active subscription returns BAD_REQUEST | Integration |
| AC-14 | `upgrade` on free listing returns BAD_REQUEST (must use createCheckout) | Integration |
| AC-15 | `upgrade` to lower tier returns BAD_REQUEST | Integration |

### Feature Gating (4)

| # | Criterion | Test |
|---|---|---|
| AC-16 | `computeFeatureAccess("free")` returns correct limits (maxMedia: 5, rankingBoost: 0, etc.) | Unit |
| AC-17 | `computeFeatureAccess("partner")` returns `prioritySupport: true` | Unit |
| AC-18 | `enforceFeatureGate` throws FORBIDDEN for gated feature on free tier | Unit |
| AC-19 | `checkFeatureAccess` returns `true` for paid tier features | Unit |

### Downgrade Data Handling (6)

| # | Criterion | Test |
|---|---|---|
| AC-20 | Downgrade from premium to free hides excess media items (>5) with `visibility = "hidden"` | Integration |
| AC-21 | Downgrade from premium to free hides excess credits (>10) with `visibility = "hidden"` | Integration |
| AC-22 | Hidden media/credits are NOT deleted — present in DB, excluded from buyer-facing queries | Integration |
| AC-23 | Re-upgrade restores hidden items up to new tier limit | Integration |
| AC-24 | Upload route counts only visible items against tier limit | Integration |
| AC-25 | Downgrade notification includes hidden item counts | Integration |

### Grace Period (5)

| # | Criterion | Test |
|---|---|---|
| AC-26 | Payment failure creates grace period (14 days) and notifies provider | Integration |
| AC-27 | Voluntary cancellation creates grace period (14 days) | Integration |
| AC-28 | Grace period expiry with no payment recovery finalises cancellation (emits `subscription_ended`) | Integration |
| AC-29 | Payment recovery during grace period resolves grace as `payment_recovered` | Integration |
| AC-30 | `account_closed`/`listing_archived` cancellation is immediate (no grace period) | Integration |

### Archival Path (3)

| # | Criterion | Test |
|---|---|---|
| AC-31 | `listing.archive` for paid listing emits `pending_cancellation_created` with `reason: "listing_archived"` | Integration |
| AC-32 | `listing.archive` for paid listing does NOT emit `subscription_ended` directly — emitted by Ops after Paddle webhook confirmation, with `origin: "archival"` via pending_cancellation attribution [S4-ST-7] | Integration |
| AC-33 | `listing.archive` for free listing emits no subscription events | Integration |

### Pricing Page (3)

| # | Criterion | Test |
|---|---|---|
| AC-34 | Pricing page renders all 4 tiers with correct annual prices from `PRICING` const | E2E |
| AC-35 | Monthly toggle shows monthly prices | E2E |
| AC-36 | Launch discount badge displayed on Standard annual card | E2E |

### Pending Cancellation Registry (3)

| # | Criterion | Test |
|---|---|---|
| AC-37 | `pending_cancellation_created` consumer stores record in `pending_cancellations` table | Integration |
| AC-38 | Webhook handler matches pending cancellation by `paddleSubscriptionId` and uses stored reason | Integration |
| AC-39 | Records older than 24 hours are cleaned up during webhook processing | Integration |

### Premium Verified Gate (1)

| # | Criterion | Test |
|---|---|---|
| AC-40 | `isPremiumVerificationEligible` returns `false` for free tier, `true` for any paid tier | Unit |

### Event Consumers (3)

| # | Criterion | Test |
|---|---|---|
| AC-41 | D&L `subscription_tier_changed` consumer calls `restoreHiddenItems` on upgrade | Integration |
| AC-42 | PP `subscription_ended` consumer skips re-subscribe CTA when `origin === "closure"` | Integration |
| AC-43 | CR `subscription_ended` consumer schedules `win_back_evaluation` only when `origin === "paddle"` | Integration |

### Multi-Listing (2)

| # | Criterion | Test |
|---|---|---|
| AC-44 | Second listing checkout reuses existing `paddleCustomerId` from account profile | Integration |
| AC-45 | First listing checkout stores `paddleCustomerId` on both account profile and listing | Integration |

### Stress Test Additions (5) [S4-ST-3, S4-ST-5, S4-ST-7, S4-ST-8]

| # | Criterion | Test |
|---|---|---|
| AC-46 | `subscription_ended` for `listing_archived` cancellation has `reason: "cancellation"` and `origin: "archival"` | Integration |
| AC-47 | `subscription_ended` for `paddle_reconciliation` cancellation has `reason: "cancellation"` and `origin: "paddle"` | Integration |
| AC-48 | `processedPaddleEvents` records older than 30 days are deleted during webhook processing | Integration |
| AC-49 | Paddle webhook for archival-path cancellation uses pending_cancellation `reason: "listing_archived"` and emits `subscription_ended` with `origin: "archival"` | Integration |
| AC-50 | Grace period expiry produces both `subscription_tier_changed` and `subscription_ended` but only one provider notification (not two) | Integration |

**Total: 50 acceptance criteria.**

---

## 16. Stress Test Resolution Log (v2)

17 scenarios. 4 High, 7 Medium, 2 Low, 4 Pass. 16 fixes applied. Full analysis: `stress-tests/s4-stress-test.md`.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| S4-ST-1 | `DeferredActionParamsMap` missing `grace_period_expiry` and `checkout_precondition_retry` | **High** | SI §2.1 updated (sibling fix). |
| S4-ST-2 | SI §2.2 registered actions table missing S4 entries | **High** | SI §2.2 updated (sibling fix). |
| S4-ST-3 | `subscription_ended` reason mapping catch-all maps archival to `account_closure` | **High** | Fixed. Reason mapping inverted: only `account_closed` → `"account_closure"`, all others default `"cancellation"`. 2 AC added (AC-46, AC-47). |
| S4-ST-4 | `PaymentService` extension undocumented in SI §10.1 | Medium | SI §10.1 updated (sibling fix). §3.2 note updated. |
| S4-ST-5 | `processedPaddleEvents` cleanup attributed to wrong deferred action | Medium | Fixed. Inline cleanup during webhook processing, same pattern as §2.3. AC-48 added. |
| S4-ST-6 | Archival path hardcodes `subscription_ended` reason | Medium | Resolved by S4-ST-7 (emission removed entirely). |
| S4-ST-7 | Archival path double-emits `subscription_ended` | **High** | Fixed. Removed direct `subscription_ended` from §7.1. D&L emits only `pending_cancellation_created`. Ops emits `subscription_ended` after Paddle confirms, with `origin: "archival"` via registry attribution. D&L §1.10 updated (sibling fix). AC-32 reworded, AC-49 added. |
| S4-ST-8 | `applyDowngrade` + `finaliseSubscriptionEnd` double notification | Medium | Fixed. `suppressNotification` param on `applyDowngrade`. `finaliseSubscriptionEnd` passes `true`. AC-50 added. |
| S4-ST-9 | `listing_decay_warning` double-counted as S4 template | Low | Fixed. Removed from S4 template table. Belongs to S7 (Ops). S4 contributes 1 template. |
| S4-ST-10 | `EVENT_CONSUMER_MATRIX` amendments not documented | Low | Fixed. Matrix entries added to §10. |
| S4-ST-11 | `computeFeatureAccess` simplified signature | Pass | Correct. |
| S4-ST-12 | `TIER_LIMITS` P4 compliance | Pass | Correct. |
| S4-ST-13 | `subscription_confirmed` missing from SI §5.2 and PP §4 | Medium | SI §5.2 and PP §4 updated (sibling fixes). Total templates 23→24. |
| S4-ST-15 | D&L `subscription_tier_changed` consumer `restoreHiddenItems` undocumented | Medium | D&L §2 updated (sibling fix). |
| S4-ST-16 | PP writes to Ops-owned `pending_cancellations` for closure | Medium | Documented as ownership exception in §1.3 and summary. PP §5 updated (sibling fix). |
| S4-ST-17 | Feature gating middleware location | Pass | Correct. |
| S4-ST-18 | Pricing page redirect targets | Pass | Correct. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `interfaces/commercial-and-revenue.md` (v2) | `TIER_LIMITS` §4.1, `computeFeatureAccess` §4.2, `PRICING` §4.3, `mapPaddleWebhook` §4.4, SubscriptionEvent→domain event mapping §4.5, consumed events §2 (win-back scheduling, churn logging), emitted events §1 (`pending_cancellation_created`), shared types §5 |
| `interfaces/operations.md` (v3) | Paddle webhook integration §5, `subscription_tier_changed` emission §1.1, `subscription_ended` emission §1.2, pending cancellation registry §5, consumed events §2 (`pending_cancellation_created`) |
| `interfaces/platform-and-product.md` (v3) | Consumed events §2 (`subscription_tier_changed`, `subscription_ended`), account closure §5 step 2 (closure-path pending_cancellation), email templates §4 |
| `interfaces/data-and-listings.md` (v3) | `subscription_ended` archival emission §1.10, consumed event `subscription_tier_changed` §2, shared types §4 (`SubscriptionTier`) |
| `interfaces/shared-infrastructure.md` (v3) | Event bus §1, deferred actions §2, service abstraction §10 (`PaymentService`), email transport §5, notifications §8, decision logging §9 |
| `2-concept-design/commercial-and-revenue.md` (v4) | Subscription lifecycle §2, pricing §1, TIER_LIMITS §4.2, Paddle webhook mapping §2.2, downgrade handling §2.5, grace period §2.3, refund §2.6, launch discount §1.3, multi-listing §3 |
| `slices/slice-00-infrastructure.md` (v2) | Event bus §2, deferred actions §3, service abstraction §11, tRPC §12 |
| `slices/slice-01-data-model.md` (v2) | Listing schema §1.2 (`subscriptionTier`, `accountId`), media items §1.9, credits §1.8, engagement counters §1.6, D&L `subscription_tier_changed` consumer §10, downstream flag S1-9 (resolved) |
| `slices/slice-03-claim-verify.md` (v2) | Premium Verified gate §8 (resolved by S4 §9), downstream flag S3-1 (resolved) |
