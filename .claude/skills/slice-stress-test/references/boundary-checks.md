# Boundary Checks by Interface

## For Every Slice

1. **Event emission contracts**: Does the slice emit events with payloads matching the emitter's interface spec? Are all P1 fields present? Is the `origin`/`reason` field set correctly for P3?
2. **Event consumption contracts**: Does the slice register consumers matching the consumer tables in interface specs? Is the sync/async mode correct? Does the handler use only P1-declared payload fields?
3. **DeferredActionParamsMap sync**: Does every deferred action the slice registers have a corresponding entry in SI §2.1 `DeferredActionParamsMap`? Does it have a handler in §2.2?
4. **Email template registration**: Are all email templates used by the slice registered in SI §5.2 and PP §4? Is the count running total correct?
5. **Notification types**: Are all notification types used by the slice listed in SI §8.1?
6. **Service abstraction**: Does the slice use services via the abstraction layer (SI §10)? No direct API calls?
7. **Decision logging**: Are all autonomous decisions logged per SI §9?
8. **Downstream flag resolution**: Does the slice resolve all flags claimed in its header? Are resolutions complete?
9. **New downstream flags**: Are all deferred items properly flagged with target slice?
10. **Acceptance criteria coverage**: Does every functional behaviour in the slice have at least one AC? Are AC test types correct (Unit/Integration/E2E)?
11. **Schema consistency**: Do Drizzle schema additions match the types used in handler code? Column types, nullability, defaults?
12. **Cross-reference accuracy**: Are all spec versions in the cross-references section current?
13. **Type conformance**: When the slice implements a query interface or creates domain-specific records, do the return types and record shapes match the interface spec type definitions — field names, field types, and semantics, not just field existence? (S7-ST-6: `FeatureGateFrictionSummary` had `ticketCount`/`totalTickets` but spec had `complaints`/`conversions` — incompatible field names for the same concept.)
14. **Admin filter producibility**: When the slice adds admin list views that filter by category/type/status values, verify that every filter value is producible by the upstream write path. (S7-ST-8: `refund_request` category never assigned by `classifyTicket`, so `admin.refunds.list` always returned zero results.)

## Shared Infrastructure (SI) Boundary

- Event bus: `EventPayloadMap` entries for new events. `EVENT_CONSUMER_MATRIX` entries for new consumers.
- Deferred actions: `DeferredActionParamsMap` entries. Handler registration in §2.2.
- Orchestrated flows: step definitions match §3.5 skip constraint matrix if flow-related.
- Service interfaces: any extensions to `PaymentService`, `EmailService`, etc. documented?

## Commercial & Revenue (CR) Boundary

- `TIER_LIMITS` usage: does the slice import (P4) or redefine?
- `computeFeatureAccess` usage: correct signature? Simplified input per CR-ST-9?
- `mapPaddleWebhook` execution: Ops calls CR's function, CR does not call Ops?
- `PRICING` const: imported from CR, not redefined?
- `CancellationReason` type: used consistently across all cancellation paths?
- `SubscriptionEvent` → domain event mapping: matches CR §4.5 table?

## Operations (Ops) Boundary

- Paddle webhook: signature verification, idempotency, `waitUntil()` — all within Ops?
- `subscription_tier_changed` / `subscription_ended` emission: Ops is sole primary emitter?
- Pending cancellation registry: creation, lookup, cleanup lifecycle complete?
- TaskSpec references: if slice creates TaskSpecs, do they match Ops §4.1 type?

## Data & Listings (D&L) Boundary

- Listing schema amendments: compatible with S1 §1.2 existing columns?
- `subscription_tier_changed` consumer: D&L updates `subscriptionTier` + enrichment cadence?
- Archival path: `listing.archive` → `pending_cancellation_created` + `subscription_ended` emissions documented?
- Shared types: `SubscriptionTier`, `LifecycleStatus`, etc. imported from D&L §4?

## Platform & Product (PP) Boundary

- Pricing page: SSG per SI §7.1?
- Feature gating: PP imports `computeFeatureAccess` from CR (P4)?
- Account closure: PP writes `pending_cancellation` records directly for closure path (not via event)?
- Email templates: correct category and unsubscribable flag?
- `subscription_tier_changed` / `subscription_ended` consumers: feature access + notification + re-subscribe CTA?

## Slice-Specific Focus Areas

### S6 (Buyer Experience) — UI-heavy, 15 scenarios recommended
**Primary boundaries:** PP (event emissions, search, enquiry submission), D&L (engagement counters, shortlists), CR (feature gating for contact visibility)
**Skip or reduce:** Paddle webhooks, pending cancellations, orchestrated flows, compliance
**Key checks:**
- Anonymous vs authenticated enquiry submission
- Feature-gated contact field visibility (imports `computeFeatureAccess` from CR?)
- `shortlist_added` event emission (no cross-domain consumers — confirm still needed)
- Saved search filter typing (`Record<string, unknown>` → stricter?)
- Enquiry status column existence in `enquiry_records` (S5 amendment)
- Search results rendering (SSR per SI §7.1)

### S7 (Operations) — Domain-logic heavy, 20+ scenarios justified
**Primary boundaries:** SI (orchestrated flows, deferred actions, event consumer errors), Ops interface spec (TaskSpec, compliance, billing), D&L (Paddle webhooks), PP (admin dashboard)
**Expand coverage:** Skip constraint enforcement, orchestrated flow admin, failed event view, TaskSpec lifecycle
**Key checks:**
- S0-3 flag: `orchestrated_flows.updatedAt` column
- S0-11 flag: `event_consumer_errors.resolved`/`resolvedAt` columns
- TaskSpec creation for all task types (manual review, dispute, portfolio)
- Skip constraint matrix enforcement in admin UI
- Paddle webhook signature verification
- Billing reconciliation deferred action logic
- Human procurement channel specification

### S8 (Commercial) — UI-heavy + domain logic mix, 20 scenarios
**Primary boundaries:** CR interface spec (conversion, churn, win-back, sponsored), PP (display surface), D&L (engagement data), Ops (S7 downstream flags)
**Key checks:**
- Conversion trigger evaluation logic
- Churn detection rules — `churn_risk_detected` must include `riskFactors` with `"payment_at_risk"` for S7 high-risk classification (S7-5 flag)
- Win-back merge field generation — `WinbackEligibleEvent.mergeFields` must match the `winback` template fields (S7-1 flag)
- Sponsored placement selection algorithm
- Revenue perception computation
- Content agent divergence: CR evaluation logic vs PP display surface descriptions of the same mechanism (pattern #14)
- Type conformance: return types for any CR query interfaces match field names in spec (pattern from S7-ST-6)

### S9 (Entity Intelligence) — Domain-logic heavy, 20 scenarios
**Primary boundaries:** D&L (quality scoring, decay, enrichment), all interface specs (perception wiring)
**Key checks:**
- 5-dimension quality scoring functions
- Decay detection thresholds
- Enrichment scheduling algorithm
- P2 deduplication for `profile_viewed` (S1-8 flag)
- `account_closed` enrichment suspension (S1-11 flag)

### S10 (Hardening) — Integration-heavy, 20 scenarios
**Primary boundaries:** SI (orchestrated flows), all domain specs (erasure + closure steps)
**Key checks:**
- GDPR erasure: all 6 steps implemented, skip constraints enforced
- Account closure: all 6 steps implemented, skip constraints enforced
- End-to-end cross-domain flow validation
- Per-step failure injection and retry
- R12 requirement coverage
