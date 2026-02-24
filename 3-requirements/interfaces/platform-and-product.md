# Platform & Product — Interface Specification

**Status:** Draft v8 — v7 + S10 stress test fix: §6 Autonomy Graduation Admin Surface added — 5 `admin.graduation.*` routes (S10-ST-10).
**Domain:** Platform & Product
**Last updated:** 2026-02-15
**Inputs:** `platform-and-product.md` (v5), `cross-domain-dependencies.md` (v3 §2–§3, §5–§6), `decisions/sq-1.md`, `shared-infrastructure.md` (v2), `data-and-listings.md` (v2), `operations.md` (v2)
**Downstream:** `slices/slice-02-onboarding.md`, `slices/slice-05-provider-exp.md`, `slices/slice-06-buyer-exp.md`

---

## Summary

Platform & Product is the sub-entity that users interact with. It owns the web application, search, onboarding, dashboards, email delivery pipeline, and account closure orchestration. Interface: 9 emitted events, 13 consumed events (3 sync, 10 async), 1 query interface, and 26 email templates delivered via Resend.

---

## 1. Events Emitted (9)

### 1.1 search_performed

```typescript
type SearchFilters = {
  sectors?: string[]
  serviceAreas?: string[]
  specialisations?: string[]
  location?: string                  // region or postcode [PP-ST-10]
}

type SearchPerformedEvent = {
  type: "search_performed"
  query: string
  filters: SearchFilters             // typed subset for cross-domain consumption [PP-ST-10]
  resultCount: number
  sessionId?: string
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Zero-result tracking, taxonomy review | D&L | Log zero-result queries for quarterly taxonomy review | Async |

### 1.2 profile_viewed

```typescript
type ProfileViewedEvent = {
  type: "profile_viewed"
  listingId: UUID
  viewerAccountId?: UUID             // optional — null for anonymous (unauthenticated) viewers [S9-ST-2]
  source: "search" | "direct" | "shortlist"
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Engagement metric update | D&L | Increment `listing.engagement.profileViews` | Async |

### 1.3 enquiry_submitted

```typescript
type EnquirySubmittedEvent = {
  type: "enquiry_submitted"
  enquiryId: UUID                    // reference to PP's enquiry record [PP-ST-12]
  listingId: UUID
  timestamp: ISO8601
}
```

**PII removal [PP-ST-12]:** `senderEmail` and `senderAccountId` removed from cross-domain event payload — no cross-domain consumer uses them. `enquiryId` retained so D&L can queue a reference for unclaimed listings (full enquiry content delivered by PP on claim approval via `deliverPendingEnquiries(listingId)` callback). This keeps PII within PP's boundary while preserving D&L's queue ownership.

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Engagement metric update | D&L | Increment `listing.engagement.enquiriesReceived` | Async |
| Unclaimed enquiry queue | D&L | If listing unclaimed: queue `enquiryId` reference for delivery on claim | Async |
| first_enquiry conversion trigger | CR | Evaluate `first_enquiry` conversion trigger [CR-X-10] | Async |

### 1.4 enquiry_responded

```typescript
type EnquiryRespondedEvent = {
  type: "enquiry_responded"
  listingId: UUID
  enquiryId: UUID
  responseTimeMinutes: number
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Response rate/time calculation | D&L | Update response rate and response time metrics | Async |

### 1.5 shortlist_added

```typescript
type ShortlistAddedEvent = {
  type: "shortlist_added"
  listingId: UUID
  accountId: UUID
  timestamp: ISO8601
}
```

No cross-domain consumers. Domain-internal signal only.

### 1.6 listing_created

```typescript
type ListingCreatedEvent = {
  type: "listing_created"
  listingId: UUID
  accountId: UUID
  entityType: EntityType
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Initial quality score | D&L | Compute initial quality score, emit `quality_score_changed` [XP-19] | Async |
| Onboarding volume tracking | Ops | Increment onboarding counter | Async |

### 1.7 profile_edited

```typescript
type ProfileEditedEvent = {
  type: "profile_edited"
  listingId: UUID
  accountId: UUID
  changedFields: string[]
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Quality score recalculation | D&L | Recalculate quality score (freshness reset), emit `quality_score_changed` | Async |

### 1.8 contact_attempt

```typescript
type ContactAttemptEvent = {
  type: "contact_attempt"
  listingId: UUID
  result: "reached" | "unreachable"
  reporterAccountId?: UUID
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Data quality signal | D&L | Flag unreachable listing for data quality review | Async |
| Outreach prioritisation | Ops | Prioritise unreachable listings for outreach | Async |

### 1.9 account_closed

```typescript
type AccountClosedEvent = {
  type: "account_closed"
  accountId: UUID
  listingsArchived: UUID[]
  buyerDataDeleted: boolean
  complianceHoldActive: boolean
  paddleCancellationsPending: boolean
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Suspend enrichment | D&L | Suspend enrichment for all archived listings [XP-2] | Async |
| Close tickets + compliance | Ops | Close active tickets, update compliance register, create hold monitor if needed [XP-2] | Async |
| Churn analysis | CR | Log churn, cancel win-back schedules | Async |

---

## 2. Events Consumed (13)

### From D&L (9 events)

| Event | PP Consumer | PP Action | Sync/Async |
|---|---|---|---|
| `claim_approved` | Dashboard access + search index | Grant provider dashboard access, add claimed listing to search index | **Sync** |
| `claim_approved` | ISR revalidation | Revalidate listing profile page | Async |
| `claim_approved` | Deliver queued enquiries | Deliver pending enquiries to new claimant | Async |
| `claim_rejected` | Rejection notification | Send rejection email to claimant with reason [DL-ST-2] | Async |
| `listing_archived` | Remove from search index | Remove listing from search index | **Sync** |
| `listing_archived` | ISR revalidation | Revalidate listing profile page and sector/location landings | Async |
| `listing_archived` | Shortlist update | Mark listing as "archived" in buyer shortlists [XP-15] | Async |
| `listing_suspended` | Warning indicator | Add warning indicator to listing in search | Async |
| `listing_suspended` | ISR revalidation | Revalidate listing profile page | Async |
| `listing_suspended` | Shortlist warning | Mark listing as "suspended" in buyer shortlists [XP-15] | Async |
| `listing_reactivated` | Restore to search index | Restore listing to search index | **Sync** |
| `listing_reactivated` | ISR revalidation | Revalidate listing profile page and sector/location landings | Async |
| `listing_reactivated` | Shortlist restore | Restore normal display in buyer shortlists [XP-15] | Async |
| `verification_tier_changed` | Badge display update | Update verification badge on listing profile | Async |
| `verification_tier_changed` | Search index update | Update search facet counts for verification tier [XP-13] | Async |
| `quality_score_changed` | Ranking recalculation | Recalculate search ranking for listing | Async |
| `quality_score_changed` | Clear decay indicator | Clear "may be outdated" indicator if `freshness` dimension present in `changedDimensions` [DL-ST-19, XP-7] | Async |
| `decay_signal_detected` | "May be outdated" indicator | Add buyer-facing indicator for high/critical severity [PP-32] | Async |
| `erasure_completed` | Purge from search | Remove listings from search index | Async |
| `erasure_completed` | ISR revalidation | Revalidate listing profiles and landings | Async |
| `erasure_completed` | Remove from shortlists | Permanently remove from all buyer shortlists [XP-15] | Async |
| `erasure_completed` | Notify shortlist owners | Notify buyers whose shortlists lost entries [XP-15] | Async |
| `erasure_completed` | Anonymise outbound enquiries | Anonymise enquiries sent by the erased account (buyer facet data) [PP-ST-8] | Async |

### From Operations (2 events)

| Event | PP Consumer | PP Action | Sync/Async |
|---|---|---|---|
| `subscription_tier_changed` | Feature access update | Update feature gates for listing (high-priority async) | Async |
| `subscription_tier_changed` | Provider notification | Dashboard notification + email | Async |
| `subscription_ended` | Downgrade feature access | Set feature access to free tier | Async |
| `subscription_ended` | Re-subscribe CTA | Display upgrade prompt on dashboard (skip if `event.origin === "closure"`) | Async |

### From Commercial (2 events)

| Event | PP Consumer | PP Action | Sync/Async |
|---|---|---|---|
| `conversion_milestone` | Dashboard notification | Display milestone notification ("Welcome to Standard!", etc.) | Async |
| `churn_risk_detected` | Quality improvement suggestions | Display proactive quality suggestions on dashboard | Async |

**Sync consumer summary (3 total):**

| Event | Sync Action | Pattern |
|---|---|---|
| `claim_approved` | Dashboard access + search index | Search index consistency |
| `listing_archived` | Remove from search index | Search index consistency |
| `listing_reactivated` | Restore to search index | Search index consistency |

All three sync consumers share the same pattern: search index consistency for user-initiated state changes. [Source: SQ-1 Finding 3]

**Payload fields consumed per P1:**

| Event | Fields Used by PP |
|---|---|
| `claim_approved` | `listingId`, `accountId` |
| `claim_rejected` | `listingId`, `claimantAccountId`, `reason` |
| `listing_archived` | `listingId`, `reactivatable`, `previousStatus`, `accountId` |
| `listing_suspended` | `listingId`, `reason` |
| `listing_reactivated` | `listingId` |
| `verification_tier_changed` | `listingId`, `newTier` |
| `quality_score_changed` | `listingId`, `previousComposite`, `newComposite`, `changedDimensions` |
| `decay_signal_detected` | `listingId`, `signal.severity` |
| `erasure_completed` | `listingIdsAnonymised`, `listingIdsDeleted`, `accountHash`, `senderAccountId` |
| `subscription_tier_changed` | `listingId`, `accountId`, `previousTier`, `newTier` |
| `subscription_ended` | `listingId`, `accountId`, `origin` |
| `conversion_milestone` | `listingId`, `accountId`, `milestone`, `milestoneLabel` |
| `churn_risk_detected` | `listingId`, `riskFactors` |

---

## 3. Query Interfaces Exposed (1)

### 3.1 getListingAnalytics

Time-bucketed engagement data. [Source: CR-X-16]

```typescript
function getListingAnalytics(listingId: UUID, period: "7d" | "30d" | "90d"): ListingAnalyticsSummary

type ListingAnalyticsSummary = {
  listingId: UUID
  period: string
  views: number
  searchAppearances: number
  enquiriesReceived: number
  viewsTrend: "up" | "down" | "stable"
}
```

**Consumers:** CR (conversion triggers, win-back evaluation). [XI-8: D&L removed — D&L owns raw engagement counters and has no documented need for PP's time-bucketed analytics.]

---

## 4. Email Template Inventory (26 templates)

Platform owns the delivery pipeline via Resend. Content ownership is split across three domains.

### 4.1 Platform Transactional (14)

| Template ID | Trigger | Category | Unsubscribable |
|---|---|---|---|
| `email_verification` | Signup | Transactional | No |
| `password_reset` | Self-service | Transactional | No |
| `welcome` | Post-verification | Transactional | No |
| `listing_live` | Listing published (user-initiated creation or claim approval only — not seed import) [PP-ST-20] | Transactional | No |
| `claim_approved` | Claim accepted | Transactional | No |
| `claim_rejected` | Claim rejected | Transactional | No |
| `claim_pending_review` | Claim queued | Transactional | No |
| `new_enquiry` | Enquiry received | Enquiry notification | Yes |
| `enquiry_forwarded` | Unclaimed listing enquiry + claim CTA | Enquiry notification | Yes |
| `enquiry_reminder` | No response in 7 days | Enquiry notification | Yes |
| `profile_day1` | Progressive disclosure: listing live | Profile nudge | Yes |
| `profile_day3` | Progressive disclosure: add portfolio | Profile nudge | Yes |
| `profile_day7` | Progressive disclosure: complete credits | Profile nudge | Yes |
| `listing_update_reminder` | 90 days since last update | Profile nudge | Yes |
| `enquiry_response` | Provider responds to enquiry via dashboard | Transactional | No |

**`listing_live` scoping [PP-ST-9, PP-ST-20]:** This email is a transactional confirmation of the provider's own action. It is non-unsubscribable (consistent with shared-infrastructure §5.2). Seed data import uses `article_14_notice` (Ops compliance) for GDPR notification, not `listing_live`.

### 4.2 Operations Compliance (4)

| Template ID | Trigger | Category | Unsubscribable |
|---|---|---|---|
| `article_14_notice` | 4rfv seed data import (batch) | Transactional | No |
| `dsar_acknowledgment` | DSAR request received | Transactional | No |
| `dsar_completion` | DSAR/erasure completed | Transactional | No |
| `listing_decay_warning` | Decay signal detected | Listing status | Yes |
| `support_acknowledgment` | Inbound support request classified | Transactional | No |

### 4.3 Subscription (1) [S4-ST-13]

| Template ID | Trigger | Category | Unsubscribable |
|---|---|---|---|
| `subscription_confirmed` | Checkout completed (new subscription) | Subscription | No |

### 4.4 Commercial Conversion (5)

Triggers owned by Commercial. Templates delivered by Platform. [Source: CR-X-19]

| Template ID | Trigger | Category | Unsubscribable |
|---|---|---|---|
| `conversion_analytics_teaser` | Weekly, if views > 0 | Conversion marketing | Yes |
| `conversion_social_proof` | Peer upgrade in same area | Conversion marketing | Yes |
| `conversion_view_milestone` | 50/100/250 profile views | Conversion marketing | Yes |
| `conversion_engagement_summary` | Quarterly free-tier report | Conversion marketing | Yes |
| `winback` | 60-day post-cancellation (Ops delivers, CR provides merge fields) [OPS-ST-4] | Conversion marketing | Yes |

---

## 5. Account Closure Orchestration

Platform orchestrates account closure. Steps defined in `shared-infrastructure.md` §13.2. Platform's responsibilities:

1. Archive all listings (per listing — calls D&L). Each archived listing ID is accumulated in the orchestrator's shared context (`TContext.listingsArchived: UUID[]`). [PP-ST-7]
2. Cancel Paddle subscriptions — for each active subscription: create `pending_cancellation` record (with `reason: "account_closed"`, `paddleSubscriptionId`, `listingId`) for Paddle webhook attribution, then call `PaymentService.cancelSubscription` directly. Paddle confirmation arrives via webhook to Ops, which emits `subscription_ended` with closure attribution via the pending_cancellation registry. [PP-ST-19, XI-7] **[S4-ST-16] PP writes directly to Ops-owned `pending_cancellations` table for closure path only. Documented ownership exception — Paddle may webhook immediately after `cancelSubscription`, so the record must exist synchronously before the API call. All non-closure paths use `pending_cancellation_created` event → Ops consumer.**
3. Anonymise buyer enquiry data [XP-1]
4. Delete/defer buyer data (defer if compliance hold)
5. Deactivate account
6. Emit `account_closed` event (reads `listingsArchived` from orchestrator context for payload)

Platform checks `checkComplianceHold` (Ops §3.2) before buyer data deletion. If hold exists, buyer data is deferred to a 30-day extract + weekly re-check via deferred action.

---

## 6. Autonomy Graduation Admin Surface

Platform owns 5 admin routes for sub-entity graduation monitoring and control. Routes read `decision_logs` cross-domain (SI §9.2) and `quality_scores` (D&L). All use `adminProcedure` (SI §4.1).

| Route | Method | Description |
|-------|--------|-------------|
| `admin.graduation.status` | query | Current graduation status per sub-entity/capability |
| `admin.graduation.history` | query | Historical graduation evaluations |
| `admin.graduation.override` | mutation | Manual graduation override |
| `admin.graduation.algorithmRollout` | mutation | Set algorithm V2 rollout percentage |
| `admin.graduation.algorithmComparison` | query | V1 vs V2 quality band comparison |

Full route specifications in S10 `00-router-plan.md` §2.

---

## 7. Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Search index sync update | <200ms p95 | 3 sync consumers must complete before HTTP response |
| ISR revalidation dispatch | <100ms p95 | Async, but should not delay significantly |
| `getListingAnalytics` query | <200ms p95 | Dashboard display, aggregation query |
| Email send (transactional) | <30s p95 | User waiting at screen |
| Email send (async: nudges, conversion) | <5min p95 | No user waiting |
| Notification creation | <100ms p95 | Must not block triggering request |
| Account closure flow | <30s p95 (total) | Multi-step orchestrated flow |

---

## 8. Stress Test Resolution Log (v2)

20 scenarios targeting boundary surface. 2 High, 8 Medium, 5 Low, 5 Pass. 15 fixes applied.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| PP-ST-1 | `claim_approved` consumer table has compound sync/async row — cannot map to `EVENT_CONSUMER_MATRIX` or `consumerId` convention | Medium | Fixed. Split into 3 rows: "Dashboard access + search index" (Sync), "ISR revalidation" (Async), "Deliver queued enquiries" (Async). |
| PP-ST-2 | `listing_archived` consumer table has compound sync/async row | Medium | Fixed. Split into 3 rows: "Remove from search index" (Sync), "ISR revalidation" (Async), "Shortlist update" (Async). |
| PP-ST-3 | `listing_reactivated` consumer table has compound sync/async row | Medium | Fixed. Split into 3 rows: "Restore to search index" (Sync), "ISR revalidation" (Async), "Shortlist restore" (Async). |
| PP-ST-4 | `ClaimRejectedEvent` missing `claimantAccountId` — PP needs it for rejection email. P1 violation. | **High** | Fixed. `claimantAccountId: UUID` added to `ClaimRejectedEvent` payload. D&L §1.2 updated (sibling fix). PP P1 table updated. Cross-domain-deps §2.3 updated. |
| PP-ST-5 | PP's P1 table for `subscription_ended` missing `accountId` | Medium | Fixed. `accountId` added to PP P1 fields for `subscription_ended`. |
| PP-ST-6 | Summary says 12 consumed events, actual count is 13. Commercial header says "1 event" but lists 2. | Low | Fixed. Summary updated to 13. Commercial header updated to "2 events". |
| PP-ST-7 | Account closure step 1 context accumulation undocumented | Low | Fixed. Note added to §5 step 1: listing IDs accumulated in `TContext.listingsArchived`. Step 6 reads from context. |
| PP-ST-8 | `erasure_completed` — PP must anonymise outbound buyer enquiries for erased account. Event payload needs `senderAccountId` for PP to find enquiry records. | **High** | Fixed. `senderAccountId: UUID` added to `ErasureCompletedEvent` payload. "Anonymise outbound enquiries" added to PP's `erasure_completed` consumer actions. D&L §1.9 updated (sibling fix). Cross-domain-deps §2.3 updated. |
| PP-ST-9 | `listing_live` email classified as Listing status / Unsubscribable: Yes — inconsistent with shared-infrastructure §5.2 (Non-unsubscribable). | Medium | Fixed. Updated to Transactional / No. Matches shared-infrastructure §5.2. |
| PP-ST-10 | `SearchPerformedEvent.filters` typed as `Record<string, any>` — untyped in a typed event payload. | Medium | Fixed. Added `SearchFilters` type with `sectors`, `serviceAreas`, `specialisations`, `location`. |
| PP-ST-11 | `profile_viewed` event stripped vs concept design `ProfileViewEvent` | Low | Pass. Cross-domain event correctly carries only `listingId` (what D&L needs). PP retains richer internal event. |
| PP-ST-12 | `EnquirySubmittedEvent` carries PII (`senderEmail`, `senderAccountId`) not consumed by any cross-domain consumer. Data minimisation concern. | Medium | Fixed. PII fields removed. `enquiryId: UUID` added for D&L's unclaimed enquiry queue (stores reference, not PII). Full enquiry content delivered by PP on claim via `deliverPendingEnquiries(listingId)` callback. |
| PP-ST-13 | Partial failure during closure listing archival — does `account_closed` carry correct listing IDs? | Low | Pass. Orchestrator context accumulates across retries (shared-infrastructure §3.3, DL-ST-10). Event emitted once at completion with full set. |
| PP-ST-14 | `getListingAnalytics` vs D&L `getEngagementCounters` — overlapping? | Low | Pass. Different purposes: PP provides time-bucketed trends, D&L provides raw counters. CR correctly uses both. |
| PP-ST-15 | Notification types mismatch between shared-infrastructure §8.1 and concept design PP §6.1 | Low | Pass. Shared-infrastructure defines baseline; slices add types incrementally. |
| PP-ST-16 | `account_closed` event missing closure type for 30-day reopen window | Low | Pass. V1 has only user-initiated closure (always 30-day reopen). Extend later if needed. |
| PP-ST-17 | PP P1 fields for `subscription_tier_changed` — does it declare all needed fields? | N/A | Pass. PP P1 table correctly declares `listingId`, `accountId`, `previousTier`, `newTier`. |
| PP-ST-18 | Cross-references cite `shared-infrastructure.md (v1)` — now v2 | Low | Fixed. Updated to v2. |
| PP-ST-19 | Account closure step 2 says "deferred actions" — resolved design uses direct Paddle API call with webhook confirmation | Medium | Fixed. Step 2 reworded: "direct API call — Paddle confirmation arrives via webhook to Ops." |
| PP-ST-20 | `listing_live` email trigger ambiguous — could fire for 4,700 seed import listings | Medium | Fixed. Trigger scoped to "user-initiated creation or claim approval only — not seed import." Note added linking to `article_14_notice` for seed data. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `platform-and-product.md` (v5) | Domain events (§9), account closure (§13.3), analytics query (§11.3), email templates (§10), search + ranking (§2), onboarding (§4) |
| `cross-domain-dependencies.md` (v3) | Event payloads (§2.3), consumer matrix (§2.2), account closure flow (§6.3), Paddle integration (§3.3) |
| `decisions/sq-1.md` | Sync/async classification — 3 sync consumers, all search index consistency |
| `shared-infrastructure.md` (v2) | Email transport (§5), rendering strategy (§7), notifications (§8), orchestrated flow engine (§3) |
| `data-and-listings.md` (v2) | 9 consumed D&L events, shared types, erasure payload |
| `operations.md` (v2) | 2 consumed Ops events, Paddle webhook attribution |
| `commercial-and-revenue.md` (v2) | 2 consumed CR events, `computeFeatureAccess` import, `TIER_LIMITS` import [XI-14] |
