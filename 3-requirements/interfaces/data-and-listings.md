# Data & Listings — Interface Specification

**Status:** Draft v6 — v5 + S9 stress test fix: §2 P1 fields table +`viewerAccountId` for `profile_viewed` (S9-ST-2).
**Domain:** Data & Listings
**Last updated:** 2026-02-14
**Inputs:** `data-and-listings.md` (v6), `cross-domain-dependencies.md` (v3 §2–§3), `decisions/sq-1.md`, `shared-infrastructure.md` (v6)
**Downstream:** `slices/slice-01-data-model.md`, `slices/slice-03-claim-verify.md`, `slices/slice-09-entity-intel.md`

---

## Summary

This document specifies the boundary surface of the Data & Listings sub-entity — what it exposes to other domains and what it consumes from them. Internals (schema, scoring rules, enrichment algorithms) live in slices. This document covers: 9 emitted events (plus `subscription_ended` and `pending_cancellation_created` emissions for archival path), 9 consumed events, 2 query interfaces, and shared types exported to all domains.

---

## 1. Events Emitted (9 + 1 conditional)

D&L is the sole emitter for 9 event types below. D&L also emits `subscription_ended` for the archival path only (§1.10). Payload schemas are authoritative — consumers depend on these contracts.

### 1.1 claim_approved

```typescript
type ClaimApprovedEvent = {
  type: "claim_approved"
  listingId: UUID
  accountId: UUID
  method: "auto" | "manual" | "disputed_resolved"  // [DL-ST-12]
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Dashboard access + search index | PP | Grant provider dashboard access and add claimed listing to search index | **Sync** |
| ISR revalidation | PP | Revalidate listing profile page | Async |
| Claim volume tracking | Ops | Increment claim approval counter, learning L2/L3 | Async |
| Funnel entry logging | CR | Log conversion funnel entry for new claimed listing | Async |
| Win-back cancellation | CR | Cancel pending win-back schedule for listing [CR-X-17] | Async |
| Conversion trigger reset | CR | Reset all conversion trigger state for listing [CR-29] | Async |

**Sync rationale [DL-ST-1]:** The sync consumer covers both dashboard access grant (user expects to access dashboard immediately) and search index update (newly claimed listing should be findable). This follows the search index consistency pattern identified in SQ-1 Finding 3.

### 1.2 claim_rejected

```typescript
type ClaimRejectedEvent = {
  type: "claim_rejected"
  listingId: UUID
  claimantAccountId: UUID            // PP needs this for rejection email routing [PP-ST-4]
  reason: string
  timestamp: ISO8601
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Rejection notification | PP | Send rejection email to claimant with reason [DL-ST-2] | Async |
| Claim volume tracking | Ops | Increment claim rejection counter | Async |

### 1.3 listing_archived

```typescript
type ListingArchivedEvent = {
  type: "listing_archived"
  listingId: UUID
  accountId: UUID | null           // null for unclaimed listings (entity-initiated cleanup) [DL-ST-3]
  previousStatus: LifecycleStatus  // [DL-ST-20]
  reason: string
  reactivatable: boolean
  subscriptionTier: SubscriptionTier  // enables P1-compliant churn check [DL-ST-18]
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Remove from search | PP | Remove listing from search index | **Sync** |
| ISR revalidation | PP | Revalidate listing profile page and sector/location landings | Async |
| Shortlist update | PP | Mark listing as "archived" in buyer shortlists [XP-15] | Async |
| Close active tickets | Ops | Close active support tickets for listing | Async |
| Churn analysis | CR | Log churn event for voluntary archival if `event.subscriptionTier !== "free"` [DL-ST-18] | Async |

### 1.4 listing_suspended

```typescript
type ListingSuspendedEvent = {
  type: "listing_suspended"
  listingId: UUID
  reason: string
  previousStatus: LifecycleStatus
}
```

**Pre-emission constraint:** D&L checks Operations' `hasActiveTicket` query before emitting. If active ticket exists for `"data_correction"` or `"search_visibility"` category, suspension is deferred until ticket resolves. [Source: D&L §4a, X-20]

**Ticket category convention [DL-ST-4]:** The suspension-blocking categories (`"data_correction"`, `"search_visibility"`) are string conventions, not a shared enum. Operations' `ActiveTicketRecord.category` is `string` (Ops §3.1). D&L matches these two values by convention. If Operations adds new category values, they do not affect suspension logic unless D&L explicitly adds them to the deferral check.

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Warning indicator | PP | Add warning indicator to listing in search | Async |
| ISR revalidation | PP | Revalidate listing profile page | Async |
| Shortlist warning | PP | Mark listing as "suspended" in buyer shortlists [XP-15] | Async |
| Close/update tickets | Ops | Close or update relevant tickets | Async |

### 1.5 listing_reactivated

```typescript
type ListingReactivatedEvent = {
  type: "listing_reactivated"
  listingId: UUID
  accountId: UUID
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Restore to search | PP | Restore listing to search index | **Sync** |
| ISR revalidation | PP | Revalidate listing profile page and sector/location landings | Async |
| Shortlist restore | PP | Restore normal display in buyer shortlists [XP-15] | Async |
| Resume outreach | Ops | Resume suppressed outreach, re-enable enrichment cadence [XP-3] | Async |

### 1.6 verification_tier_changed

```typescript
type VerificationTierChangedEvent = {
  type: "verification_tier_changed"
  listingId: UUID
  previousTier: VerificationTier
  newTier: VerificationTier
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Badge display update | PP | Update verification badge on listing profile | Async |
| Search index update | PP | Update search facet counts for verification tier [XP-13] | Async |

### 1.7 decay_signal_detected

```typescript
type DecaySignalDetectedEvent = {
  type: "decay_signal_detected"
  listingId: UUID
  signal: { type: string; severity: "low" | "medium" | "high" | "critical" }
  activeSupportTicket?: UUID
}
```

**Payload field `activeSupportTicket`:** Present when D&L finds an active ticket via `hasActiveTicket` query before emission. Ops uses this to suppress duplicate outreach. [Source: X-6]

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Cross-ref active tickets | Ops | Suppress duplicate outreach if `activeSupportTicket` present [X-6] | Async |
| "May be outdated" indicator | PP | Add buyer-facing indicator for high/critical severity [PP-32] | Async |

### 1.8 quality_score_changed

```typescript
type QualityScoreChangedEvent = {
  type: "quality_score_changed"
  listingId: UUID
  previousComposite: number
  newComposite: number
  changedDimensions: string[]
}
```

| Consumer | Domain | Action | Sync/Async |
|---|---|---|---|
| Ranking recalculation | PP | Recalculate search ranking for listing | Async |
| Clear decay indicator | PP | Clear "may be outdated" indicator if `freshness` dimension improved (present in `changedDimensions`). Score improvement alone is insufficient — the freshness dimension must have changed, indicating the data staleness that triggered the indicator has been addressed. [DL-ST-19, XP-7] | Async |
| Conversion triggers | CR | Evaluate conversion triggers based on quality change | Async |
| Low-quality intervention | CR | If paid subscriber <40, trigger intervention [CR-X-5] | Async |

### 1.9 erasure_completed

```typescript
type ErasureCompletedEvent = {
  type: "erasure_completed"
  accountHash: string
  senderAccountId: UUID                  // original accountId — PP needs this to anonymise outbound buyer enquiries [PP-ST-8]
  listingIdsAnonymised: UUID[]           // company listings — anonymised, reverted to unclaimed [DL-ST-5]
  listingIdsDeleted: UUID[]              // freelancer listings — fully deleted [DL-ST-5]
  freelancerListingsDeleted: number      // count (redundant with array length, retained for backward compat)
  timestamp: ISO8601
}
```

**Payload change [DL-ST-5]:** `listingsAffected: number` replaced with `listingIdsAnonymised` and `listingIdsDeleted` arrays. PP needs listing IDs to purge from search index and remove from shortlists. A count is insufficient — consumers cannot act without identifiers. `freelancerListingsDeleted` count retained for Ops audit record compatibility.

Emitted within the GDPR erasure orchestrated flow (not normal reactive bus dispatch). PP and CR consumers are reactive (dispatched via event bus after orchestrator completes).

**Ops consumer [DL-ST-6]:** The Ops "close DSAR case + audit record" action is **not a bus consumer**. It is the final step of the orchestrated flow, called directly by the orchestrator (Ops owns the flow). It does not appear in `EVENT_CONSUMER_MATRIX` and the bus does not dispatch to it. The orchestrator calls it, then emits `erasure_completed` to the bus for PP and CR consumers.

| Consumer | Domain | Action | Dispatch |
|---|---|---|---|
| Close DSAR case + audit record | Ops | Close DSAR case, create compliance audit record | **Orchestrator direct call** (not bus) |
| Purge from search | PP | Remove listings from search index | Async (bus) |
| ISR revalidation | PP | Revalidate listing profiles and landings | Async (bus) |
| Remove from shortlists | PP | Permanently remove from all buyer shortlists [XP-15] | Async (bus) |
| Notify shortlist owners | PP | Notify buyers whose shortlists lost entries [XP-15] | Async (bus) |
| Anonymise outbound enquiries | PP | Anonymise enquiries sent by erased account (buyer facet) using `senderAccountId` [PP-ST-8] | Async (bus) |
| Cancel win-back | CR | Cancel pending win-back schedules | Async (bus) |
| Anonymise churn log | CR | Anonymise churn analysis log entries [CD-18] | Async (bus) |
| Clear trigger state | CR | Clear conversion trigger state [CD-18] | Async (bus) |

### 1.10 subscription_ended (archival path only)

D&L is **not the primary emitter** of `subscription_ended` — Operations is (for Paddle-originated endings). D&L emits this event only when archiving a listing that has an active paid subscription (voluntary archival). Platform also emits for the account closure path. [Source: CD-ST-21, DL-ST-14]

```typescript
// Payload type is authoritative in operations.md — D&L imports, does not redefine (P4).
// D&L sets: origin = "archival", reason = "cancellation"
```

**Emission condition:** D&L emits during `archiveListing()` only if `listing.commercial.subscriptionTier !== "free"`. D&L emits `pending_cancellation_created` only:

1. **Emit `pending_cancellation_created`** — D&L emits with `reason: "listing_archived"`, the listing's `paddleSubscriptionId`, and `listingId`. Ops consumes this event: stores the pending cancellation record for Paddle webhook attribution, then calls `PaymentService.cancelSubscription`. When Paddle confirms, Ops emits `subscription_ended` via the standard webhook path, with `origin: "archival"` derived from the pending_cancellation registry's `reason: "listing_archived"`. This keeps Paddle interaction within Ops' domain (D&L does not call PaymentService directly). [XI-1, S4-ST-7]

D&L does NOT emit `subscription_ended` directly for the archival path — this avoids double emission (D&L emitting at archive time + Ops emitting after Paddle confirms). [S4-ST-7]

**Multi-emitter pattern [XI-1]:** `pending_cancellation_created` has three emitters with distinct trigger conditions: CR (churn intervention, low-quality intervention), D&L (archival of paid listing), PP (account closure — writes record directly before calling PaymentService, since PP orchestrates closure and needs synchronous sequencing). This follows the same decomposed-authority pattern as `subscription_ended` (Ops/D&L/PP emit for different trigger paths). The payload type is authoritative in CR §1.4; D&L imports and does not redefine (P4).

**Consumer impact:** Consumers must handle `origin: "archival"` — PP skips re-subscribe CTA (listing is archived), CR logs churn with archival reason. Documented in Ops §1.2, PP §2, CR §2.

---

## 2. Events Consumed (9)

### From Platform (7 events)

| Event | D&L Action | Sync/Async |
|---|---|---|
| `listing_created` | Compute initial quality score, generate `QualityScoreExplanation`, emit `quality_score_changed` [XP-19] | Async |
| `profile_edited` | Recalculate quality score (freshness reset + field change), emit `quality_score_changed` | Async |
| `search_performed` | Log zero-result queries for quarterly taxonomy review [XI-16] | Async |
| `profile_viewed` | Increment `listing.engagement.profileViews` [XI-17] | Async |
| `enquiry_submitted` | Increment `listing.engagement.enquiriesReceived`. If listing unclaimed: queue `enquiryId` reference for delivery on claim [XI-18] | Async |
| `enquiry_responded` | Update `listing.engagement.enquiryResponseRate` and `listing.engagement.enquiryResponseTime` [XI-19] | Async |
| `contact_attempt` | Flag unreachable listing for data quality review (`result === "unreachable"`) [XI-20] | Async |

### From Platform (1 event — closure)

| Event | D&L Action | Sync/Async |
|---|---|---|
| `account_closed` | Suspend enrichment for all archived listings owned by closed account [XP-2] | Async |

### From Operations (1 event)

| Event | D&L Action | Sync/Async |
|---|---|---|
| `subscription_tier_changed` | Update `listing.commercial.subscriptionTier` to `event.newTier`, then recalculate enrichment cadence via `scheduleEnrichment()`. If `event.newTier` rank > `event.previousTier` rank: restore hidden media/credit items up to new tier limit (`restoreHiddenItems`). [X-18, DL-ST-9, S4-ST-15] | Async |

**Payload fields consumed per P1 (payload self-containment):**

| Event | Fields Used by D&L |
|---|---|
| `listing_created` | `listingId`, `accountId`, `entityType` |
| `profile_edited` | `listingId`, `changedFields` |
| `search_performed` | `query`, `filters`, `resultCount` |
| `profile_viewed` | `listingId`, `viewerAccountId`, `source` |
| `enquiry_submitted` | `enquiryId`, `listingId` |
| `enquiry_responded` | `listingId`, `enquiryId`, `responseTimeMinutes` |
| `contact_attempt` | `listingId`, `result` |
| `account_closed` | `accountId`, `listingsArchived` |
| `subscription_tier_changed` | `listingId`, `newTier` |

---

## 3. Query Interfaces Exposed (2)

### 3.1 computeTaxonomyOverlap

Shared data contract. Jaccard similarity on Service Area tags. [Source: CR-X-12]

```typescript
function computeTaxonomyOverlap(
  tagsA: TaxonomyTag[],
  tagsB: TaxonomyTag[]
): number  // 0–1, Jaccard similarity at Service Area level
```

**Consumer:** Commercial — used for `competitor_upgraded` conversion trigger. [Source: CR §5.3]

### 3.2 Engagement counters (read-only)

D&L's `listing.engagement` is the single source of truth for engagement data. Other domains read these values — they do not maintain separate counters. [Source: CR-X-10, CR-X-18]

```typescript
type EngagementCounters = {
  profileViews: number
  searchAppearances: number
  enquiriesReceived: number
  enquiryResponseRate?: number
  enquiryResponseTime?: number
}

function getEngagementCounters(listingId: UUID): EngagementCounters
```

**Unclaimed listing behaviour [S6-ST-11]:** Returns zero-initialised counters for unclaimed listings. Callers may choose to skip the call for unclaimed listings (no engagement data exists), but the interface does not reject them.

**Consumers:** PP (dashboard display), CR (`basicAnalytics` maps 1:1 to the first three counters — `profileViews`, `searchAppearances`, `enquiriesReceived`).

**Relationship to CR's `EnquiryResponseInsights` [DL-ST-7]:** CR defines `EnquiryResponseInsights` (CR §5) as a premium analytics type with derived metrics (median response time, p90, rate vs category average). D&L's `enquiryResponseRate` and `enquiryResponseTime` are raw values stored on the listing. CR reads the raw values via `getEngagementCounters`, then computes derived insights internally. The two types serve different consumers: D&L exposes raw counters; CR transforms them for premium subscribers.

---

## 4. Shared Types Exported

D&L defines the following types consumed by all domains. Changes to these types break consumers at compile time (P4).

```typescript
type SubscriptionTier = "free" | "standard" | "premium" | "partner"
type VerificationTier = "unclaimed" | "claimed" | "verified" | "premium_verified"
type LifecycleStatus = "active" | "inactive" | "merged" | "dissolved" | "suspended" | "archived"
type ClaimStatus = "unclaimed" | "pending_review" | "claimed" | "disputed"
type EntityType = "freelancer" | "company" | "education" | "industry_body" | "public_sector" | "non_profit"
type CreditFormat = "feature" | "tv_series" | "tv_one_off" | "short" | "commercial" | "corporate" | "music_video" | "digital_social" | "live_event"

type TaxonomyTag = {                    // [DL-ST-15]
  sector: string                        // Level 1 — 7 sectors
  serviceArea: string                   // Level 2 — ~51 service areas
  specialisation?: string               // Level 3 — ~209 specialisations (optional)
}

type QualityScore = {
  completeness: number    // 0–25
  freshness: number       // 0–25
  accuracy: number        // 0–20
  richness: number        // 0–15
  verification: number    // 0–15
  composite: number       // 0–100
  lastCalculated: ISO8601
}

type QualityScoreExplanation = {
  composite: number
  dimensions: {
    name: string
    score: number
    maxScore: number
    factors: { factor: string; impact: "positive" | "neutral" | "negative"; detail: string }[]
  }[]
  topImprovements: string[]
}
```

---

## 5. Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Quality score computation latency | <100ms p95 | Triggered by profile edits; must not block save response |
| Engagement counter increment | <50ms p95 | High-frequency event (profile views) |
| `computeTaxonomyOverlap` | <50ms p95 | Called during conversion trigger evaluation |
| Event emission | <10ms p95 | Bus dispatch, not external I/O |

---

## 6. Stress Test Resolution Log (v2)

20 scenarios targeting D&L interface boundary surface. 3 High, 7 Medium, 4 Low, 6 Pass. 14 fixes applied.

| # | Scenario | Severity | Resolution |
|---|---|---|---|
| DL-ST-1 | `claim_approved` sync consumer labelled "Dashboard access grant" but SQ-1 Finding 3 says all sync consumers are search index consistency. Consumer actually does both. | Medium | Fixed. Consumer renamed "Dashboard access + search index". Note added clarifying dual action. |
| DL-ST-2 | PP consumes `claim_rejected` (sends rejection email) but D&L spec only listed Ops as consumer. | **High** | Fixed. PP "Rejection notification" consumer added to §1.2. |
| DL-ST-3 | `listing_archived` payload has `accountId: UUID` but unclaimed listings have `accountId = null`. Entity-initiated cleanup of unclaimed listings produces invalid payload. | Medium | Fixed. `accountId` typed as `UUID | null`. |
| DL-ST-4 | Pre-emission constraint for `listing_suspended` references ticket categories `"data_correction"` / `"search_visibility"` but Ops `ActiveTicketRecord.category` is `string`, not an enum. | Low | Fixed. Note added: string convention, not shared enum. |
| DL-ST-5 | `erasure_completed` payload has `listingsAffected: number` (count). PP needs listing IDs to purge search index and remove from shortlists. Count is insufficient. | **High** | Fixed. `listingsAffected` replaced with `listingIdsAnonymised: UUID[]` and `listingIdsDeleted: UUID[]`. `freelancerListingsDeleted` count retained for audit. |
| DL-ST-6 | `erasure_completed` Ops consumer labelled "Orchestrated" but event bus only has `sync`/`async` modes. Ops consumer is not bus-dispatched — it's called directly by the orchestrator. | Medium | Fixed. Consumer table column changed to "Dispatch". Ops row marked "Orchestrator direct call (not bus)". Note clarifies Ops action is the final orchestrator step, not a bus consumer. |
| DL-ST-7 | `EngagementCounters` has `enquiryResponseRate`/`enquiryResponseTime` (optional). CR's `EnquiryResponseInsights` has `responseRate`/`medianResponseTime` (required). Overlapping shapes for related data. | Medium | Fixed. Note added clarifying D&L exposes raw values, CR computes derived premium analytics from them. |
| DL-ST-8 | D&L consumes `listing_created.accountId` but initial quality score computation doesn't need accountId. | Low | Pass. `accountId` is used for entity perception (multi-listing account pattern detection). Legitimate P1 usage. |
| DL-ST-9 | D&L consumes `subscription_tier_changed` but doesn't document that it updates `listing.commercial.subscriptionTier`. | Medium | Fixed. Consumer action expanded: "Update `listing.commercial.subscriptionTier` to `event.newTier`, then recalculate enrichment cadence." |
| DL-ST-10 | `account_closed.listingsArchived` may miss listings archived in a prior partial attempt before flow resume. | Low | Pass. The orchestrator's context is persisted and restored on resume (shared-infrastructure §3.3). Context accumulates all archived listing IDs across attempts. |
| DL-ST-11 | `QualityScoreExplanation.topImprovements: string[]` — no enum for improvement suggestions. | Low | Pass. Free text by design. Improvement suggestions are computed per listing from dimension analysis. |
| DL-ST-12 | `ClaimApprovedEvent.method` has `"auto" | "manual"` but no value for disputed claims resolved in claimant's favour. | Low | Fixed. Added `"disputed_resolved"` to method union. |
| DL-ST-13 | `verification_tier_changed` has only PP consumers. Ops could use for compliance tracking. | Low | Pass. Deliberately excluded — Ops tracks verification via claim volume events, not tier changes. |
| DL-ST-14 | D&L emits `subscription_ended` for archival path (CD-ST-21) but this was not documented in D&L interface spec. | **High** | Fixed. Added §1.10 documenting D&L's conditional emission of `subscription_ended` for archival path only. P4-compliant: imports payload type from Ops, sets `origin: "archival"`. |
| DL-ST-15 | `computeTaxonomyOverlap` takes `TaxonomyTag[]` but `TaxonomyTag` type not defined in shared types. | Medium | Fixed. `TaxonomyTag` type added to §4 with 3-level structure (sector, serviceArea, specialisation?). |
| DL-ST-16 | CR accesses engagement data via both query interface and events. Dual access pattern not documented. | Low | Pass. Distinct paths: query for current counters, events for state-change reactions. Both are correct. |
| DL-ST-17 | Quality score consumer chain (compute <100ms + emit <10ms = <110ms) against 5s async budget. | Low | Pass. No conflict. Well within budget. |
| DL-ST-18 | `listing_archived` CR consumer "if paid" — but subscription tier not in payload. P1 violation. | Medium | Fixed. `subscriptionTier: SubscriptionTier` added to `ListingArchivedEvent` payload. CR consumer checks `event.subscriptionTier !== "free"`. |
| DL-ST-19 | `quality_score_changed` PP consumer clears decay indicator "if score improved" — but score improvement doesn't necessarily resolve the decay signal (e.g., stale contact info). | Medium | Fixed. Clearance condition tightened: `freshness` dimension must be present in `changedDimensions`. |
| DL-ST-20 | `listing_archived` payload missing `previousStatus`. Consumer can't distinguish active→archived from suspended→archived. | Low | Fixed. `previousStatus: LifecycleStatus` added to `ListingArchivedEvent` payload. |

---

## Cross-References

| Document | Relationship |
|---|---|
| `data-and-listings.md` (v6) | Domain events (§4a), consumed events (§4a table), quality score explanation (§4b), taxonomy utilities (§5 Layer 5), GDPR erasure (§6) |
| `cross-domain-dependencies.md` (v3) | Event payloads (§2.3), consumer matrix (§2.2), query interfaces (§2.4), shared types (§3.1) |
| `decisions/sq-1.md` | Sync/async classification for all consumers |
| `shared-infrastructure.md` (v2) | Event bus contract (§1), P1–P5 principles (§1.4), `EventPayloadMap` (§1.2), orchestrated flow engine (§3) |
