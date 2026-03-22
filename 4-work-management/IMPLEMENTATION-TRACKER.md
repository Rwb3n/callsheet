# Implementation Tracker

**Status:** Active
**Epoch:** CS-E1 (Platform Build)
**Last updated:** 2026-03-08

---

## Progress Summary

| Metric | Value |
|--------|-------|
| Work items complete | **7 / 7 (S0)**, **6 / 6 (S1)**, **2 / 2 (S1 Seed)**, **4 / 4 (Comms P1)**, **10 / 10 (S2)**, **4 / 4 (S3)**, **8 / 8 (S4)**, **7 / 7 (S5)**, **7 / 7 (S6)**, **9 / 9 (S7)**, **9 / 9 (S8)**, **8 / 8 (S9)** |
| AC verified (unit/integration/e2e) | **52 / 51 (S0)**, **42 / 42 (S1)**, **9 / 9 (S1 Seed)**, **17 / 17 (Comms P1)**, **41 / 41 (S2)**, **48 / 48 (S3)**, **47 / 50 + 3 e2e (S4)**, **46 / 46 (S5)**, **49 / 52 (S6)**, **101 / 101 (S7)**, **93 / 93 (S8)**, **101 / 101 (S9)**, 646 / 806 (total) |
| AC deferred to E2E | 6 (see E2E Debt below) |
| Slices with code | **S0 complete**, **S1 complete**, **S1 Seed complete**, **Comms Phase 1 complete**, **S2 complete**, **S3 complete**, **S4 complete**, **S5 complete**, **S6 complete**, **S7 complete**, **S8 complete**, **S9 complete** |
| Tests passing | 1723 (690 unit + 1026 integration + 7 E2E). 0 pre-existing failures. |
| Type errors | 0 |

---

## S0: Infrastructure — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-001 | Event bus module | 9/9 | **done** | — | 002, 003 | `src/lib/events/*`, `src/db/schema/shared.ts` |
| CS-WORK-002 | Deferred action scheduler | 8/8 | **done** | ~~001~~ | 004 | `src/lib/scheduler/*`, `src/db/schema/shared.ts` |
| CS-WORK-003 | Decision logging framework | 1/1 | **done** | ~~001~~ | — | `src/lib/decisions/*`, `src/db/schema/shared.ts` |
| CS-WORK-004 | Orchestrated flow engine | 8/8 | **done** | ~~002~~ | — | `src/lib/flows/*`, `src/db/schema/shared.ts` |
| CS-WORK-005 | Email transport and auth | 6/9 + 3 e2e | **done** | — | — | `src/lib/email/*`, `src/lib/auth.ts`, `src/server/trpc.ts` |
| CS-WORK-006 | Storage, rendering, notifications, service abstraction, tRPC, CI/CD | 13/16 + 3 e2e | **done** | — | — | `src/lib/storage/*`, `src/lib/notifications/*`, `src/lib/services/*`, `src/lib/isr.ts`, `src/server/error-handler.ts`, `.github/workflows/ci.yml` |
| CS-WORK-034 | E2E verification harness — Phase 1 (API-level) | 7/7 | **done** | ~~005~~ | — | `playwright.config.ts`, `e2e/auth-flow.spec.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/test/reset/route.ts`, `src/app/api/test/emails/route.ts`, `src/lib/auth-instance.ts`, `src/lib/services/__tests__/production-services.test.ts` |

**S0 total:** 52/51 AC verified (45 unit/integration + 7 E2E/smoke). Closes AC-21, AC-22, S2-AC-02, AC-42. Remaining E2E debt: AC-25 (browser, Phase 2), AC-35 (SSG, vacuous), AC-52 (CI meta, manual).

### Dependency Graph

```
CS-WORK-001 (Event Bus) ✅
  ├──▶ CS-WORK-002 (Scheduler) ✅
  └──▶ CS-WORK-003 (Decision Logging) ✅

CS-WORK-002 (Scheduler) ✅
  └──▶ CS-WORK-004 (Flow Engine) ✅

CS-WORK-005 (Email + Auth) ✅
  └──▶ CS-WORK-034 (E2E Harness Phase 1, 7 AC) ✅
CS-WORK-006 (Storage/Render/CI) ✅
```

**S0 fully complete.** 52 AC verified (45 unit/integration + 7 E2E/smoke). 4 upstream deferred ACs closed (AC-21, AC-22, S2-AC-02, AC-42).

---

## S1: Data Model — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-007 | Data model schema and seed | 10/10 | **done** | — | 008, 009, 010, 011, 012 | `src/db/schema/auth.ts`, `src/db/schema/data-and-listings.ts`, `src/db/schema/accounts.ts`, `src/db/types.ts`, `src/db/seed/*`, `drizzle/0001_*.sql` |
| CS-WORK-008 | Full-text search infrastructure | 5/5 | **done** | ~~007~~ | — | `src/lib/search/ranking.ts`, `src/lib/search/synonyms.ts`, `src/lib/search/index.ts`, `src/server/routers/listing.ts` (search route) |
| CS-WORK-009 | Listing and profile CRUD routes | 9/9 | **done** | ~~007, 011~~ | — | `src/server/routers/listing.ts`, `src/server/routers/profile.ts`, `src/server/routers/taxonomy.ts`, `src/server/routers/engagement.ts`, `src/lib/jsonld/listing.ts` |
| CS-WORK-010 | Image upload pipeline | 4/4 | **done** | ~~007~~ | — | `src/server/routers/media.ts`, `src/domains/commercial/tier-limits.ts` |
| CS-WORK-011 | Listing integrity rules + taxonomy overlap | 6/6 | **done** | ~~007~~ | 009 | `src/domains/data-and-listings/integrity/*`, `src/domains/data-and-listings/taxonomy/overlap.ts` |
| CS-WORK-012 | Event consumers and query interfaces | 8/8 | **done** | ~~007~~ | — | `src/domains/data-and-listings/consumers/*`, `src/lib/events/types.ts`, `src/lib/events/errors.ts` |

**S1 total:** 42/42 AC. **S1 code complete.**

### Dependency Graph

```
CS-WORK-007 (Schema + Seed, 10 AC) ✅
  ├──▶ CS-WORK-008 (Search, 5 AC) ✅
  ├──▶ CS-WORK-010 (Images, 4 AC) ✅
  ├──▶ CS-WORK-011 (Integrity, 6 AC) ✅
  │      └──▶ CS-WORK-009 (CRUD + JSON-LD, 9 AC) ✅
  └──▶ CS-WORK-012 (Consumers + Queries, 8 AC) ✅
```

**S1 code complete.** 42/42 AC verified at unit/integration level.

---

## S1 Seed Pipeline (CH-CS-003) — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-021 | 4rfv import pipeline | 7/7 | **done** | — | 022, 024 | `src/db/schema/data-and-listings.ts` (+source column), `drizzle/0002_*.sql`, `src/scripts/import/*` (8 files), `src/scripts/import/__tests__/*` (4 files) |
| CS-WORK-022 | Article 14 notices | 2/2 | **done** | ~~021~~ | — | `src/scripts/import/phase-5-article14.ts`, `src/scripts/import/__tests__/phase-5-article14.integration.test.ts`, `drizzle/0003_*.sql` |
| CS-WORK-024 | 4rfv SQLite extraction + cleaning | 0/8 | pending | — | enables 021 | — |

**S1 Seed total:** 9/9 AC verified (pipeline + Article 14). CS-WORK-024 (8 AC, extraction) pending.

CS-WORK-024 bridges the 4rfv SQLite source DB (`4-work-management/4rfv_directory.db`, ~25MB, 4,657 `companies` rows, ~790 subcategories) to the existing import pipeline. **Step 1 is data profiling** — catalogue field-level quality issues before writing extraction code. Then: taxonomy mapping (790 subcategories → 7/64/269), entity type inference, field extraction with data quality handling, and integration test proving the round-trip through `runImportPipeline()`.

### Dependency Graph

```
CS-WORK-024 (SQLite Extraction, ? AC) pending
  └──▶ CS-WORK-021 (Import Pipeline, 7 AC) ✅
         └──▶ CS-WORK-022 (Article 14, 2 AC) ✅
```

---

## S0 Extension: Communications Phase 1 (CH-CS-013) — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-025 | Correspondence log schema + migration | 4/4 | **done** | — | 026, 027, 028 | `src/db/schema/correspondence.ts`, `drizzle/0004_*.sql`, `src/lib/scheduler/types.ts`, `src/db/test-utils.ts`, `src/db/index.ts` |
| CS-WORK-026 | EmailService correspondence logging | 4/4 | **done** | ~~025~~ | 027 | `src/lib/email/logging-service.ts`, `src/lib/email/correspondence.ts`, `src/lib/email/suppression.ts`, `src/lib/email/types.ts`, `src/lib/email/transport.ts` |
| CS-WORK-027 | Outbound webhook + status lifecycle | 5/5 | **done** | ~~025, 026~~ | 028 | `src/app/api/webhooks/email/events/route.ts`, `src/lib/email/webhook-handler.ts`, `src/lib/email/webhook-types.ts`, `src/lib/email/webhook-verifier.ts` |
| CS-WORK-028 | Bounce handling, suppression, DSAR | 4/4 | **done** | ~~025, 027~~ | — | `src/lib/email/bounce-handler.ts`, `src/lib/email/correspondence-queries.ts` |

**Communications Phase 1 total:** 17/17 AC verified. 17 unit tests + 19 integration tests. 0 type errors.

### Dependency Graph

```
CS-WORK-025 (Schema, 4 AC) ✅
  ├──▶ CS-WORK-026 (Logging, 4 AC) ✅
  │      └──▶ CS-WORK-027 (Webhook, 5 AC) ✅
  │              └──▶ CS-WORK-028 (Bounce + DSAR, 4 AC) ✅
  └──▶ CS-WORK-027 (also depends on 025 directly)
```

**Communications Phase 1 code complete.** Correspondence log, LoggingEmailService decorator, Resend webhook, bounce handling with suppression, DSAR queries. Phase 2 (inbound email) and Phase 3 (enquiry reply parsing) not started.

---

## S2: Onboarding — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-013 | Account creation and onboarding router | 4/5 + 1 e2e | **done** | — | 014, 015, 016 | `src/server/routers/onboarding.ts`, `src/lib/onboarding/*`, `src/server/trpc.ts` (+verifiedProcedure), `src/db/schema/accounts.ts` (+departments), `drizzle/0005_*.sql` |
| CS-WORK-014 | Freelancer listing creation | 5/5 | **done** | ~~013~~ | 018 | `src/server/routers/listing-creation.ts`, `src/lib/onboarding/schedule-progressive-disclosure.ts`, `src/lib/onboarding/email-templates.ts`, `src/lib/onboarding/generate-slug.ts`, `src/lib/scheduler/types.ts` (+send_progressive_email) |
| CS-WORK-015 | Company listing creation and CH lookup | 5/5 | **done** | ~~013~~ | 018 | `src/server/routers/listing-creation.ts` (+createCompany, +lookupCompaniesHouse) |
| CS-WORK-016 | Claim path and pre-claim snapshots | 7/7 | **done** | ~~013~~ | — | `src/server/routers/claim.ts`, `src/lib/onboarding/endowment-messaging.ts`, `src/lib/onboarding/schedule-claim-progressive-disclosure.ts`, `src/lib/onboarding/deliver-pending-enquiries.ts`, `src/lib/onboarding/pre-claim-snapshot-cleanup.ts`, `src/lib/scheduler/types.ts` (+pre_claim_snapshot_cleanup) |
| CS-WORK-017 | Profile strength meter | 3/3 | **done** | — | — | `src/lib/onboarding/profile-strength.ts`, `src/server/routers/profile-strength.ts` |
| CS-WORK-018 | Progressive disclosure handlers and emails | 6/6 | **done** | ~~014, 015~~ | — | `src/lib/scheduler/handlers/progressive-email.ts`, `src/lib/scheduler/handlers/day14-prompt.ts`, `src/lib/onboarding/progressive-check.ts`, `src/lib/onboarding/email-templates.ts` (+3 templates), `src/lib/onboarding/schedule-progressive-disclosure.ts` (+Day 14), `src/lib/scheduler/types.ts` (+onboarding_day14_prompt), `src/lib/notifications/types.ts` (+onboarding_prompt) |
| CS-WORK-019 | Intelligent taxonomy suggestions | 3/3 | **done** | — | — | `src/lib/onboarding/suggestions.ts` |
| CS-WORK-020 | Image processing pipeline | 4/4 | **done** | — | — | `src/lib/image-processing/variants.ts`, `src/lib/image-processing/naming.ts`, `src/server/routers/media.ts` (amended). `ObjectStorageService` +download(). 14 unit + 11 integration tests. |
| CS-WORK-023 | Article 14 compliance handlers | 3/3 | **done** | ~~022~~ | — | `src/lib/scheduler/handlers/article14-progress.ts`, `src/lib/compliance/article14-notice.ts`, `src/lib/compliance/__tests__/article14.integration.test.ts` |
| CS-WORK-029 | E2E verification workflow investigation | 4/5 | **done** | — | — | `1-investigation/e2e-verification-workflow.md` |

**S2 progress:** 40/41 AC verified (unit/integration). 1 AC (AC-02) deferred to E2E. **10/10 work items done. S2 CODE COMPLETE.**

### Dependency Graph

```
CS-WORK-013 (Account Creation, 5 AC) ✅
  ├──▶ CS-WORK-014 (Freelancer Creation, 5 AC) ✅
  │      └──▶ CS-WORK-018 (Progressive Disclosure Handlers, 6 AC) ✅
  ├──▶ CS-WORK-015 (Company Creation + CH Lookup, 5 AC) ✅
  │      └──▶ CS-WORK-018 (also depends on 015) ✅
  └──▶ CS-WORK-016 (Claim Path + Snapshots, 7 AC) ✅

CS-WORK-017 (Profile Strength, 3 AC) ✅
CS-WORK-019 (Taxonomy Suggestions, 3 AC) ✅
CS-WORK-020 (Image Processing, 4 AC) ✅
CS-WORK-023 (Article 14 Handlers, 3 AC) ✅
CS-WORK-029 (E2E Investigation, 5 AC) ✅
```

---

## S3: Claim & Verify — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-030 | evaluateClaim decision engine | 14/14 | **done** | — | 031, 032 | `src/domains/data-and-listings/claim/types.ts`, `src/domains/data-and-listings/claim/evaluate-claim.ts`, `src/domains/data-and-listings/claim/email-templates.ts`, `src/server/routers/claim.ts` (S3 amendment), `src/lib/email/types.ts` (+claim_dispute_notification), `src/lib/scheduler/types.ts` (+dispute_escalation_check) |
| CS-WORK-031 | Claim approval and rejection pipelines | 16/16 | **done** | ~~030~~ | — | `src/domains/data-and-listings/claim/claim-approved.ts`, `src/domains/data-and-listings/claim/claim-rejected.ts`, `src/lib/onboarding/deliver-pending-enquiries.ts` (replaced stub), `src/lib/events/types.ts` (ClaimApproved/RejectedEvent payloads + search index consumer), `src/server/routers/claim.ts` (+eventBus, +waitUntilFn, +emailService, +notificationDb), `src/lib/onboarding/email-templates.ts` (+enquiry_forwarded) |
| CS-WORK-032 | Manual review and competing claims | 13/13 | **done** | ~~030~~ | — | `src/domains/data-and-listings/claim/manual-review.ts`, `src/domains/data-and-listings/claim/competing-claim.ts`, `src/server/routers/claim.ts` (resolveManualReview wired), `src/lib/events/types.ts` (ListingSuspendedEvent fleshed out) |
| CS-WORK-033 | Verification upgrade path | 5/5 | **done** | — | — | `src/domains/operations/types.ts` (TaskSpec shared), `src/domains/data-and-listings/verification/types.ts`, `src/domains/data-and-listings/verification/evaluate-upgrade.ts`, `src/server/routers/verification.ts`, `src/lib/events/types.ts` (VerificationTierChangedEvent fleshed out) |

**S3 total:** 48/48 AC verified (unit/integration). **S3 code complete.**

### Dependency Graph

```
CS-WORK-030 (Eval Engine, 14 AC) ✅
  ├──▶ CS-WORK-031 (Approval+Rejection, 16 AC) ✅
  └──▶ CS-WORK-032 (Manual Review+Disputes, 13 AC) ✅

CS-WORK-033 (Verification Upgrade, 5 AC) ✅ (independent)
```

---

## S4: Subscriptions — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-035 | Subscription schema, types, Paddle mapping | 11/11 | **done** | — | 037, 038, 039, 040, 041 | `src/db/schema/operations.ts`, `src/db/schema/commercial.ts`, `src/domains/operations/paddle/*`, `src/domains/commercial/subscription/types.ts`, `src/domains/commercial/subscription/map-paddle-webhook.ts`, `src/app/api/paddle/webhook/route.ts`, `drizzle/0006_*.sql` |
| CS-WORK-036 | Feature gating and pricing config | 5/5 | **done** | — | 040, 042 | `src/domains/commercial/subscription/feature-access.ts`, `src/domains/commercial/subscription/pricing.ts`, `src/lib/feature-gate.ts`, `src/domains/data-and-listings/verification/premium-gate.ts` |
| CS-WORK-037 | Downgrade and re-upgrade logic | 6/6 | **done** | ~~035~~ | 039 | `src/domains/commercial/subscription/downgrade.ts`, `src/domains/commercial/subscription/restore-hidden.ts`, `src/server/routers/media.ts` (amended) |
| CS-WORK-038 | Grace period management | 5/5 | **done** | ~~035~~ | 039 | `src/domains/commercial/subscription/grace-period.ts`, `src/lib/scheduler/handlers/grace-period-expiry.ts`, `src/lib/scheduler/handlers/checkout-precondition-retry.ts` |
| CS-WORK-039 | Webhook subscription handlers | 9/9 | **done** | ~~037, 038~~ | — | `src/domains/operations/paddle/webhook-handler.ts` (6 handlers), `src/app/api/paddle/webhook/route.ts` (wired deps) |
| CS-WORK-040 | Checkout router | 5/5 | **done** | ~~035, 036~~ | — | `src/server/routers/subscription.ts`, `src/lib/services/types.ts` (+refundTransaction), `src/lib/services/mocks.ts` (+refundTransaction), `src/db/test-fixtures.ts` (+makeUUID) |
| CS-WORK-041 | Archival path and consumers | 6/6 | **done** | ~~035~~ | — | `src/lib/events/types.ts` (matrix + PendingCancellationCreatedEvent timestamp), `src/server/routers/listing.ts` (archive S4 amendment), `src/domains/data-and-listings/consumers/tier-update.ts` (+restoreHiddenItems), `src/domains/operations/paddle/consumers.ts`, `src/domains/platform/consumers/subscription.ts`, `src/domains/commercial/consumers/subscription.ts` |
| CS-WORK-042 | Pricing page | 0/3 + 3 e2e | **done** | ~~036~~ | — | `src/app/pricing/page.tsx`, `src/components/pricing/billing-toggle.tsx`, `src/components/pricing/tier-card.tsx` |

**S4 total:** 47/50 AC verified (unit/integration). 3 AC (AC-34, AC-35, AC-36) deferred to E2E. **S4 code complete.**

### Dependency Graph

```
CS-WORK-035 (Schema+Types, 11 AC) ✅
  ├──▶ CS-WORK-037 (Downgrade, 6 AC) ✅
  ├──▶ CS-WORK-038 (Grace Period, 5 AC) ✅
  ├──▶ CS-WORK-039 (Webhook Handlers, 9 AC) ✅
  ├──▶ CS-WORK-040 (Checkout, 5 AC) ✅
  └──▶ CS-WORK-041 (Archival, 6 AC) ✅

CS-WORK-036 (Feature Gating, 5 AC) ✅
  ├──▶ CS-WORK-040 (Checkout, 5 AC) ✅
  └──▶ CS-WORK-042 (Pricing Page, 3 AC) ✅
```

---

## S5: Provider Experience — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-043 | Dashboard overview and listing context | 5/5 | **done** | — | 044, 045, 046, 047, 048, 049 | `src/server/routers/dashboard.ts`, `src/server/root.ts`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/listings/[listingId]/layout.tsx` |
| CS-WORK-044 | Analytics display and quality score panel | 10/10 | **done** | ~~043~~ | — | `src/domains/platform/dashboard/map-analytics.ts`, `src/server/routers/dashboard.ts` (+getListingDashboard, +getQualityExplanation), `src/app/dashboard/listings/[listingId]/page.tsx`, `src/app/dashboard/listings/[listingId]/analytics/page.tsx`, `src/app/quality-methodology/page.tsx` |
| CS-WORK-045 | Enquiry inbox and response tracking | 7/7 | **done** | ~~043~~ | — | `drizzle/0008_*.sql`, `src/db/schema/accounts.ts`, `src/server/routers/enquiry.ts`, `src/lib/scheduler/handlers/enquiry-response-reminder.ts`, `src/domains/platform/enquiry/email-templates.ts` |
| CS-WORK-046 | Notification centre and schema | 4/4 | **done** | ~~043~~ | — | `src/db/schema/shared.ts` (+notifications), `drizzle/0007_*.sql`, `src/lib/notifications/drizzle-notification-db.ts`, `src/server/routers/notification.ts`, `src/app/dashboard/notifications/page.tsx` |
| CS-WORK-047 | Subscription management panel | 4/4 | **done** | ~~043~~ | — | `src/server/routers/subscription.ts` (+getPortalUrl), `src/app/dashboard/listings/[listingId]/subscription/page.tsx` |
| CS-WORK-048 | Profile editor enhancements and 90-day reminder | 8/8 | **done** | ~~043~~ | — | `drizzle/0009_*.sql`, `src/db/schema/data-and-listings.ts` (+version), `src/server/routers/listing.ts` (version check, lifecycle guard), `src/domains/platform/reminders/listing-update-reminder.ts`, `src/domains/platform/reminders/email-templates.ts`, `src/domains/data-and-listings/consumers/quality.ts` (reminder scheduling), `src/db/adapters.ts` (cancelMatching) |
| CS-WORK-049 | Account settings and feature gating UI | 8/8 | **done** | ~~043~~ | — | `src/server/routers/settings.ts`, `src/domains/platform/dashboard/map-feature-access-to-ui.ts`, `src/app/dashboard/settings/page.tsx`, `src/server/root.ts` (+settings) |

**S5 total:** 46/46 AC verified (unit/integration). **7/7 work items done. S5 code complete.**

### Dependency Graph

```
CS-WORK-043 (Dashboard Shell, 5 AC) ✅
  ├──▶ CS-WORK-044 (Analytics, 10 AC) ✅
  ├──▶ CS-WORK-045 (Enquiry Inbox, 7 AC) ✅
  ├──▶ CS-WORK-046 (Notifications, 4 AC) ✅
  ├──▶ CS-WORK-047 (Subscription Panel, 4 AC) ✅
  ├──▶ CS-WORK-048 (Profile Editor, 8 AC) ✅
  └──▶ CS-WORK-049 (Settings, 8 AC) ✅
```

---

## S6: Buyer Experience — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-050 | Search router and ranking | 10/10 | **done** | — | 054, 055, 056 | `src/server/routers/search.ts`, `src/lib/search/ranking.ts` |
| CS-WORK-051 | Listing profile page and contact feedback | 12/12 | **done** | — | ~~055~~ | `src/app/providers/[slug]/page.tsx`, `src/app/providers/[slug]/data.ts`, `src/app/providers/[slug]/emit.ts`, `src/server/routers/listing.ts` (+reportContactAttempt) |
| CS-WORK-052 | Enquiry submission | 8/8 | **done** | — | 055 | `src/server/routers/enquiry.ts`, `src/domains/platform/buyer/enquiry-routing.ts` |
| CS-WORK-053 | Shortlist management | 5/5 | **done** | — | 055 | `src/server/routers/shortlist.ts`, `src/lib/events/types.ts` (ShortlistAddedEvent), `src/server/root.ts` (+shortlist) |
| CS-WORK-054 | Search history and cleanup | 5/5 | **done** | ~~050~~ | 055 | `src/server/routers/search-history.ts`, `src/lib/scheduler/handlers/search-history-cleanup.ts`, `src/server/root.ts` (+searchHistory) |
| CS-WORK-055 | Dashboard buyer tab | 4/4 | **done** | ~~050~~, ~~051~~, ~~052~~, ~~053~~, ~~054~~ | — | `src/app/dashboard/enquiries-sent/page.tsx`, `src/app/dashboard/shortlists/page.tsx`, `src/app/dashboard/searches/page.tsx` |
| CS-WORK-056 | Cross-role nudge and feature gating | 5/5 | **done** | ~~050~~ | — | `src/domains/platform/buyer/cross-role-nudge.ts`, `src/domains/platform/buyer/nudge-storage.ts`, `src/domains/platform/buyer/nudge-banner.tsx`, `src/domains/platform/buyer/profile-display.ts` |

**S6 progress:** 49/52 AC verified (unit/integration). **7/7 work items done. S6 code complete.**

### Dependency Graph

```
CS-WORK-050 (Search, 10 AC) ✅
  ├──▶ CS-WORK-054 (Search History, 5 AC) ✅
  ├──▶ CS-WORK-055 (Dashboard Buyer Tab, 4 AC) ✅
  └──▶ CS-WORK-056 (Nudge + Gating, 5 AC) ✅

CS-WORK-051 (Profile, 12 AC) ✅
  └──▶ CS-WORK-055 ✅

CS-WORK-052 (Enquiry, 8 AC) ✅
  └──▶ CS-WORK-055 ✅

CS-WORK-053 (Shortlist, 5 AC) ✅
  └──▶ CS-WORK-055 ✅
```

---

## S7: Operations — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-057 | Operations schema and admin dashboard | 9/9 | **done** | — | 058–065 | `src/db/schema/operations.ts` (5 new tables, 7 pgEnums), `src/db/schema/shared.ts` (amendments), `drizzle/0012_damp_hulk.sql`, `src/server/routers/admin/dashboard.ts`, `src/app/admin/` (layout, sidebar, overview), `src/lib/events/types.ts` (+paddle_reconciliation) |
| CS-WORK-058 | Support triage and ticket management | 15/15 | **done** | ~~057~~ | 062, 064, 065 | `src/domains/operations/support/`, `src/server/routers/admin/support.ts`, `src/lib/scheduler/handlers/sla-breach-warning.ts` |
| CS-WORK-059 | Billing reconciliation | 13/13 | **done** | ~~057~~ | 062 | `src/domains/operations/billing/`, `src/server/routers/admin/billing.ts`, `src/lib/scheduler/handlers/billing-hold-expiry.ts` |
| CS-WORK-060 | Compliance management | 10/10 | **done** | ~~057~~ | — | `src/domains/operations/compliance/`, `src/server/routers/admin/compliance.ts`, `src/lib/scheduler/handlers/compliance-schedule-check.ts`, `src/lib/scheduler/handlers/compliance-self-audit.ts`, `src/domains/operations/compliance/email-templates.ts` |
| CS-WORK-061 | Orchestrated flow and failed event admin | 16/16 | **done** | ~~057~~ | 062 | `src/server/routers/admin/flows.ts`, `src/server/routers/admin/events.ts` |
| CS-WORK-062 | Platform health monitoring | 10/10 | **done** | ~~057, 058, 059, 061~~ | — | `src/server/routers/admin/health.ts`, `src/server/routers/admin/dashboard.ts` (computeHealthSignals extended), `src/app/admin/health/page.tsx` |
| CS-WORK-063 | Event consumers and email delivery | 11/11 | **done** | ~~057~~ | — | `src/domains/operations/consumers/` (8 handler files + barrel), `src/domains/operations/email-templates.ts`, `src/lib/events/types.ts` (12 matrix entries), `src/lib/events/singleton.ts` |
| CS-WORK-064 | Feature gate friction tracking | 8/8 | **done** | ~~057, 058~~ | — | `src/domains/operations/friction/queries.ts`, `src/server/routers/admin/friction.ts`, `src/app/admin/health/page.tsx` (stub→real) |
| CS-WORK-065 | Refund processing | 9/9 | **done** | ~~057, 058~~ | — | `src/server/routers/admin/refunds.ts`, `src/server/routers/__tests__/admin-refunds.integration.test.ts`, `src/server/routers/admin/index.ts` (+refunds), `src/server/root.ts` (+payment to admin deps) |

---

## S8: Commercial & Revenue — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-066 | Commercial schema and pricing configuration | 4/4 | **done** | — | 067–073 | `src/db/schema/commercial.ts` (+3 tables), `drizzle/0013_blushing_mimic.sql`, `src/domains/commercial/pricing-config.ts`, `src/domains/commercial/__tests__/pricing-config.test.ts` |
| CS-WORK-067 | Conversion trigger engine and routes | 13/13 | **done** | ~~066~~ | 073 | `src/domains/commercial/conversion-triggers.ts`, `src/server/routers/commercial.ts`, `src/domains/commercial/__tests__/conversion-triggers.test.ts`, `src/server/routers/__tests__/commercial.integration.test.ts` |
| CS-WORK-068 | Churn detection and intervention | 8/8 | **done** | ~~066~~ | 069, 073 | `src/domains/commercial/churn-intervention.ts`, `src/domains/commercial/__tests__/churn-intervention.test.ts`, `src/domains/commercial/__tests__/churn-intervention.integration.test.ts` |
| CS-WORK-069 | Win-back evaluation and delivery | 7/7 | **done** | ~~066, 068~~ | 073 | `src/domains/commercial/winback-evaluation.ts`, `src/lib/scheduler/handlers/win-back-evaluation.ts`, `src/lib/events/types.ts`, `src/domains/commercial/__tests__/winback-evaluation.test.ts`, `src/domains/commercial/__tests__/winback-evaluation.integration.test.ts` |
| CS-WORK-070 | Sponsored placement selection | 10/10 | **done** | ~~066~~ | — | `src/domains/commercial/sponsored-placement.ts`, `src/server/routers/commercial.ts`, `src/domains/commercial/__tests__/sponsored-placement.test.ts`, `src/server/routers/__tests__/sponsored-placement.integration.test.ts` |
| CS-WORK-071 | Revenue perception and metrics | 8/8 | **done** | ~~066~~ | — | `src/domains/commercial/revenue-perception.ts`, `src/server/routers/commercial.ts`, `src/server/routers/__tests__/revenue-perception.integration.test.ts` |
| CS-WORK-072 | Feature gate friction, low-quality intervention, and refund evaluation | 13/13 | **done** | ~~066~~ | 073 | `src/domains/commercial/feature-gate-friction.ts`, `src/domains/commercial/refund-evaluation.ts`, `src/domains/commercial/low-quality-intervention.ts`, `src/lib/scheduler/handlers/check-quality-improvement.ts` |
| CS-WORK-073 | Event consumer implementations | 18/18 | **done** | ~~066, 067, 068, 069, 072~~ | 074 | `src/domains/commercial/consumers/*` (8 handlers + barrel), `src/lib/events/types.ts` (+6 matrix entries, +2 event fields), `src/lib/events/singleton.ts` |
| CS-WORK-074 | Demo preparation — S8 close-out | 12/12 | **done** | ~~073~~ | — | `src/db/seed/demo.ts`, `4-work-management/work/CS-WORK-074/DEMO-SCRIPT.md` |

### S8 Dependency Graph

```
CS-WORK-066 (Schema + Pricing, 4 AC) ✅
├──▶ CS-WORK-067 (Conversion Triggers, 13 AC) ✅ ──┐
├──▶ CS-WORK-068 (Churn Detection, 8 AC) ✅ ───────┤
│    └──▶ CS-WORK-069 (Win-Back, 7 AC) ✅ ─────────┤
├──▶ CS-WORK-070 (Sponsored Placement, 10 AC) ✅   │
├──▶ CS-WORK-071 (Revenue Perception, 8 AC) ✅   │
├──▶ CS-WORK-072 (Support Sections, 13 AC) ✅ ──┤
└────────────────────────────────────────▶ CS-WORK-073 (Event Consumers, 18 AC) ✅
                                            └──▶ CS-WORK-074 (Demo Prep, 12 AC) ✅
```

---

## S9: Entity Intelligence — Work Items

| ID | Title | AC | Status | Blocked By | Blocks | Artifacts |
|----|-------|----|--------|------------|--------|-----------|
| CS-WORK-075 | Intelligence schema, migration, and seed data | 0/0 | **done** | — | 076–082 | `src/db/schema/intelligence.ts`, `drizzle/0014_shocking_martin_li.sql`, `src/db/seed/custom-sql.ts` |
| CS-WORK-076 | Quality scoring engine | 21/21 | **done** | ~~075~~ | 078, 079, 081 | `scoring.ts`, `dedup.ts`, `quality-score-recalculation.ts`, `claim-abandonment-check.ts`, `admin/intelligence.ts` |
| CS-WORK-077 | Decay detection and enrichment scheduling | 15/15 | **done** | ~~075~~ | 079, 081 | `decay/detection.ts`, `decay/liveness-services.ts`, `decay-liveness-check.ts`, `enrichment-full-cycle.ts`, `consumers/account-closed.ts`, `admin/intelligence.ts` |
| CS-WORK-078 | Analytics pipeline and feature gating | 18/18 | **done** | ~~075, 076~~ | — | `analytics/types.ts`, `analytics/search-terms.ts`, `analytics/viewer-demographics.ts`, `analytics/competitor-benchmark.ts`, `analytics/enquiry-response.ts`, `analytics/taxonomy-suggestions.ts` |
| CS-WORK-079 | Ceremony automation | 15/15 | **done** | ~~075, 076, 077~~ | 080 | `ceremony/infrastructure.ts`, `ceremony/email-templates.ts`, `taxonomy-review-preparation.ts`, `data-health-review.ts`, `verification-calibration-review.ts`, `provider-outreach-ranking.ts`, `conversion-funnel-analysis.ts`, `multi-listing-pricing-evaluation.ts`, `principal-briefing-generation.ts`, `credit-confirmation-outreach.ts`, `operational-health-review.ts`, `contractor-performance-review.ts`, `admin/intelligence.ts` |
| CS-WORK-080 | Entity learning and commercial intelligence | 15/15 | **done** | ~~075, 079~~ | 082 | `intelligence/learning/hypothesis-analysis.ts`, `intelligence/learning/proactive-churn.ts`, `intelligence/commercial/revenue-health-extended.ts`, `intelligence/commercial/funnel-analysis.ts`, `intelligence/commercial/sponsored-learning.ts`, `intelligence/operations/health-review.ts`, `handlers/proactive-churn-detection.ts`, `handlers/revenue-health-extended.ts`, `handlers/learning-hypothesis-analysis.ts`, `admin/intelligence.ts` |
| CS-WORK-081 | Event consumers — D&L perception | 9/9 | **done** | ~~075, 076, 077~~ | 082 | `intelligence/consumers/*` (10 handlers + helpers + barrel), `events/types.ts` (Domain + 10 matrix entries) |
| CS-WORK-082 | Event consumers — CR/Ops and matrix wiring | 8/8 | **done** | ~~075, 080, 081~~ | — | `intelligence/consumers/*` (5 CR/Ops handlers + barrel + index), `events/types.ts` (+5 matrix entries), `events/singleton.ts` |

**S9 total:** 93/101 AC verified. 8 work items (7 done).

### S9 Dependency Graph

```
CS-WORK-075 (Schema + Seed, 0 AC) ✅
  ├──▶ CS-WORK-076 (Quality Scoring, 21 AC) ✅
  │      ├──▶ CS-WORK-078 (Analytics Pipeline, 18 AC) ✅
  │      └──▶ CS-WORK-079 (Ceremony Automation, 15 AC) ✅
  │             └──▶ CS-WORK-080 (Entity Learning, 15 AC) ✅
  │                    └──▶ CS-WORK-082 (CR/Ops Consumers + Wiring, 8 AC) ✅
  ├──▶ CS-WORK-077 (Decay Detection, 15 AC) ✅
  │      └──▶ CS-WORK-079 (also blocked by 077 ✅) ✅
  └──▶ CS-WORK-081 (D&L Consumers, 9 AC) ✅
         └──▶ CS-WORK-082 (also blocked by 081 ✅) ✅
```

---

## E2E Debt

ACs deferred to E2E verification, classified by verification category. See `1-investigation/e2e-verification-workflow.md` for full analysis, tooling recommendation, and phased build plan.

| AC | Description | Category | Tool | Phase | Code Prerequisites | Current Coverage | What's Missing |
|----|-------------|----------|------|-------|--------------------|-----------------|----------------|
| ~~AC-21~~ | ~~Signup + verification email sent~~ | ~~Auth flow (HTTP)~~ | ~~Playwright API~~ | ~~1~~ | ~~Auth route handler~~ | **CLOSED by CS-WORK-034 AC-04** | — |
| ~~AC-22~~ | ~~Login after verification~~ | ~~Auth flow (HTTP)~~ | ~~Playwright API~~ | ~~1~~ | ~~Auth route handler~~ | **CLOSED by CS-WORK-034 AC-04** | — |
| AC-25 | Session persists across navigation | Auth flow (browser) | Playwright browser | 2 | Auth route handler + UI pages (S5) | tRPC context injection tested | Browser session persistence across page navigations |
| ~~S2-AC-02~~ | ~~Email verification callback~~ | ~~Auth flow (HTTP)~~ | ~~Playwright API~~ | ~~1~~ | ~~Auth route handler~~ | **CLOSED by CS-WORK-034 AC-05** | — |
| AC-35 | Homepage renders via SSG | Build output | CI step | 1 | Homepage page component (S5/S6) | ISR revalidation utility tested | `next build` + SSG output file check (vacuous until homepage exists) |
| ~~AC-42~~ | ~~Production services init without error~~ | ~~Smoke test~~ | ~~Vitest + dotenv~~ | ~~1~~ | ~~None~~ | **CLOSED by CS-WORK-034 AC-06** | — |
| AC-52 | GitHub Actions runs full pipeline | CI meta | Manual | 1 | None — verified on first push | CI config written | First successful GitHub Actions run on push |
| S4-AC-34 | Pricing page renders all 4 tiers with correct annual prices | SSG UI | Playwright browser | 2 | Page component exists (CS-WORK-042) | SSG verified via `next build` | E2E asserting rendered prices match `PRICING` const |
| S4-AC-35 | Monthly toggle shows monthly prices | SSG UI (interaction) | Playwright browser | 2 | Page component exists (CS-WORK-042) | SSG verified via `next build` | E2E clicking toggle + asserting monthly prices |
| S4-AC-36 | Launch discount badge displayed on Standard annual card | SSG UI | Playwright browser | 2 | Page component exists (CS-WORK-042) | SSG verified via `next build` | E2E asserting badge text matches `LAUNCH_DISCOUNT.displayBadge` |

**Phase triggers:** Phase 1 = CS-WORK-034 (**complete**). Phase 2 = S5 first authenticated UI page. Phase 3 = staging environment exists.

**Code Prerequisites** column distinguishes "test not written" from "code not built." An AC cannot be verified until both its code prerequisites exist and the test is written.

**Note:** AC-53 (Vercel deploys main after CI passes) is manual verification — not testable in CI.

---

## Email Template Registration

31 IDs in `EmailTemplateId` (SI §5.2). Each must have a production `registerTemplate()` call before its send path is reachable.

| # | Template ID | Registered | Slice | Location |
|---|-------------|------------|-------|----------|
| 1 | `email_verification` | YES | S0 (034) | `src/lib/auth-instance.ts` |
| 2 | `password_reset` | YES | S0 (034) | `src/lib/auth-instance.ts` |
| 3 | `welcome` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 4 | `listing_live` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 5 | `claim_approved` | YES | S3 | `src/domains/data-and-listings/claim/email-templates.ts` |
| 6 | `claim_rejected` | YES | S3 | `src/domains/data-and-listings/claim/email-templates.ts` |
| 7 | `claim_pending_review` | YES | S3 | `src/domains/data-and-listings/claim/email-templates.ts` |
| 8 | `new_enquiry` | — | S6 | — |
| 9 | `enquiry_forwarded` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 10 | `enquiry_reminder` | YES | S5 (045) | `src/domains/platform/enquiry/email-templates.ts` |
| 11 | `profile_day1` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 12 | `profile_day3` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 13 | `profile_day7` | YES | S2 | `src/lib/onboarding/email-templates.ts` |
| 14 | `listing_update_reminder` | — | S5 | — |
| 15 | `enquiry_response` | YES | S5 (045) | `src/domains/platform/enquiry/email-templates.ts` |
| 16 | `claim_dispute_notification` | YES | S3 | `src/domains/data-and-listings/claim/email-templates.ts` |
| 17 | `article_14_notice` | YES | S1 Seed | `src/scripts/import/phase-5-article14.ts` |
| 18 | `dsar_acknowledgment` | YES | S7 (060) | `src/domains/operations/compliance/email-templates.ts` |
| 19 | `dsar_completion` | YES | S7 (060) | `src/domains/operations/compliance/email-templates.ts` |
| 20 | `listing_decay_warning` | YES | S7 (063) | `src/domains/operations/email-templates.ts` |
| 21 | `support_acknowledgment` | — | S7 | — |
| 22 | `subscription_confirmed` | — | S4 | — |
| 23 | `conversion_analytics_teaser` | — | S8 | — |
| 24 | `conversion_social_proof` | — | S8 | — |
| 25 | `conversion_view_milestone` | — | S8 | — |
| 26 | `conversion_engagement_summary` | — | S8 | — |
| 27 | `winback` | YES | S7 (063) | `src/domains/operations/email-templates.ts` |
| 28 | `decay_final_notice` | — | S9 | — |
| 29 | `enrichment_confirmation_request` | — | S9 | — |
| 30 | `credit_confirmation_outreach` | — | S9 | — |
| 31 | `principal_briefing` | — | S9 | — |

**Status:** 19/31 registered (S0 E2E harness + S1 Seed + S2 + S3 + S5 + S7). 12 pending (S4, S7 remainder, S8–S9). Updated 2026-02-25.

---

## S1–S10: Pending Decomposition

| Slice | Chapter | Arc | Work Items | Status |
|-------|---------|-----|------------|--------|
| S1: Data Model | CH-CS-002 | infrastructure | **6 work items** (CS-WORK-007 through CS-WORK-012, 42 AC) | decomposed |
| S1: Seed Pipeline | CH-CS-003 | infrastructure | **2 work items** (CS-WORK-021, CS-WORK-022, 9 AC) | decomposed |
| S2: Onboarding | CH-CS-004 | onboarding-and-claims | **10 work items** (CS-WORK-013 through CS-WORK-020, CS-WORK-023, CS-WORK-029, 41 AC) | decomposed |
| S3: Claim & Verify | CH-CS-005 | onboarding-and-claims | **4 work items** (CS-WORK-030 through CS-WORK-033, 48 AC) | decomposed |
| S4: Subscriptions | CH-CS-006 | onboarding-and-claims | **8 work items** (CS-WORK-035 through CS-WORK-042, 50 AC) | decomposed |
| S5: Provider Exp | CH-CS-007 | provider-experience | **7 work items** (CS-WORK-043 through CS-WORK-049, 46 AC) | decomposed |
| S6: Buyer Exp | CH-CS-008 | buyer-and-operations | **7 work items** (CS-WORK-050 through CS-WORK-056, 52 AC) | decomposed |
| Presentation | CH-CS-014 | presentation | **9 work items (35 AC) — see chapter def** | complete |
| S7: Operations | CH-CS-009 | buyer-and-operations | **9 work items** (CS-WORK-057 through CS-WORK-065, 101 AC) | complete |
| S8: Commercial | CH-CS-010 | commercial-and-intelligence | **9 work items** (CS-WORK-066 through CS-WORK-074, 93 AC) | complete |
| **S9: Entity Intel** | **CH-CS-011** | **commercial-and-intelligence** | **8 work items** (CS-WORK-075 through CS-WORK-082, 101 AC) | **complete** |
| S10: Hardening | CH-CS-012 | hardening | not decomposed | — |

---

## Project Scaffold

Created 2026-02-19 as part of CS-WORK-001.

| Component | Config |
|-----------|--------|
| Framework | Next.js 16, App Router, TypeScript strict |
| ORM | Drizzle ORM, PostgreSQL dialect |
| API | tRPC (initialised with auth middleware chain) |
| Auth | Better Auth (configured with email verification + role extension) |
| Email | Resend transport + template registry + preference enforcement |
| Storage | Cloudflare R2 abstraction (in-memory mock for tests) |
| CI/CD | GitHub Actions (lint + type-check + unit + integration) |
| Database | Supabase local (PostgreSQL 15, `127.0.0.1:54322`) |
| Migrations | Drizzle Kit generate + migrate (4 tables, 6 enums, 6 indexes) |
| Styling | Tailwind CSS v4 |
| Tests | Vitest + @vitest/coverage-v8 |
| Path alias | `@/*` → `src/*` |

---

## Completion Log

| Date | Work Item | AC | Notes |
|------|-----------|-----|-------|
| 2026-02-19 | CS-WORK-001 | 9 | Event bus + project scaffold. 9/9 tests, 0 type errors. |
| 2026-02-19 | CS-WORK-002 | 8 | Deferred action scheduler. 16 tests (8 AC + 8 supporting), 0 type errors. Unblocks CS-WORK-004. |
| 2026-02-19 | CS-WORK-003 | 1 | Decision logging framework. 2 tests, 0 type errors. |
| 2026-02-19 | CS-WORK-004 | 8 | Orchestrated flow engine. 10 tests (8 AC + 2 supporting), 0 type errors. |
| 2026-02-19 | CS-WORK-005 | 6 + 3 e2e | Email transport + auth. 14 tests (6 AC unit/integration + 5 supporting), 0 type errors. 3 AC (21, 22, 25) deferred to E2E. Better Auth config, tRPC middleware chain, Resend transport + preference enforcement, template registry. |
| 2026-02-19 | CS-WORK-006 | 13 + 3 e2e | Storage, notifications, services, tRPC error handling, ISR, CI/CD. 27 tests (13 AC unit/integration + 11 supporting), 0 type errors. 3 AC (35, 42, 52) deferred to E2E/manual. S0 code complete. |
| 2026-02-20 | — | — | Supabase local setup, Drizzle client wired, S0 migration applied, `.gitignore` created. |
| 2026-02-20 | — | — | Integration test harness: `vitest.config.integration.ts`, `src/db/test-utils.ts` (getTestDb/resetDb/closeTestDb), `test:integration` script, CI Postgres service container. 3 smoke tests. DB shutdown hook resolved. |
| 2026-02-20 | CS-WORK-007 | 10 | Data model schema + seed. Better Auth schema (user.id = text), D&L schema (25 tables, 15 enums), accounts schema, tsvector type factory, taxonomy seed (7/64/269), migration with pg_trgm + search vector trigger + GIN/GiST indexes. 10/10 AC verified against Postgres. |
| 2026-02-20 | CS-WORK-011 | 6 | Listing integrity rules + taxonomy overlap. 3 rules (duplicate detection, identity verification, CH uniqueness), sequential pipeline with short-circuit. `computeTaxonomyOverlap` (Jaccard at service-area level). First `src/domains/` module. 9 unit + 11 integration tests. 0 type errors. Unblocks CS-WORK-009. |
| 2026-02-20 | CS-WORK-009 | 9 | Listing + profile CRUD routes, taxonomy queries, engagement counter query, JSON-LD generation. 4 routers (listing, profile, taxonomy, engagement) — all factory pattern with injected `db`. Event payload types populated for 4 event types. `as` casts removed (use `as const` on `_brand`). Union narrowing on IntegrityResult. 6 unit + 19 integration tests (all via `createCaller()`). 0 type errors. Critical path complete. |
| 2026-02-20 | CS-WORK-010 | 4 | Image upload pipeline. Media router (uploadImage, deleteImage, reorderImages) with ownership checks, tier limit enforcement via TIER_LIMITS (CR §4.1), R2 upload/delete, logo/headshot listing field sync. 14 integration tests (all via `createCaller()`). 0 type errors. |
| 2026-02-21 | CS-WORK-012 | 8 | Event consumers + query interfaces. 9 D&L async consumers registered (engagement, zero-results, tier-update, account-closed, quality×2, contact, response-metrics). 7 payload types populated with P1 fields. `EVENT_CONSUMER_MATRIX` populated (9 entries). `createLogEventConsumerError(db)` wired to DB (was no-op stub). 9 integration tests. Collateral: bus.test.ts + crud.integration.test.ts updated for matrix validation cascade. 0 type errors. |
| 2026-02-21 | CS-WORK-008 | 5 | Full-text search infrastructure. `executeSearch()` with ts_rank_cd × (1 + quality_boost + paid_boost) ranking formula. Synonym expansion via `expandQuery()` against `search_synonyms` table. Trigram fallback (similarity > 0.3) when FTS returns no results. Taxonomy tag filtering via inner join. Empty query → all active sorted by composite quality. Search route added to listing router with `search_performed` event emission. 16 integration tests. 0 type errors. **S1 code complete.** |
| 2026-02-22 | CS-WORK-021 | 7 | 4rfv import pipeline. 5-phase CLI pipeline (phases 1-4, phase 5 in CS-WORK-022). Phase 1: postcode/email/URL/phone normalisation with structural OCR fix for UK postcodes. Phase 2: CH batch verification with 500ms rate limit, dissolved company detection. Batch integrity: sorted-neighbour dedup (window 10, pg_trgm similarity >0.9) + CH number clustering + union-find merge. Pipeline orchestrator commits with two-phase creation (listing + 1:1 companion rows). No `listing_created` events (AC-47), no `listing_live` emails (AC-26) — enforced by function signature (no bus/email dependency). Migration: `source` column on listings. 37 unit + 7 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-022 | 2 | Article 14 GDPR compliance. Phase 5: `article_14_notice` email to listings with contact email (AC-27), on-page `article14NoticeDisplayed` flag for listings without email (AC-28). `article_14_notice` template registered with S0 email transport. `article_14_progress_check` deferred action scheduled (daily, alert_principal if <80% sent by day 20). Compliance decision logged for Art 14(5)(b) exemptions. Migration: `article_14_notice_displayed` boolean on listings. `DeferredActionParamsMap` extended. 6 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-025 | 4 | Correspondence log schema + migration. `correspondence_log` table (17 cols, 6 indexes, 2 enums, self-ref FK), `suppressed_emails` table, `suppressedAt`/`suppressionReason` on `account_profiles`. `retry_bounced_email` added to `DeferredActionParamsMap` (34→35). Migration `0004_overrated_sunspot.sql`. `resetDb()` updated. 0 type errors. |
| 2026-02-22 | CS-WORK-026 | 4 | EmailService correspondence logging. `LoggingEmailService` decorator wraps any EmailService: system suppression check (account + email level, blocks ALL categories), correspondence log row on every send, SHA-256 merge fields hash, thread ID handling (provided or generated UUID). `EmailSendParams` +optional `threadId`, `listingId`. `EmailSendResult` +`threadId`. Existing tests unaffected (bare InMemoryEmailService unchanged). 12 unit + 5 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-027 | 5 | Outbound webhook + status lifecycle. First `src/app/api/` route: `POST /api/webhooks/email/events`. Resend HMAC signature verification (inject-don't-patch: `NoOpWebhookVerifier` for tests). Status transitions: sent→delivered→opened→clicked, sent→bounced, sent→failed. `email.complained` treated as hard bounce from any state. Same-state = no-op. Invalid transitions logged to `event_consumer_errors`. Unknown providerMessageId returns 200. 5 unit + 9 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-028 | 4 | Bounce handling, suppression, DSAR. Hard bounce: suppress account (`account_profiles.suppressedAt`) + email (`suppressed_emails`), log `email_suppressed` decision. Soft bounce: schedule `retry_bounced_email` (24h, once, log) with `originalParams`. 3+ bounces in 90d → admin notification. `getCorrespondenceForAccount()` (by accountId OR email). `anonymiseCorrespondence()` (erases fields, retains skeleton). Standalone — not wired to erasure flow. 5 integration tests. 0 type errors. **Communications Phase 1 code complete.** |
| 2026-02-22 | CS-WORK-013 | 4 + 1 e2e | Account creation + onboarding router. `ensureProfile` mutation (idempotent upsert, triggers anonymous enquiry linking), `completePersonalisation` mutation (departments array, skippable). `linkAnonymousEnquiries(db, accountId, email)` updates `enquiry_records.sender_account_id` for matching anonymous enquiries. `assertEmailVerified` standalone guard + `verifiedProcedure` tRPC middleware (composes with `protectedProcedure`). Migration `0005_sleepy_bushwacker.sql` (+departments text[] on account_profiles). AC-02 deferred to E2E. 14 integration tests. 0 type errors. **S2 first work item complete.** |
| 2026-02-22 | CS-WORK-014 | 5 | Freelancer listing creation. `createFreelancer` mutation on `listingCreationRouter` using `verifiedProcedure`. Integrity checks (checkDuplicate, no CH for freelancers). Two-phase transaction (listing + verification + qualityScores + qualityScoreExplanations + engagements + taxonomy tags). `listing_created` event emission. Progressive disclosure scheduling (Day 1/3/7 via `send_progressive_email` deferred actions). `listing_live` email. `welcome` + `listing_live` templates registered. Slug generation with collision check. 7 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-015 | 5 | Company listing creation + CH lookup. `createCompany` mutation with full integrity pipeline (duplicate + identity verification + CH uniqueness). Flagged path [S2-ST-13]: listing created with `suspended` + `pending_review` (no email, no progressive disclosure, not searchable). Non-flagged: standard creation + post-creation effects. `lookupCompaniesHouse` query returns company data for auto-population + `dissolved` flag for UI warning. Shared orchestration extracted (`executePostCreationEffects`, `createListingWithCompanions`). CS-WORK-020 (CH Lookup) absorbed. 9 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-017 | 3 | Profile strength meter. `computeProfileStrength()` maps D&L `qualityScore.completeness` (0–25) to 0–100% with 5 named levels. `identifyMissingFields()` reads quality score explanation factors (S9+). `identifyMissingFieldsFallback()` inspects listing field presence directly (pre-S9 path). `computeFallbackProfileStrength()` combines fallback + strength computation. `profileStrengthRouter.get` with ownership verification, tries real quality score path then falls back. Claim router refactored to import shared `computeFallbackProfileStrength` (removed inline duplicate). 30 unit tests. 0 type errors. |
| 2026-02-22 | CS-WORK-018 | 6 | Progressive disclosure handlers and emails. `send_progressive_email` handler: fetches listing, skips if inactive (AC-33) or target action complete (AC-32), sends with `profile_nudge` category (AC-35 enforced by EmailService). `onboarding_day14_prompt` handler: fetches listing, skips if inactive (AC-48), computes fallback profile strength, creates notification only if < 80% (AC-34). `isProgressiveActionComplete()` maps template→field checks (day1=headline+bio, day3=photo+website, day7=contactEmail). 3 progressive templates registered (`profile_day1/3/7`). `onboarding_day14_prompt` added to `DeferredActionParamsMap` (36→37). `onboarding_prompt` added to `NotificationType`. Both `scheduleProgressiveDisclosure` and `scheduleClaimProgressiveDisclosure` updated with Day 14 scheduling (AC-49). 9 integration tests. 0 type errors. |
| 2026-02-23 | CS-WORK-019 | 3 | Intelligent taxonomy suggestions. `SUGGESTION_MAP` with 5 curated rules across 3 sectors (Camera, Post-Production, Sound). `getSuggestions()` — pure function with dedup, exclusion, confidence sort, cap at 5. `getGenericSuggestions()` — DB query for top 5 service areas by listing count within sector (empty at launch). 14 unit + 4 integration tests. 0 type errors. |
| 2026-02-22 | CS-WORK-016 | 7 | Claim path and pre-claim snapshots. `claimRouter` with `getClaimContext` (pre-populated listing data, fallback field-presence profile strength [S2-ST-10], endowment messaging with ≥5 view threshold) and `submitClaim` (snapshot creation with `claimantAccountId` + `originalListing` + `pendingEdits` held — NOT applied [S2-ST-14], `claimStatus` → `pending_review`, 90-day `pre_claim_snapshot_cleanup` scheduled [S2-ST-1]). Progressive disclosure NOT scheduled at submission [S2-ST-17] — exported `scheduleClaimProgressiveDisclosure` for S3's `claim_approved` handler. `deliverPendingEnquiries` stub (S2-2 downstream flag). `pre_claim_snapshot_cleanup` handler (idempotent delete). `pre_claim_snapshot_cleanup` added to `DeferredActionParamsMap` (35→36). 17 integration tests. 0 type errors. |
| 2026-02-23 | CS-WORK-023 | 3 | Article 14 compliance handlers. `article_14_progress_check` handler: queries DB for total 4rfv listings with email vs sent correspondence log entries (excludes bounced/failed/suppressed), computes days elapsed + percentage, alerts principal if <80% by day 20 (AC-42), logs decision, self-perpetuates daily within 30-day compliance deadline (S0 §3.2). `computeArticle14Progress()` pure function (AC-44). `removeArticle14Notice()` sets `article14NoticeDisplayed = false` on claim approval (AC-43, idempotent). `shouldDisplayArticle14Notice()` renders for unclaimed/pending_review 4rfv listings [S2-ST-6]. 17 integration tests. 0 type errors. |
| 2026-02-23 | CS-WORK-030 | 14 | evaluateClaim decision engine. `evaluateClaim()` with CH dissolution guard (precedes email domain match [S3-ST-1]), `emailDomainMatches()` (case-insensitive, www-stripping), `acquireClaimLock()` (optimistic locking via conditional UPDATE). 5 decision paths: auto-approve (domain match), auto-reject (dissolved/suspended), queue_manual_review (CH active no match, freelancer, insufficient evidence), queue_dispute_resolution (competing claim), retry (concurrent modification). `submitClaim` tRPC route amended: evaluateClaim call + decision logging + snapshot claimantAccountId [S3-ST-5] + pre_claim_snapshot_cleanup cancellation [S3-ST-20]. `resolveManualReview` adminProcedure stub. 4 email templates registered (claim_approved, claim_rejected, claim_pending_review, claim_dispute_notification). `claim_dispute_notification` added to EmailTemplateId. `dispute_escalation_check` added to DeferredActionParamsMap (37→38). 28 integration tests. 0 type errors. **S3 first work item complete — unblocks CS-WORK-031 and CS-WORK-032.** |
| 2026-02-23 | CS-WORK-031 | 16 | Claim approval and rejection pipelines. `onClaimApproved()`: apply snapshot edits → update listing (accountId, claimStatus=claimed) → clear Article 14 notice → update verification (tier=claimed, claimedAt) → deliver pending enquiries (batched, expired filtered) → schedule claim progressive disclosure (Day 1/3/7/14) → delete snapshot → send claim_approved email + notification → log decision. `onClaimRejected()`: reset claimStatus (disputed→claimed [AC-25], pending_review→unclaimed [AC-21]) → delete snapshot → send claim_rejected email + notification → log decision. `deliverPendingEnquiries` full implementation (replaces S2 stub): single listing fetch (AC-48), batch 5, filter expired (AC-20), notification per enquiry, batched `enquiry_forwarded` email. `ClaimApprovedEvent`/`ClaimRejectedEvent` payloads defined with real fields. `EVENT_CONSUMER_MATRIX` +searchIndexUpdate sync consumer for claim_approved. `ClaimRouterDeps` expanded: +eventBus, +waitUntilFn, +emailService, +notificationDb (7 deps, kept flat). `enquiry_forwarded` template registered. 24 new integration tests (16 approval + 8 rejection). 0 type errors. |
| 2026-02-23 | CS-WORK-032 | 13 | Manual review and competing claims. `onManualReviewComplete()` (state guard → snapshot claimant read → onClaimApproved/onClaimRejected → event emit → decision log). `buildManualReviewTaskSpec()` (5 checklist items), `buildDisputeTaskSpec()` (high priority, both claimant IDs), `buildPortfolioReviewTaskSpec()`. `registerDisputeEscalationHandler()`: reads actual `lifecycleStatus`, no-ops if resolved, suspends + emits `listing_suspended` if unresolved. `ListingSuspendedEvent` fleshed out (+listingId, +reason, +previousStatus). `TaskSpec` type defined locally (Ops §4.1). `resolveManualReview` route wired: catches `BAD_REQUEST` error code → TRPCError. 14 + 12 = 26 integration tests. 0 type errors. |
| 2026-02-23 | CS-WORK-033 | 5 | Verification upgrade path. `evaluateVerificationUpgrade()`: tier guard (must be claimed) → score computation (CH active +1, trade body +1, client credits ×2 max +4, threshold 6) → pending_human_review with TaskSpec if ≥6. `applyVerificationUpgrade()`: update verifications table → emit `verification_tier_changed` → log decision. `checkTradeBodyMembership(db, listingId)` and `countClientConfirmedCredits(db, listingId)` query S1 tables. `verificationRouter.requestUpgrade` protectedProcedure with ownership guard. `VerificationTierChangedEvent` fleshed out (+listingId, +previousTier, +newTier). `TaskSpec` type extracted to `src/domains/operations/types.ts` (shared). 13 integration tests. 0 type errors. **S3 code complete.** |
| 2026-02-23 | CS-WORK-029 | 4 | E2E verification workflow investigation. 7 deferred ACs classified into 6 verification categories (auth flow HTTP, auth flow browser, build output, smoke test, CI meta, webhook pipeline). Playwright APIRequestContext recommended for Phase 1 (HTTP-only, no browser binaries). Phase 2: Playwright browser at S5. Phase 3: Hookdeck webhook tunnelling at staging. AC-42 reclassified as Vitest smoke test. AC-52 manual verification. 4 tools evaluated, 3 dismissed alternatives. Investigation brief: `1-investigation/e2e-verification-workflow.md`. AC-05 (principal sign-off) pending review. **S2 complete (9/9 work items).** |
| 2026-02-23 | CS-WORK-035 | 11 | Subscription schema, types, Paddle mapping. 5 schema additions (subscription cols on listings, paddleCustomerId on account_profiles, pending_cancellations, processed_paddle_events, grace_periods, media_visibility enum). `mapPaddleWebhook()` + `inferCancellationReason()`. Webhook handler: signature verification, idempotency, async dispatch. API route: `POST /api/paddle/webhook`. `SubscriptionEndedEvent` + `PendingCancellationCreatedEvent` fleshed out. Migration `0006_milky_bushwacker.sql`. 14 unit + 14 integration tests. 0 type errors. **S4 first work item — unblocks 037/038/039/040/041.** |
| 2026-02-23 | CS-WORK-036 | 5 | Feature gating and pricing config. `computeFeatureAccess(tier)` spreads `TIER_LIMITS` + 4 base boolean fields. `enforceFeatureGate(tier, feature)` throws `TRPCError` FORBIDDEN for gated features. `checkFeatureAccess(tier, feature)` returns boolean. `PRICING` const (4 tiers, annual/monthly). `LAUNCH_DISCOUNT` const (standard annual £99). `isPremiumVerificationEligible(tier)` resolves S3-1. 26 unit tests. 0 type errors. |
| 2026-02-23 | CS-WORK-039 | 9 | Webhook subscription handlers. 6 handler functions inside `processPaddleWebhook`: `handleCheckoutCompleted` (precondition guard → listing update + paddleCustomerId + `subscription_tier_changed` emission + decision log), `handleSubscriptionUpgraded` (tier update + restore hidden + event), `handleSubscriptionDowngraded` (tier update + `applyDowngrade` + event), `handleBillingCadenceChanged` (listing update + decision log, no domain event), `handleSubscriptionCancelled` (reason→origin mapping, grace period for voluntary/payment_failure, immediate `finaliseSubscriptionEnd` for archival/closure/reconciliation), `handleRenewalFailed` (notification on first attempt). `WebhookHandlerDeps` expanded: +eventBus, +waitUntilFn, +schedulerDb, +decisionLogDb, +notificationDb. API route wired with full deps. Existing CS-WORK-035 tests updated for new deps shape + UUID accountIds for decision_logs compatibility. 9 new integration tests. 0 type errors. |
| 2026-02-23 | CS-WORK-041 | 6 | Archival path and event consumers. S4 §7 archive route amendment: `listing.archive` emits `pending_cancellation_created` for paid listings (AC-31), does NOT emit `subscription_ended` directly (AC-32), free listings emit no subscription events (AC-33). D&L `subscription_tier_changed` consumer extended with `restoreHiddenItems` on upgrade (AC-41). Ops `pending_cancellation_created` consumer: `storePendingCancellation` + `PaymentService.cancelSubscription`. PP `subscription_ended` consumers: feature access (placeholder) + re-subscribe CTA with closure skip (AC-42). CR `subscription_ended` consumer: churn decision log + `win_back_evaluation` scheduling for paddle-origin only (AC-43). `EVENT_CONSUMER_MATRIX` populated: +3 `subscription_tier_changed` (PP×2, CR), +3 `subscription_ended` (PP×2, CR), +1 `pending_cancellation_created` (Ops). `PendingCancellationCreatedEvent` +`timestamp` field. 4 integration test files, 13 tests. 0 type errors. |
| 2026-02-23 | CS-WORK-037 | 6 | Downgrade and re-upgrade data handling. `applyDowngrade()`: hides excess media/credits beyond new tier limit (visibility="hidden", never deletes), sends notification with hidden item counts. `suppressNotification` param for `finaliseSubscriptionEnd` [S4-ST-8]. `restoreHiddenItems()`: restores oldest hidden items first up to new tier limit; unlimited = restore all. Media upload route amended: counts only `visibility="visible"` items against tier limit [AC-24]. Shared `hideExcess()` helper for both media_items and credits tables. 10 integration tests. 0 type errors. **Unblocks CS-WORK-039 (037 dependency satisfied).** |
| 2026-02-24 | CS-WORK-034 | 7 | E2E verification harness Phase 1. `@playwright/test` + `dotenv` devDeps. `playwright.config.ts` (API-only, `webServer` build+start, `Origin` header for CSRF). `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler(getAuthInstance())`. `src/lib/auth-instance.ts`: singleton auth + InMemoryEmailService capture + `email_verification`/`password_reset` template registration. `src/app/api/test/reset/route.ts` (POST, `E2E_TEST_MODE` guard, `TRUNCATE_ALL_TABLES_SQL`). `src/app/api/test/emails/route.ts` (GET/DELETE, captured email access). `e2e/auth-flow.spec.ts`: 2 tests — signup→email→verify→login→session (AC-04) + emailVerified=true (AC-05). `src/lib/services/__tests__/production-services.test.ts`: Vitest smoke test (AC-06). `createProductionServices()` refactored from throw to fallback-to-mocks. `.github/workflows/ci.yml` +test-e2e job. `src/lib/auth.ts` +`sendOnSignUp: true`. `vitest.config.ts` excludes `e2e/**`. `.env.local` +BETTER_AUTH_SECRET, +BETTER_AUTH_URL, +E2E_TEST_MODE. Closes S0 AC-21, AC-22, S2-AC-02, AC-42. E2E debt reduced from 10→6. 247 unit + 371 integration + 2 E2E = 620 tests. 0 type errors. |
| 2026-02-24 | CS-WORK-043 | 5 | Dashboard overview and listing context. `createDashboardRouter({ db, notificationDb })` with `getOverview` (4-way LEFT JOIN: listings + verifications + engagements + qualityScores, profile strength via `computeFallbackProfileStrength`, unread notification count) and `getListingContext` (ownership check, `computeFeatureAccess` for tier-gated child routes). `src/server/root.ts` created: `createAppRouter(services)` wires all 12 domain routers, exports `AppRouter` type for tRPC client. Auth guard layout at `src/app/dashboard/layout.tsx` via `getAuthInstance().api.getSession()`. Spec `session.userId` corrected to `session.accountId` across 8 slice spec files (68 occurrences). `makeUUID()` fixed: version=4, variant=8 for Zod `.uuid()` compatibility. 3 unit + 11 integration tests. 0 type errors. **S5 first work item — unblocks CS-WORK-044 through CS-WORK-049.** |
| 2026-02-23 | CS-WORK-020 | 4 | Image processing pipeline. `processListingImage()`: downloads original from R2, generates 3 WebP variants via `sharp` (thumbnail 150px, card 400px, full 1200px) with `withoutEnlargement`, uploads to R2 with deterministic naming (`{imageId}_{variant}.webp`). Returns `ImageVariants` or `null` on failure (AC-50). `variantKey()` + `parseOriginalKey()` pure functions. `ImageProcessor` type injected into `MediaRouterDeps` — upload route updates `media_items.url` to card variant on success, preserves original on failure. `ObjectStorageService` +`download()` method. 14 unit + 11 integration tests. 0 type errors. **S2 code complete (10/10 work items, 40/41 AC + 1 E2E).** |
| 2026-02-24 | CS-WORK-045 | 7 | Enquiry inbox and response tracking. `createEnquiryRouter(deps)` with `getInbox` (cursor-based pagination, 4-way status filter) and `respondToEnquiry` (status guard, response email with GDPR null guard [S5-ST-20], `enquiry_responded` event emission with `responseTimeMinutes`, pending reminder cancellation). `enquiry_response_reminder` deferred action handler: marks stale after 7 days, sends reminder email to listing owner, no-op if already responded. Schema: `enquiry_status` pgEnum + `status` column + listing_status index. `enquiry_response` + `enquiry_reminder` templates registered. Migration `0008_mixed_may_parker.sql`. Wired as 15th router in root. 14 + 4 = 18 integration tests. 0 type errors. |
| 2026-02-24 | CS-WORK-053 | 5 | Shortlist management. `createShortlistRouter(deps)` with 7 routes: `list` (aggregate item counts + lastAddedAt), `getItems` (single JOIN to listings+verifications, cursor pagination, `WHERE status != 'removed'` filter [S6-ST-1]), `create` (max 10 per account), `rename`, `delete` (FK cascade), `addItem` (max 50, unique constraint duplicate detection, `shortlist_added` event emission), `removeItem` (soft delete to `status = 'removed'`). `ShortlistAddedEvent` payload populated (listingId, accountId, timestamp). Wired as 17th router in root. 20 integration tests. 0 type errors. |
| 2026-02-25 | CS-WORK-051 | 12 | Listing profile page and contact feedback. `src/app/providers/[slug]/page.tsx` (SSG+ISR, 15-min revalidate), `data.ts` (direct DB queries), `emit.ts` (stub). Pure functions: `infer-source.ts`, `resolve-profile-cta.ts`, `generate-json-ld.ts`. `reportContactAttempt` added to listing router. `ProfileViewedEvent` + `ContactAttemptEvent` payloads updated. Targeted claim CTA (AC-14). 10 unit + 29 integration tests. 0 type errors. |
| 2026-02-25 | CS-WORK-055 | 4 | Buyer dashboard pages. 3 CSR pages under `/dashboard/`: `enquiries-sent` (status indicators: grey=unread, green=responded, amber=stale), `shortlists` (summary cards with item count + last added), `searches` (recent 5 history + saved searches with re-run). All inherit S5 layout auth guard. `Promise.all` parallel loading. Buyer sections visible to all authenticated accounts regardless of provider status. 6 integration tests. 0 type errors. **S6 code complete (7/7 work items, 49/52 AC).** |
| 2026-02-25 | CS-WORK-057 | 9 | Operations schema and admin dashboard. 5 new tables (`support_tickets`, `task_specs`, `churn_risk_registry`, `billing_holds`, `compliance_register`, `billing_reconciliation_status`) + 7 pgEnums in `src/db/schema/operations.ts`. Schema amendments: `orchestrated_flows` +`updatedAt`, `event_consumer_errors` +`resolved`/+`resolvedAt` with partial index. `SubscriptionEndedEvent.reason` +`"paddle_reconciliation"`. Admin shell: `adminProcedure` role guard, `src/app/admin/` layout+sidebar (8 nav items)+overview page. `admin.dashboard.getOverview` (7 parallel COUNT queries). `computeHealthSignals(db)` exported. 3 new notification types wired. Migration `0012_damp_hulk.sql`. 20th router (admin) wired in root. `test-utils.ts` +6 tables. 13 integration tests. 0 type errors. **S7 first work item — unblocks CS-WORK-058 through CS-WORK-065.** |
| 2026-02-25 | CS-WORK-059 | 13 | Billing reconciliation. `handleBillingReconciliation(deps)`: 8-step algorithm — fetch Paddle active subs via `listAllActiveSubscriptions()`, compare with local, anomaly detection (≥10% halts), hold creation (48h expiry), expired hold → `subscription_ended` emission (reason: `paddle_reconciliation`), reverse mismatch notifications, status upsert, self-perpetuation (24h). `getBillingReconciliationStatus(db)` + `countActiveHolds(db)` query functions. `registerBillingHoldExpiryHandler()` — deletes hold, logs decision, does NOT emit events. `createAdminBillingRouter(deps)` with 4 routes: `getStatus`, `triggerReconciliation`, `listHolds` (createdAt cursor, listing name JOIN, computed remainingHours), `releaseHold` (delete + cancel deferred action + decision log). `PaymentService` interface extended: `listAllActiveSubscriptions()`. Admin router wired: `admin.billing.*` namespace. 18 + 13 = 31 integration tests. 0 type errors. **CS-WORK-062 partially unblocked (needs 061 only).** |
| 2026-02-25 | CS-WORK-060 | 10 | Compliance management. `checkComplianceHold(db, accountId)` (Ops §3.2): queries `compliance_register` for open dsar/complaint/investigation entries, returns `{ holdExists, holdType, reason }`. Priority: dsar > investigation > complaint. Does NOT check billing_holds (D7). `getDSARStatus(db)` (Ops §3.3): 3 parallel queries — open DSARs with daysRemaining, recent erasures (90d), upcoming deadlines (30d). Maps status to lifecycle stage (OPS-ST-9). `createAdminComplianceRouter(deps)` with 4 routes: `list` (paginated, filter by type/status, JOIN account email), `getDetail` (hasComplianceHold derived), `create` (DSAR defaults deadline to receivedAt+30d, sends dsar_acknowledgment email, decision log), `updateStatus` (DSAR completion sends dsar_completion email, decision log). `registerComplianceScheduleCheckHandler`: scans entries within 7 days, creates compliance_deadline notifications, marks overdue, self-perpetuates 24h. `registerComplianceSelfAuditHandler`: 3 checks (data retention, GDPR register completeness, urgent DSARs), escalates on failure, self-perpetuates 24h. `dsar_acknowledgment` + `dsar_completion` templates registered. Admin router wired: `admin.compliance.*` namespace. 16 + 18 + 5 + 5 = 44 integration tests. 0 type errors. |
| 2026-02-25 | CS-WORK-062 | 10 | Platform health monitoring. Extended `computeHealthSignals()` with 5th signal (Paddle webhook silence, AC-8.7). Fixed billing default from `healthy` to `warning` when no row exists (AC-8.3). `createAdminHealthRouter(deps)` with single `getStatus` route returning 5 signals + overall severity. Health page at `/admin/health` with signal panels + friction tracking stub (AC-8.9). No persistent history (AC-8.10). Admin router wired: `admin.health.*` namespace. 20 unit + 27 integration = 47 new tests. 0 type errors. |
| 2026-02-25 | CS-WORK-061 | 16 | Orchestrated flow and failed event admin. `FlowRow.updatedAt` added to flow types + adapter. Engine sets `updatedAt` on every step state change (AC-6.9). `createAdminFlowsRouter(deps)` with 5 routes: `list` (filter by flowType/status, sort by deadline/started_at/updated_at, cursor pagination, daysRemaining computed), `getDetail` (step-level view with skippable from constraint matrix), `retryStep` (increments attempt, sets in_progress, decision log), `skipStep` (constraint matrix enforcement — FORBIDDEN for 5 non-skippable steps, requires non-empty reason, records skippedBy=accountId, advances flow), `escalate` (sets escalated, creates compliance_deadline notification, decision log). `createAdminEventsRouter(deps)` with 3 routes: `list` (grouped by consumerId, filterable by date/consumer/resolved, totalUnresolved count), `resolve` (marks resolved, hidden from default view), `retry` (re-emits stored payload through event bus, marks resolved). Skip constraint matrix: 12 steps across erasure/closure, 5 non-skippable (verify_identity, process_erasure, close_dsar_case, archive_listings, deactivate_account). Admin router wired: `admin.flows.*` + `admin.events.*` namespaces. Root router passes flowDb + bus + waitUntilFn to admin deps. 22 + 14 = 36 integration tests. 0 type errors. **CS-WORK-062 fully unblocked.** |
| 2026-03-06 | CS-WORK-066 | 4 | Commercial schema and pricing configuration. 3 new tables (`commercial_state`, `churn_analysis_log`, `sponsored_impressions`) with 5 indexes in `src/db/schema/commercial.ts`. `PRICING` const typed as `Record<SubscriptionTier, { annual: number; monthly: number }>` in `src/domains/commercial/pricing-config.ts`. Migration `0013_blushing_mimic.sql`. `test-utils.ts` +3 tables in both truncation lists. Comment documenting dual PRICING module split (S4 display vs S8 computation). 3 unit tests. 0 type errors. **S8 first work item — unblocks CS-WORK-067 through CS-WORK-073.** |
| 2026-03-06 | CS-WORK-067 | 13 | Conversion trigger engine and routes. 6 trigger evaluators (`evaluateViewMilestone`, `evaluateFirstEnquiry`, `evaluateCompetitorUpgraded`, `evaluateAnalyticsTeaser`, `evaluateSocialProof`, `evaluateEngagementSummary`) with cooldowns, max firings, anonymity threshold. `evaluateUpgradeSuggestion` route (priority-ordered, ownership check, free-tier gate). `getConversionTriggerState` route (default zero-state). `evaluateEndowmentCta` (engagement + category fallback, endowmentCtaShown only set by primary variant). `resetConversionTriggerState` (preserves churn fields). `ConversionMilestoneEvent` + `ConversionMilestoneId` types populated. 4 email templates registered (`conversion_view_milestone`, `conversion_analytics_teaser`, `conversion_social_proof`, `conversion_engagement_summary`). Commercial router wired as 20th domain router in root. 20 unit + 33 integration tests. 0 type errors. **Enables CS-WORK-073 (consumers).** |
| 2026-03-06 | CS-WORK-068 | 8 | Churn detection and intervention. `evaluateChurnIntervention` pure decision function (5 paths: grace_period for payment_failure, accept for paddle_reconciliation/account_closed/listing_archived, show_retention_data for voluntary with engagement, accept for low engagement). `logChurnEvent` writes to `churn_analysis_log` with computed `annualRevenue`. `updateChurnState` upserts `commercial_state.lastChurnEventAt/lastChurnReason`. `emitChurnRiskDetected` + `emitPendingCancellation` event emission helpers. `V1_CHURN_RISK_FACTORS` const. `ChurnRiskDetectedEvent` narrowed with `ChurnRiskFactor[]` + `timestamp`. `PendingCancellationCreatedEvent.reason` narrowed to `CancellationReasonLiteral`. 12 unit + 13 integration tests. 0 type errors. |
| 2026-03-06 | CS-WORK-069 | 7 | Win-back evaluation and delivery. `evaluateWinBack` pure decision function (listing_not_active, listing_ownership_changed, send_email with enquiry/view thresholds, insufficient_engagement). `cancelWinBackSchedules(schedulerDb, listingIds, cancelledBy)` wraps `cancelDeferredAction` per listing. `checkWinBackAttribution(db, listingId, accountId)` queries `win_back_sent` within 90-day window, writes `win_back_converted` on match. `registerWinBackEvaluationHandler` reads listing + engagement, calls evaluateWinBack, emits `winback_eligible` or no-ops. `WinbackEligibleEvent` populated with typed `mergeFields` + `timestamp`. 10 unit + 11 integration tests. 0 type errors. **Enables CS-WORK-073 (consumers — 069 dependency satisfied).** |
| 2026-03-06 | CS-WORK-070 | 10 | Sponsored placement selection. `selectSponsoredListings` pipeline: candidate pool (Premium/Partner + active + claimed + taxonomy overlap) → quality floor (composite ≥ 50) → slot count (0/1/2/3) → fairness cap (3x mean 30-day impressions) → deterministic daily rotation → impression recording. `computeSlotCount`, `dailyRotationOffset`, `applyFairnessCap`, `recordImpressions`, `cleanupOldImpressions` (90-day, 5% probabilistic). `getSponsoredListings` route added to commercial router (`protectedProcedure`). `sponsored_placement_selection` decision type logged per invocation. 8 unit + 8 integration tests. 0 type errors. |
| 2026-03-06 | CS-WORK-071 | 8 | Revenue perception and metrics. `computeRevenuePerception(db)` — 8-metric aggregate from `listings` + `churn_analysis_log` (MRR, ARR, tierDistribution, churnRate30d/90d, conversionRate30d, NRR, avgRevenuePerListing). `evaluateRevenueHealth(perception)` — pure threshold evaluation (3 signals: churn/conversion/NRR, each independent). `commercial.getRevenuePerception` adminProcedure route. 12 unit + 11 integration tests. 0 type errors. |
| 2026-03-06 | CS-WORK-072 | 13 | Feature gate friction, low-quality intervention, refund evaluation. 3 decision architectures: `evaluateFeatureGateFriction` (pure, 3-level severity per gate, worst-of overallLevel), `triggerLowQualityIntervention` (notification + 30-day `check_quality_improvement` scheduling), `evaluateRefund` (pure, 3-guard pipeline: engagement >10, repeat <12mo, age >90d → full ≤30d / partial 31-90d pro-rata / deny). `registerCheckQualityImprovementHandler` emits `churn_risk_detected` if score still <40, no-ops on improvement/deletion/free-tier. 20 unit + 6 integration tests. 0 type errors. **Enables CS-WORK-073 (consumers — 072 dependency satisfied).** |
| 2026-03-06 | CS-WORK-073 | 18 | Event consumer implementations. 8 CR async consumers: `subscription_tier_changed` (commercial_state upsert, churn_analysis_log conversion/upgrade/downgrade, conversion_milestone emission on free→paid, effectivePriceAtSubscription only on conversion), `subscription_ended` (origin branch: paddle → churn_risk_detected + win-back 60d schedule; archival/closure → churn log only), `claim_approved` (CR-29 trigger reset preserving churn history, win-back cancellation + win_back_converted attribution), `listing_archived` (paid+known-account guard), `quality_score_changed` (3-condition gate: <40, paid, >14d → triggerLowQualityIntervention), `account_closed` (per-listing win-back cancel + paid churn log, free skip), `enquiry_submitted` (first_enquiry trigger via engagement counter query-in-handler, free-tier only), `erasure_completed` (win-back cancel, churn log anonymisation by listingId, trigger state clear). Type cascade: `SubscriptionTierChangedEvent` +accountId, `ListingArchivedEvent` +subscriptionTier. 6 EVENT_CONSUMER_MATRIX entries added. Consumer barrel + singleton rewired. 0 unit + 33 integration tests. 0 type errors. **Unblocks CS-WORK-074 (demo prep).** |
| 2026-03-06 | CS-WORK-074 | 12 | Demo preparation — S8 close-out. Extended `src/db/seed/demo.ts` with admin user (`admin@callsheet.test`, role: admin), 3 support tickets (open/assigned/resolved), 1 compliance DSAR (30d deadline), 1 billing hold, 1 in-progress erasure flow (6 steps), 3 event consumer errors (1 resolved, 2 unresolved), 4 enquiry records (2 received, 2 sent), 1 shortlist with 3 items, 3 search history entries, 1 churn risk registry entry, 2 commercial states + 3 churn analysis log entries. Idempotent re-run verified. `DEMO-SCRIPT.md` with 3 walkthrough journeys (buyer, provider, admin). 0 new tests (seed script). 0 type errors. **S8 code complete (9/9 work items, 93/93 AC).** |
| 2026-03-06 | CS-WORK-075 | 0 | Intelligence schema, migration, and seed data. 6 new tables (`enrichment_schedules`, `decay_signals`, `perception_aggregates`, `ceremony_runs`, `learning_hypotheses`, `principal_briefings`), 4 pgEnums, 2 column amendments to `quality_scores` (`calculatedBy`, `algorithmVersion`). L1–L7 seed via `db:custom-sql`. Migration `0014_shocking_martin_li.sql`. `test-utils.ts` +6 tables in truncation lists. 0 new tests (0-AC foundation). 0 type errors. **S9 first work item — unblocks CS-WORK-076 through CS-WORK-082.** |
| 2026-03-07 | CS-WORK-076 | 21 | Quality scoring engine. 5-dimension pure scoring (`scoreCompleteness` 0-25, `scoreFreshness` 0-25, `scoreAccuracy` 0-20, `scoreRichness` 0-15, `scoreVerification` 0-15), band assignment, `buildExplanation`, `computeTopImprovements`. `QualityScoreExplanation` type enriched (array-of-dimensions with typed factors). `deduplicateProfileView` (1h time-window). `quality_score_recalculation` handler (load→compute→persist→band crossing evaluation→event/notification/decision). `claim_abandonment_check` handler (>90d pending_review→unclaimed, self-perpetuating 24h). `scheduleNightlyQualityRecalculation` batch. Profile strength AC-14 (`calculatedBy` check replaces dimension presence check). Admin intelligence router (`qualityDistribution`). 32 unit + 18 integration tests. 0 type errors. |
| 2026-03-07 | CS-WORK-077 | 15 | Decay detection and enrichment scheduling. `detectDecay{Website,Email,Ch,Social,Postcode}` with injectable `LivenessServices`. `evaluateDecayResponse` decision architecture (duplicate suppression, ticket suppression, severity-based response). `computeSeverityEscalation` (website+email→critical). `getCadenceMap` (paid=6, claimed=6, unclaimed=3 check types). `decay_liveness_check` + `enrichment_full_cycle` self-perpetuating handlers. `account_closed` consumer replaced no-op with enrichment suspension (cancel deferred actions + delete schedules). Admin routes: `decaySignals` (paginated, severity filter) + `enrichmentStatus` (tier aggregates). Sub-agent delegation experiment: 3 parallel worktree agents for independent workstreams. 18 unit + 16 integration tests. 0 type errors. |
| 2026-03-07 | CS-WORK-079 | 15 | Ceremony automation. Shared infrastructure (`checkCeremonyIdempotency`, `logCeremonyRun`, `evaluateCeremonyOutcome`, `scheduleCeremonyNextRun`). 9 ceremony handlers (taxonomy review, data health, verification calibration, provider outreach, conversion funnel, multi-listing pricing, principal briefing, operational health, contractor performance). Credit confirmation outreach utility. 4 email templates (principal_briefing, credit_confirmation_outreach, decay_final_notice, enrichment_confirmation_request). Admin ceremonies route. 2-agent parallel delegation. 12 unit + 15 integration tests. 0 type errors. |
| 2026-03-07 | CS-WORK-078 | 18 | Analytics pipeline and feature gating. 4 aggregate types: `aggregateSearchTerm` (per-listing weekly term frequency), `handleSearchPerformedForZeroResult` (zero-result→`zero_result_queries`), `identifyTaxonomyGaps` (freq≥3 unmatched terms), `aggregateViewerDemographic` (entity type/sector/region bucketing with pct recomputation), `computeCompetitorBenchmark` (≥2 service-area overlap, batch engagement+quality fetch, 7-day cache TTL, `insufficientData` when <3 competitors), `computeEnquiryResponseInsights` (responseRate, medianResponseTimeHours, conversionEstimate), `computeTaxonomySuggestions` (co-occurrence, empty when <10 listings). `SearchPerformedEvent` +`resultListingIds`. Feature gates pre-satisfied in `TIER_LIMITS` (AC-46/47/48/49). 3-agent parallel delegation (search terms, demographics+response, competitor). 53 unit + 12 integration tests. 0 type errors. |
| 2026-03-07 | CS-WORK-080 | 15 | Entity learning and commercial intelligence. 7 handlers: `learning_hypothesis_analysis` (L1-L7 measurement, confound detection, inputsHash ceremony logging), `proactive_churn_detection` (engagement_dropping 30% decline + billing_cadence_switch_to_monthly, emits churn_risk_detected), `revenue_health_extended` (8 S9 extension fields on commercial_state), `sponsored_placement_learning` (quality floor + fairness cap from decision logs), `conversion_funnel_analysis` (per-gate friction ratio, 5:1 threshold escalation), `operational_health_review` (L1-L7 + ticket trends + task rates), `contractor_performance_review` (quarterly, insufficientData guard). 2 admin intelligence routes. 3-agent parallel delegation. 64 unit + 9 integration tests. 0 type errors. |
| 2026-03-07 | CS-WORK-081 | 9 | Event consumers — D&L perception. 10 intelligence consumer handlers: `profile_viewed` (dedup via `deduplicateProfileView` + viewer demographics), `account_closed` (no-op — D&L consumer handles), `contact_attempt` (unreachable → `evaluateDecayResponse`), `decay_signal_detected` (`hasActiveTicket` annotation on `checkDetails`), `listing_created` (schedule `quality_score_recalculation` + enrichment schedules at unclaimed cadence), `profile_edited` (freshness reset + quality recalc), `claim_approved` (quality recalc + enrichment upgrade to claimed + L2/L3 hypothesis tracking), `search_performed` (per-listing `aggregateSearchTerm`), `shortlist_added` (quality calibration signal), `enquiry_submitted` (calibration + outreach prioritisation). 4 shared helpers in `helpers.ts`. `registerIntelligenceConsumers` barrel. `"intelligence"` added to `Domain` union + 10 `EVENT_CONSUMER_MATRIX` entries. 12 unit + 9 integration tests. 0 type errors. |
| 2026-03-08 | CS-WORK-082 | 8 | Event consumers — CR/Ops and matrix wiring. 5 intelligence consumer handlers: `subscription_tier_changed` (revenue signal + paid enrichment upgrade on tier upgrade), `subscription_ended` (churn analysis for all 3 origins, paddle win-back attribution), `conversion_milestone` (per-gate attribution via decision log correlation, organic fallback), `winback_delivery_result` (delivered/failed tracking), `enquiry_responded` (delegates to `computeEnquiryResponseInsights`). +5 `EVENT_CONSUMER_MATRIX` entries (15 total intelligence). `registerIntelligenceConsumers` wired into `getEventBus()` singleton. 20 unit + 5 integration tests. 2 existing tests updated for matrix cascade. 0 type errors. **S9 code complete (8/8 work items, 101/101 AC). CH-CS-011 complete.** |

---

## Technical Debt

Items discovered that need resolution but aren't blocking current work.

### Next

| Item | Source | Definition of Done |
|------|--------|--------------------|
| ~~`DATABASE_URL` in integration test config~~ | [Retro: tech-debt-next #1](../retros/tech-debt-next-retro-2026-02-22.md) | **DONE.** `vitest.config.integration.ts` `env.DATABASE_URL` set. `npm run test:integration` works without manual prefix. |
| ~~Webhook `updatedAt` timestamp flake (AC-09)~~ | [Retro: CS-WORK-013 #7](../retros/cs-work-013-retro-2026-02-22.md) | **DONE.** Replaced 10ms sleep with backdated `updatedAt` (−60s). Deterministic — no timing race. |
| ~~`createSchedulerDb` duplicated in 4 test files~~ | [Retro: tech-debt-watching](../retros/tech-debt-watching-retro-2026-02-22.md) | **DONE.** Extracted to `src/db/test-fixtures.ts`. All 4 test files import from there. |
| ~~`emptyConsumerMatrix` duplicated in 2 test files~~ | [Retro: tech-debt-watching](../retros/tech-debt-watching-retro-2026-02-22.md) | **DONE.** Extracted to `src/db/test-fixtures.ts`. Both onboarding test files import from there. |
| ~~`resolveSectorId` extra DB query per freelancer creation~~ | [Retro: tech-debt-watching](../retros/tech-debt-watching-retro-2026-02-22.md) | **DONE.** `primarySectorSlug` → `primarySectorId` in `createFreelancerInput`. Client sends sectorId directly. Helper deleted. |
| ~~Missing imports in bounce + phase-5-article14 tests~~ | [Retro: tech-debt-watching](../retros/tech-debt-watching-retro-2026-02-22.md) | **DONE.** Added `decisionLogs`/`deferredActions` imports orphaned during fixture extraction. |
| ~~Extract `InMemoryNotificationDb` to `test-fixtures.ts`~~ | [Retro: CS-WORK-018 #1](../retros/cs-work-018-retro-2026-02-22.md), [Retro: tech-debt-watching #3](../retros/tech-debt-watching-retro-2026-02-22.md) | **DONE.** All 3 test files import from `test-fixtures.ts`. No inline class in any test file. |
| ~~Wire `onBounce` callback in production webhook route~~ | [Retro: CH-CS-013 #1](../retros/ch-cs-013-comms-p1-retro-2026-02-22.md) | **DONE.** Route passes `handleBounce` wrapper to `handleResendEvent()`. `createNotificationDb(db)` wired — bounce threshold notifications persist. DB adapters extracted to `src/db/adapters.ts`. |
| ~~Register `retry_bounced_email` action handler~~ | [Retro: CH-CS-013 #2](../retros/ch-cs-013-comms-p1-retro-2026-02-22.md) | **DONE.** `registerBounceRetryHandler()` in `src/lib/scheduler/handlers/bounce-retry.ts`. Verifies row still bounced, re-sends via emailService. 3 integration tests. |
| ~~Add `seedTestUser` helper to `test-fixtures.ts`~~ | [Retro: CS-WORK-030 #1](../retros/cs-work-030-retro-2026-02-23.md) | **DONE.** `seedTestUser(db, id, email?)` creates user + account_profiles in one call. Bounce test migrated. |
| ~~Plan E2E test harness~~ | [Retro: CS-WORK-013 #3](../retros/cs-work-013-retro-2026-02-22.md) | **Superseded by CS-WORK-029** (E2E verification workflow investigation). Scoped as collaborative investigation with principal, not just tooling selection. |

### Later

| Item | Source | Definition of Done |
|------|--------|--------------------|
| ~~Wire `error-handler.ts` into tRPC `onError`~~ | [Retro: audit-2026-02-24 #3](../retros/audit-2026-02-24-retro-2026-02-24.md) | **DONE.** `errorFormatter` wired into `initTRPC.create()` — Zod `fieldErrors` in every error response. `onTRPCError` exported for API route handler `onError` callback. |
| `validateUpload` `ReadableStream` size gap | [Retro: tech-debt-next #3](../retros/tech-debt-next-retro-2026-02-22.md) | Production R2 transport enforces size independently, or stream byte counting added. |
| ~~`db.execute()` raw SQL typing friction~~ | [Retro: CS-WORK-021 #1](../retros/cs-work-021-retro-2026-02-22.md) | **DONE.** `rawQuery<T>(db, sql)` in `src/db/raw-query.ts`. 4 callsites migrated: `integrity.ts`, `taxonomy.ts`, `suggestions.ts`, `pipeline.integration.test.ts`. |
| DB connection pooling | S1 implementation | Verify Drizzle `node-postgres` Pool vs connection string. Refactor if recommended. Trigger: S4+ concurrent mutations. |
| AC coverage verification script | S1 implementation | `scripts/verify-ac-coverage.ts` — runs against a slice ID, reports gaps and duplicates. |
| `assertOwnership` duplication | S1 implementation | Rule of three: extract when a 3rd router needs it. Currently 1 file (`media.ts`). |
| Showreel URL route | S1 schema | S5 work item includes showreel URL route. |
| No-op consumer implementations | S1 implementation | Real logic arrives per-slice (S7, S9). Each gets a side-effect integration test. |
| `enquirySubmittedHandler` — 2 sequential queries | S1 implementation | Refactor to single CTE when engagement volume justifies. Benchmark at S6. |
| Per-consumer execution telemetry | S0 implementation | Consumer handlers wrapped with timing. Trigger: >30% migration assessment (S9+). |
| `selectDistinctOn` + JS re-sort | S1 implementation | Subquery/CTE for combined DISTINCT + ORDER BY. Trigger: 50K listings. |
| Synonym batch query | S1 implementation | `WHERE term = ANY($1)`. Trigger: 100+ synonyms. |
| Count query consolidation | S1 implementation | `count(*) OVER() AS total_count` window function. |
| Location-based search | S1 spec | `ST_DWithin` or haversine. Blocked on geocoding. Arrives at S6. |
| `providerMessageId` index on `correspondence_log` | [Retro: CH-CS-013 #3](../retros/ch-cs-013-comms-p1-retro-2026-02-22.md) | Add index on `correspondence_log.providerMessageId`. Trigger: webhook lookup latency > 50ms at scale. |
| Profile strength router join consolidation | [Retro: CS-WORK-017 #2](../retros/cs-work-017-retro-2026-02-22.md) | Merge listing + quality score queries into single join. Low impact — single extra query per call. |
| ~~`invokeHandler<T>` test helper~~ | [Retro: CS-WORK-018 #3](../retros/cs-work-018-retro-2026-02-22.md) | **DONE.** Extracted to `src/lib/scheduler/handlers/__tests__/invoke-handler.ts`. Typed generic over `DeferredActionParamsMap`. All 3 handler test files refactored. |
| `createTestListing` accountId typing | [Retro: CS-WORK-016 #2](../retros/cs-work-016-retro-2026-02-22.md) | Make `accountId` optional/nullable without needing `null as unknown as string`. |
| `QualityScoreExplanation` type reconciliation | [Retro: CS-WORK-017 #3](../retros/cs-work-017-retro-2026-02-22.md) | Spec pseudocode uses richer object; DB schema uses `string[]`. Reconcile at S9 implementation. |
| `isProgressiveActionComplete` template→field mapping validation | [Retro: CS-WORK-018 #2](../retros/cs-work-018-retro-2026-02-22.md) | Mapping inferred, not spec-confirmed. Validate against S2 design intent. |
| `insertSentCorrespondence` extraction | [Retro: CS-WORK-023 #2](../retros/cs-work-023-retro-2026-02-23.md) | Extract to `test-fixtures.ts`. Trigger: 2nd test file needs it. |
| UUID format enforcement for test accountIds | [Retro: CS-WORK-030 #2](../retros/cs-work-030-retro-2026-02-23.md) | `makeSession` warns on non-UUID, or convention enforced. 3 FK failures across retros. |
| ~~`ClaimRouterDeps` growth assessment~~ | [Retro: CS-WORK-030 #3](../retros/cs-work-030-retro-2026-02-23.md) | **RESOLVED: keep flat.** 7 fields, 1 consumer. Rule of three not met — no second router shares this shape. Extract only if a 2nd module needs the same deps. |
| WORK.md deliverable path convention | [Retro: CS-WORK-017 #1](../retros/cs-work-017-retro-2026-02-22.md) | Decomposer skill outputs `src/domains/platform/` but actual code lands in `src/lib/onboarding/`. Align convention. |
| Phase 3 import pipeline real export | [Retro: CS-WORK-021 #2](../retros/cs-work-021-retro-2026-02-22.md) | Replace `console.log` stub with real export mechanism for flagged records. Blocked on S7 (Operations). |
| ~~Replace `NoOpNotificationDb` with DB implementation~~ | Tech debt session 2026-02-23 | **DONE.** Both webhook routes (`paddle/webhook`, `webhooks/email/events`) now use `createNotificationDb(db)`. Bounce threshold notifications persist to DB. |
| Typed `SubscriptionTier` helper for Drizzle join results | [Retro: CS-WORK-043 #4](../retros/cs-work-043-retro-2026-02-24.md) | `asSubscriptionTier(value)` narrowing function or Drizzle select helper. Eliminates `as` casts in routers reading `subscriptionTier` from joins. Trigger: 3+ routers need the cast. |
| ~~`supabase db reset` + `drizzle-kit push` automation~~ | [Retro: CS-WORK-045](../retros/cs-work-045-retro-2026-02-24.md) | **DONE.** `npm run db:reset` chains `supabase db reset --no-seed && drizzle-kit push && npm run db:seed`. |
