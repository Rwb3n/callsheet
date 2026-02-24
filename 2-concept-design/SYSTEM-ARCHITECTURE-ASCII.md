# CALLSHEET — System Architecture (ASCII Concept Design)

**Status:** SYNCED WITH IMPLEMENTATION  
**Domain:** Cross-Domain architectural synthesis  
**Format:** Exquisite, sublime, excruciatingly detailed ASCII block diagrams.  
**Last synced:** 2026-02-22 (vs IMPLEMENTATION-TRACKER.md)

---

## 1. MACRO TOPOLOGY & CROSS-DOMAIN DEPENDENCIES

The entity operates across four distinct domains. The boundaries are strict. Coordination happens via the Event Bus (25 typed events) and 6 explicit query interfaces. Infrastructure services (DAS, Flow Engine, Decision Logger, Email, Storage) are shared across all domains.

```text
=====================================================================================================================
                                    C A L L S H E E T   M A C R O   T O P O L O G Y
=====================================================================================================================

                                           +=============================+
                                           |      P A D D L E   API      |
                                           | (Billing, Invoicing, Taxes) |
                                           +=============================+
                                                  ^               | 
                            [checkout JS]         |               | [webhooks]
                                  |               | (cancel via   |  subscription.*
                                  v               |  API)         v
+-------------------------------------------------+     +-----------------------------------------------------------+
| PLATFORM & PRODUCT                              |     | OPERATIONS                                                |
| (Perception, Search, Application UI)            |     | (Human Procurement, Compliance, Support)                  |
|                                                 |     |                                                           |
|  +-------------------+   +-------------------+  |     |  +-------------------+   +-----------------------------+  |
|  | Search Engine     |   | Onboarding & UI   |  |     |  | Webhook Handler   |   | Human Procurement Engine    |  |
|  | - tsvector + trgm |   | - Account Create  |  |     |  | - Signature Verify|   | - TaskSpec Template Library |  |
|  | - Organic Rank    |   | - Listing Editor  |  |     |  | - Idempotency     |   | - Quality Gate (Test Tasks) |  |
|  | - Synonym Expand  |   | - Dashboard       |  |     |  | - Reconcile       |   | - Escalate to Principal     |  |
|  +-------------------+   +-------------------+  |     |  +-------------------+   +-----------------------------+  |
|          |                         |            |     |           |                             |                 |
|          v                         v            |     |           v                             v                 |
|   [Query interfaces: Analytics / DSAR status]   |     |   [Query interfaces: Feature friction / Tickets]          |
|                                                 |     |                                                           |
|  +-------------------------------------------+  |     |  +-------------------------------------------+            |
|  | Platform Event Emitters:                  |  |     |  | Operations Event Emitters:                |            |
|  | search_performed, profile_viewed,         |  |     |  | subscription_tier_changed,                |            |
|  | enquiry_submitted, account_closed         |  |     |  | subscription_ended, winback_delivery      |            |
|  +-------------------------------------------+  |     |  +-------------------------------------------+            |
+-------------------------------------------------+     +-----------------------------------------------------------+
                         |                                                            |
                         v                                                            v
=====================================================================================================================
                      E V E N T   B U S   ( 2 5   T Y P E D   C R O S S - D O M A I N   E V E N T S )
=====================================================================================================================
                         |                                                            |
                         v                                                            v
+-------------------------------------------------+     +-----------------------------------------------------------+
| DATA & LISTINGS                                 |     | COMMERCIAL & REVENUE                                      |
| (Entity Models, Quality Scoring, Integrity)     |     | (Pricing, Optimisation, Feature Gating)                   |
|                                                 |     |                                                           |
|  +-------------------+   +-------------------+  |     |  +-------------------+   +-----------------------------+  |
|  | Listing Integrity |   | Quality / Decay   |  |     |  | Feature Gating    |   | Conversion & Churn          |  |
|  | - Claim Eval Lock |   | - Base Scoring    |  |     |  | - TIER_LIMITS     |   | - Churn Intervention        |  |
|  | - Duplicate Check |   | - Decay Detection |  |     |  | - Access Matrix   |   | - Win-back rules            |  |
|  | - CH uniqueness   |   | - Liveness Checks |  |     |  | - computeAccess() |   | - Revenue Perception        |  |
|  +-------------------+   +-------------------+  |     |  +-------------------+   +-----------------------------+  |
|          |                         |            |     |           |                             |                 |
|          v                         v            |     |           v                             v                 |
|   [Canonical Data: Listing, Account, Taxonomy]  |     |   [Config Imports: Platform imports TierLimits]           |
|                                                 |     |                                                           |
|  +-------------------------------------------+  |     |  +-------------------------------------------+            |
|  | D&L Event Emitters:                       |  |     |  | Commercial Event Emitters:                |            |
|  | claim_approved, quality_score_changed,    |  |     |  | conversion_milestone, churn_risk_detected,|            |
|  | decay_signal_detected, listing_archived   |  |     |  | pending_cancellation_created              |            |
|  +-------------------------------------------+  |     |  +-------------------------------------------+            |
+-------------------------------------------------+     +-----------------------------------------------------------+
                         |                                                            |
                         v                                                            v
=====================================================================================================================
              S H A R E D   I N F R A S T R U C T U R E   ( S 0 )
  Event Bus | DAS (35 actions) | Flow Engine | Decision Logger | Email | Storage
=====================================================================================================================
```

---

## 2. DATA & LISTINGS: ENTITY RELATIONSHIP MODEL

The core structural decision: `Account` (user) and `Listing` (directory record) are independent entities that converge on claim. 

```text
=====================================================================================================================
                                 A C C O U N T   v s   L I S T I N G   E N T I T Y
=====================================================================================================================

                                 ( 0 .. 1 )
   +---------------------------------------------------------------------------------------------------------+
   |  LISTING (Directory Record)                                                                             |
   |                                                                                                         |
   |  id: UUID                                                                                               |
   |  accountId: UUID <-------(Links when Claimed)--------+                                                  |
   |  entityType: "freelancer" | "company" | ...          |             +----------------------------------+ |
   |  claimStatus: "unclaimed" | "claimed" | "disputed"   |             | ACCOUNT (Registered User)        | |
   |  source: "organic" | "import" | "outreach"           |             |                                  | |
   |                                                      |             | id: UUID (text, Better Auth)     | |
   |  +-----------------------+  +---------------------+  |             | email: string (verified)         | |
   |  | IDENTITY              |  | COMMERCIAL          |  |             | fullName: string                 | |
   |  | - name                |  | - budgetTier        |  +-----------> | departments: text[]              | |
   |  | - companiesHouseNum   |  | - subscriptionTier  |  |  ( 0 .. N ) |                                  | |
   |  | - formerlyKnownAs     |  | - paddleSubId       |  |             | +------------------------------+ | |
   |  +-----------------------+  +---------------------+  |             | | BUYER FACET (Always Active)  | | |
   |                                                      |             | | - searchHistory              | | |
   |  +-----------------------+  +---------------------+  |             | | - shortlists                 | | |
   |  | PROFILE               |  | VERIFICATION        |  |             | | - enquiriesSent              | | |
   |  | - headline, bio       |  | - tier: Verification|  |             | +------------------------------+ | |
   |  | - logo/headshot       |  | - lastCheckDate     |  |             |                                  | |
   |  | - websiteUrl          |  | - method            |  |             | +------------------------------+ | |
   |  | - media (max by tier) |  | - verificationScore |  |             | | AUTHENTICATION               | | |
   |  +-----------------------+  +---------------------+  |             | | - pwdHash / SSO              | | |
   |                                                      |             | | - mfaEnabled                 | | |
   |  +-----------------------+  +---------------------+  |             | +------------------------------+ | |
   |  | CAPABILITIES          |  | ENGAGEMENT / QUAL.  |  |             |                                  | |
   |  | - taxonomyTags [...]  |  | - profileViews      |  |             | +------------------------------+ | |
   |  | - worksIn (genres)    |  | - searchAppearances |  |             | | SUPPRESSION (Comms Phase 1)  | | |
   |  | - transactionTypes    |  | - qualityScore      |  |             | | - suppressedAt               | | |
   |  +-----------------------+  +---------------------+  |             | | - suppressionReason          | | |
   |                                                      |             | +------------------------------+ | |
   |  +-----------------------+                           |             +----------------------------------+ |
   |  | GDPR / ART. 14        |                           |                                                  |
   |  | - article14NoticeSent |  (An Account can manage many Listings, e.g.                                  |
   |  | - article14Displayed  |   a freelance DP listing AND a kit hire                                      |
   |  +-----------------------+   company listing. Hence 0..N mapping.)                                      |
   +---------------------------------------------------------------------------------------------------------+
```

---

## 3. OPERATIONS: TASK SPECIFICATION & PROCUREMENT ENGINE

CALLSHEET is operated by the Entity (Algorithm), replacing the notion of a human ops manager. When the entity encounters a boundary (e.g. subjective visual review), it procures a human via a scoped `TaskSpec`.

```text
=====================================================================================================================
                              E N T I T Y   P R O C U R E M E N T   D E C I S I O N   T R E E
=====================================================================================================================

  [Event requires subjective judgment]
  (e.g., Claim Dispute, Showreel Review)
               |
               v
      +-------------------+
      | GENERATE TaskSpec | ---> { task, context, criteria, timeout, dataAccessScope, learningCapture }
      +-------------------+
               |
               | (Must we expose PII?)
               v
      +-------------------+
      | D P A   C H E C K | ---> [No DPA? Route to DPA-cleared resource ONLY, or block]
      +-------------------+
               |
               v
      +-------------------+
      | COST & VOL CHECK  | ---> [Volume > Threshold?] ---> YES ---> Procure Contracted Worker
      +-------------------+                                            (Principal Approval)
               |                                                                |
              NO (One-off/low vol)                                              |
               |                                                                v
               v                                                       [Assign to Contract Worker]
      +-------------------+
      | HIGH STAKES DOM?  | ---> YES (Compliance, Verify) ---> [Marketplace QUALITY GATE (Test task)]
      +-------------------+                                            |
               |                                                      PASS
              NO                                                       |
               |                                                       v
               +---------------------------------------------> [Assign to Marketplace Worker]
                                                                       |
  +--------------------------------------------------------------------+
  |
  v
[EXECUTION] -----> [TIMEOUT?] ---> YES ---> [Less than Max Retries?] ---> Route to next worker
  |                                                  |
  |                                                  NO ---> [ESCALATE TO PRINCIPAL]
  |
  v
[COMPLETED] -----> Entity evaluates output -> Captures learning from outcome -> Resolves originating event.

```

---

## 4. COMMERCIAL: SUBSCRIPTION LIFECYCLE & PADDLE WEBHOOK ROUTING

Paddle is the source of truth for billing. Operations receives webhooks, ensures idempotency and signature verification, then maps them into domain events that Commercial consumes.

```text
=====================================================================================================================
                    P A D D L E   W E B H O O K   R O U T I N G   &   I N T E R V E N T I O N
=====================================================================================================================

  [ P A D D L E ]
    |
    | webhook: subscription.updated / canceled / created
    v
+---------------------------------------------------------------------------------------+
| OPERATIONS DOMAIN (Sole Webhook Receiver)                                             |
|                                                                                       |
|  1. Fast 200 OK                                                                       |
|  2. Signature Verification (HMAC)                                                     |
|  3. Idempotency Check (Paddle event_id)                                               |
|  4. Execute mapPaddleWebhook() --> Emits Internal Event                               |
|                                                                                       |
|      +---------------------------+              +------------------------------+      |
|      | subscription_tier_changed |              | subscription_ended           |      |
|      +---------------------------+              +------------------------------+      |
+-------------|-------------------------------------------|-----------------------------+
              |                                           |
              v                                           v
+------------------------------------+  +-----------------------------------------------+
| ALL DOMAINS (Consumers)            |  | COMMERCIAL DOMAIN                             |
|                                    |  |                                               |
| (D&L): Adjust enrichment cadence   |  |   [evaluateChurnIntervention]                 |
| (PP):  Refresh UI feature gates    |  |    - Was it voluntary?                        |
| (CR):  Update revenue metrics      |  |    - Yes: Show retention data                 |
|                                    |  |           ("You got 12 enquiries...")         |
|                                    |  |    - No (Payment fail): Enter Grace Period    |
|                                    |  |                                               |
|                                    |  |   [evaluateWinBack]                           |
|                                    |  |    - Wait 60 Days                             |
|                                    |  |    - Check recent profile views / enquiries   |
|                                    |  |    - Emit winback_eligible --> Ops sends Mails|
+------------------------------------+  +-----------------------------------------------+
```

---

## 5. PLATFORM: SEARCH & RANKING EQUATION

The primary product feature. Search uses PostgreSQL full-text search with synonym expansion, trigram fallback, and a **multiplicative** ranking formula where quality amplifies relevance.

```text
=====================================================================================================================
               R A N K I N G   C A L C U L A T I O N   E N G I N E   ( I M P L E M E N T E D )
=====================================================================================================================

  [ SearchQuery ]
   - filters (sectors, serviceAreas, specialisations, entityType, verificationTier, subscriptionTier)
   - free text (optional — empty query returns all active by quality)
         |
         v
  [ Synonym Expansion ]
   expandQuery(db, query) → looks up search_synonyms table
   Falls back to plainto_tsquery if no synonyms found
         |
         v
  [ PostgreSQL Database ]
   (Active Lifecycle Listings ONLY — eq(lifecycleStatus, "active"))
         |
         v
+-------------------------------------------------------------------------+
|  RANK = ts_rank_cd(search_vector, tsquery)                              |
|         × (1.0 + quality_boost + paid_boost)                            |
+-------------------------------------------------------------------------+

               [ quality_boost ]
                      COALESCE(quality_scores.composite, 0) / 100.0 * 0.5
                      Max contribution: 0.5  (when quality = 100)
               ×
               [ paid_boost ] from TIER_LIMITS[tier].rankingBoost / 100
                      Free:     0.00
                      Standard: 0.15
                      Premium:  0.25
                      Partner:  0.25
               =
               Multiplier range: 1.0 (worst) → 1.75 (best: quality 100 + premium)

  [ TRIGRAM FALLBACK ] (AC-13)
   When FTS returns 0 results → similarity(name, query) > 0.3
   Ranked by similarity score instead of ts_rank_cd

  [ EMPTY QUERY ] (AC-15)
   No text → all active listings sorted by COALESCE(composite, 0) DESC

  [ TAXONOMY FILTERING ] (AC-14)
   sectorId / serviceAreaId / specialisationId → INNER JOIN listing_taxonomy_tags

[Example — Multiplicative]
  Listing A: ts_rank_cd=0.30, quality=85, free    → 0.30 × (1 + 0.425 + 0)    = 0.428
  Listing B: ts_rank_cd=0.30, quality=30, premium → 0.30 × (1 + 0.15  + 0.25) = 0.420

  Conclusion: A high-quality free listing beats a low-quality premium listing.

```

---

## 6. GDPR ERASURE ORCHESTRATION PROTOCOL

The most complex cross-domain transaction. Implemented as an Orchestrated Flow (type: "erasure") with step-level retry, skip, and auto-escalation after 3 consecutive failures.

```text
=====================================================================================================================
                              G D P R   E R A S U R E    C H O R E O G R A P H Y
=====================================================================================================================

  [ Data Subject (Provider) ]
         |
         | Art. 17 Erasure Request
         v
  +------------------+
  |    OPERATIONS    |  1. Identify user, Verify timelines (30d SLA)
  |                  |  2. Extract data summary for anonymised compliance audit log
  |                  |  3. Close active support tickets
  +--------+---------+
           |
           | ORCHESTRATED FLOW (type: "erasure") [Flow Engine]
           | Steps: pending → in_progress → completed | failed | skipped
           | Auto-escalation: 3 consecutive failures → ESCALATE TO PRINCIPAL
           v
  +------------------+
  | DATA & LISTINGS  |  4. Resolve active claim disputes
  |                  |  5. Company listings -> Wipe PII, unlink account, revert to "unclaimed"
  |                  |  6. Freelancer listings -> Hard delete (no non-PII directory remnant)
  |                  |  7. Wipe Account auth, facet data
  +--------+---------+
           |
           | ASYNCHRONOUS: Emit `erasure_completed` event
           v
   ======================= ( EVENT BUS ) ==========================
       |                                          |
       v                                          v
  +------------------+                   +------------------+
  | PLATFORM & PROD  |                   | COMMERCIAL & REV |
  |                  |                   |                  |
  | 8. Purge indexes |                   | 11. Anonymise    |
  | 9. Clear cache   |                   |     churn logs   |
  | 10. Scrub from   |                   | 12. Cancel win-  |
  |     Shortlists   |                   |     back crons   |
  +------------------+                   +------------------+

  [ DSAR Correspondence ] (Communications Phase 1)
  anonymiseCorrespondence(accountId) → erases email fields, retains skeleton
  getCorrespondenceForAccount(accountId | email) → query for data export

```

---

## 7. DOMAIN EVENT CONSUMER MATRIX

A complete architectural map of the 25 typed cross-domain events. 9 D&L consumers are wired (S1). Remaining consumers arrive per-slice (S3–S10).

```text
=====================================================================================================================
         E V E N T   T O P O L O G Y   &   C O N S U M E R S   ( 9   W I R E D ,   1 6   P E N D I N G )
=====================================================================================================================

[ Emitter Domain ]            [ Event ]                             [ Consumers ]                            [Status]
 
 DATA & LISTINGS   -------> claim_approved                -------> (Ops): Learning L2/L3, Volume track        pending
                                                                   (PP):  Dashboard access, ISR invalidation  pending
                                                                   (CR):  Funnel conversion, cancel win-back   pending

                   -------> claim_rejected                -------> (Ops): Volume track                         pending
                                                                   (PP):  Dashboard rejection UI               pending

                   -------> listing_archived              -------> (Ops): Close active tickets                 pending
                                                                   (PP):  Remove from search, ISR, shortlists  pending
                                                                   (CR):  Churn analysis (if paid)              pending

                   -------> listing_suspended             -------> (Ops): Update tickets                       pending
                                                                   (PP):  Search warning indicator              pending
                   
                   -------> listing_reactivated           -------> (Ops): Resume outreach, enrichment          pending
                                                                   (PP):  Restore to search                    pending

                   -------> verification_tier_changed     -------> (PP):  Badge update, Search index update    pending

                   -------> decay_signal_detected         -------> (Ops): Suppress duplicate ops tickets       pending
                                                                   (PP):  "Outdated" indicator (if high/crit)  pending

                   -------> quality_score_changed         -------> (PP):  Ranking recalculation                pending
                                                                   (CR):  Conversion triggers, Low-quality      pending

                   -------> erasure_completed             -------> (Ops): Close DSAR case                      pending
                                                                   (PP):  Purge search, scrub shortlists       pending
                                                                   (CR):  Anonymise churn/conversion logs      pending

 OPERATIONS        -------> subscription_tier_changed     -------> (D&L): tierUpdate consumer                  ✅ WIRED
                                                                   (PP):  Update feature gates                 pending
                                                                   (CR):  Update revenue metrics               pending

                   -------> subscription_ended            -------> (PP):  Downgrade feature gates              pending
                                                                   (CR):  Churn eval, Schedule win-back        pending

                   -------> winback_delivery_result       -------> (CR):  Update churn log delivery status     pending

 PLATFORM          -------> search_performed              -------> (D&L): zeroResultTracking consumer          ✅ WIRED
 
                   -------> profile_viewed                -------> (D&L): engagementIncrement consumer          ✅ WIRED
 
                   -------> enquiry_submitted             -------> (D&L): engagementIncrement consumer          ✅ WIRED
                                                                   (CR):  first_enquiry conversion trigger     pending

                   -------> enquiry_responded             -------> (D&L): responseMetrics consumer              ✅ WIRED

                   -------> shortlist_added               -------> (CR):  Conversion signal                    pending

                   -------> listing_created               -------> (D&L): initialQualityScore consumer         ✅ WIRED
                                                                   (Ops): Track onboarding volume              pending
                                                                   (CR):  Funnel metric tracking               pending

                   -------> profile_edited                -------> (D&L): qualityScoreRecalc consumer           ✅ WIRED
 
                   -------> contact_attempt               -------> (D&L): dataQualityFlag consumer              ✅ WIRED
                                                                   (Ops): Outreach triage                      pending

                   -------> account_closed                -------> (D&L): suspendEnrichment consumer            ✅ WIRED
                                                                   (Ops): Update compliance register           pending
                                                                   (CR):  Churn analysis, cancel win-backs     pending

 COMMERCIAL        -------> conversion_milestone          -------> (Ops): Learning hypothesis L3               pending
                                                                   (PP):  Dashboard celebration/prompt         pending

                   -------> churn_risk_detected           -------> (Ops): Elevate support priority             pending
                                                                   (PP):  Show quality improvement suggestions pending

                   -------> winback_eligible              -------> (Ops): Email delivery queue (via Resend)    pending

                   -------> pending_cancellation_created  -------> (Ops): Context attribution for Paddle       pending

=====================================================================================================================
  WIRED: 9 D&L async consumers (S1, CS-WORK-012)
  PENDING: Remaining consumers arrive per-slice (S3–S10)
=====================================================================================================================
```

---

## 8. TRUST & VERIFICATION TIER ESCALATION

Verification is NOT an operational stage; it is an entity decision driven by automated checks, API interactions, and asynchronous human procurement. 

```text
=====================================================================================================================
                                 V E R I F I C A T I O N   E S C A L A T I O N   P A T H
=====================================================================================================================

  [ UNCLAIMED ]
       |
       |  <Provider registers & claims>
       v
+-----------------------+      [ Entity Claim Evaluation (Atomic Lock Hold) ]
| CLAIM EVALUATION      |       1. Email Domain == Website Domain? --------> [✓ Auto-Approve] 
| (Optimistic Lock)     |       2. Companies House ID active? -------------> [✓ Auto-Approve] 
+-----------------------+       3. Competing Claim Exists? ----------------> [Queue Dispute] ---> (TaskSpec -> Ops)
       |                        4. Sole Trader? ---------------------------> [Queue Manual] ----> (TaskSpec -> Ops)
    APPROVED
       |  (Entity sets `claimStatus: "claimed"`)
       v
  [ CLAIMED ] === (Tier limits: Standard Badge, Contact Info Visible)
       |
       |  <Entity async background checks>
       v
+-----------------------+      [ Entity Verification Check ]
| VERIFICATION CHECK    |       1. Companies House cross-reference (API)
|                       |       2. Domain Registrar WHOIS logic match
|                       |       3. Known Trade Body Registry check
+-----------------------+
       |   
    VERIFIED   (Entity sets `verificationStatus: "verified"`)
       |
       v
  [ VERIFIED ] === (Tier limits: Blue ✓✓ Badge, Boosted Quality Score)
       |
       |  <Provider upgrades to 'Premium' OR 'Partner'>
       |  <Entity requests Enhanced Credentials>
       v
+-----------------------+      [ Enhanced Evaluation ]
| MANUAL CLEARANCE      |       Entity generates 'TaskSpec: Evaluate Enhanced Credentials' -> Operations Worker
|                       |       (Requires ID scan, Public Liability Ins. check, peer references)
+-----------------------+
       |
   PREMIUM CLEARED  (Entity sets `verificationStatus: "premium_verified"`)
       |
       v
  [ PREMIUM VERIFIED ] === (Tier limits: Gold ✓✓✓ Badge, Max Quality Bonus)

```

---

## 9. DATA QUALITY & DECAY LOOP

Data quality isn't static; it decays. The entity perceives data rot as a score drop and orchestrates its own self-healing.

```text
=====================================================================================================================
                                 D A T A   D E C A Y   &   S E L F - H E A L I N G   L O O P
=====================================================================================================================

  [ CONSTANT LIVENESS CHECKS ]
  Run on cadence based on Verification Tier (Weekly to Monthly)
  Scheduled via DAS: `decay_liveness_check` and `enrichment_full_cycle` actions
         |
         +--> Website Check (HTTP 200) ----> [404/5xx for 7 days] ---> (Signal: High Severity)
         +--> Email Check (SMTP ping) -----> [Hard Bounce] ----------> (Signal: High Severity)
         +--> Companies House (API) -------> [Dissolved] ------------> (Signal: CRITICAL Severity)
         +--> Freshness Timestamp ---------> [>180 days stale] ------> (Signal: Medium Severity)

                 |
                 v
        [ evaluateDecayResponse() ]
                 |
  +--------------+-------------+---------------+
  | CRITICAL     | HIGH        | MEDIUM        |
  v              v             v               |
[Archive]     [Claimed?]     [Log Signal]      |
              /        \      \                |
            NO         YES    Degrade Score    |   <---- (Affects Search Algorithm Rank)
            |           |                      |
            v           v                      |
      Can Entity    [Notify Provider]          |
      Auto-Fix?         |                      |
      (e.g URL)         | 14 days              |
     /       \          v                      |
   YES       NO    [Notify #2]                 |
    |         |         | 30 days              |
    v         v         v                      |
[Apply]     [Queue    [Penalise                |
            TaskSpec] Quality                  |
                      Score]                   |
                        | 90 days              |
                        v                      |
                     [Suspend]                 |

```

---

## 10. SHARED INFRASTRUCTURE: DEFERRED ACTION SCHEDULER

The Deferred Action Scheduler (DAS) merges operations from all 4 domains into a single timeline execution engine, decoupling scheduling from side-effects. **35 action types registered.**

```text
=====================================================================================================================
          D E F E R R E D   A C T I O N   S C H E D U L E R   ( D A S )   —   3 5   A C T I O N S
=====================================================================================================================

  [ CR Domain ]         [ Ops Domain ]        [ PP Domain ]          [ D&L Domain ]
        |                     |                     |                       |
        | 60 days             | Daily               | 7 days                | 30 days
        v                     v                     v                       v
 [win_back_            [billing_               [compliance_           [expire_enquiry_
  evaluation]           reconciliation]         hold_recheck]          queue]
        |                     |                     |                       |
        +---------------------+---------+-----------+-----------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
| SHARED DAS DATABASE TABLE (`deferred_actions`)                                    |
| - id: UUID                                                                        |
| - action: DeferredActionType (35 registered)                                      |
| - executeAt: ISO8601 Timestamp                                                    |
| - params: JSONB (type-safe via DeferredActionParamsMap)                            |
| - retryPolicy: "once" | "retry_3"                                                |
| - onFailure: "log" | "alert_principal"                                           |
| - status: "pending" | "executing" | "completed" | "failed" | "exhausted"         |
|          | "cancelled"                                                            |
+-----------------------------------------------------------------------------------+
                                        |
                                        |  <-- pg_cron / node scheduler sweep
                                        v
+-----------------------------------------------------------------------------------+
| DAS WORKER EXECUTOR                                                               |
| Distributes exact action execution back to the owning domain handler.             |
|                                                                                   |
| if "win_back_evaluation"         -> dispatch to Commercial.executeWinback(params)  |
| if "compliance_hold_recheck"     -> dispatch to Platform.evalComplianceHold(...)   |
| if "retry_bounced_email"         -> dispatch to Email.retrySend(params)            |
| if "article_14_progress_check"   -> dispatch to Ops.checkArticle14Coverage(...)    |
+-----------------------------------------------------------------------------------+

  [ FULL ACTION REGISTRY (35) ]
  ┌───────────────────────────────────┬────────────────────────────────────────────┐
  │ CROSS-DOMAIN / INFRASTRUCTURE    │ DOMAIN-SPECIFIC                            │
  ├───────────────────────────────────┼────────────────────────────────────────────┤
  │ expire_enquiry_queue             │ decay_liveness_check                       │
  │ compliance_schedule_check        │ enrichment_full_cycle                      │
  │ billing_reconciliation           │ claim_abandonment_check                    │
  │ compliance_hold_recheck          │ taxonomy_review_preparation               │
  │ win_back_evaluation              │ data_health_review                         │
  │ auto_escalation_check            │ verification_calibration_review            │
  │ notification_cleanup             │ provider_outreach_ranking                  │
  │ grace_period_expiry              │ conversion_funnel_analysis                 │
  │ checkout_precondition_retry      │ revenue_health_extended                    │
  │ listing_update_reminder          │ multi_listing_pricing_evaluation           │
  │ enquiry_response_reminder        │ sponsored_placement_learning               │
  │ search_history_cleanup           │ operational_health_review                  │
  │ sla_breach_warning               │ contractor_performance_review              │
  │ task_timeout_check               │ principal_briefing_generation              │
  │ billing_hold_expiry              │ proactive_churn_detection                  │
  │ compliance_self_audit            │ learning_hypothesis_analysis               │
  │ check_quality_improvement        │ article_14_progress_check                  │
  │ quality_score_recalculation      │ retry_bounced_email                        │
  └───────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 11. SUPPORT TRIAGE DECISION TREE

Operations reframes support as an entity decision architecture. Most tickets are deflected or auto-resolved; humans are procured only for judgment tasks.

```text
=====================================================================================================================
                                 S U P P O R T   T R I A G E   D E C I S I O N   T R E E
=====================================================================================================================

  [ Inbound Support Request ]
               |
               v
      +-----------------+       
      | ENTITY CLASSIFY | 
      +-----------------+
               |
    +----------+----------+-----------------+-----------------+-----------------+
    |                     |                 |                 |                 |
[Password Reset]  [Billing/Payment]  [Profile Editing]  [Search Ranking]  [Legal Threat/]
    |                     |                 |                 |           [Sensitive   ]
    v                     v                 v                 v                 |
[Automated Link]   (Paddle portal?)   (KB Match?)      (Check Quality Score)    v
 (0 Human)            /       \         /     \               |           [IMMEDIATE]
                    YES        NO     YES      NO             v           [PRINCIPAL]
                    |          |       |       |        [Auto-Explain]    [ESCALATE ]
                    v          v       v       v        (Score is 45/100,
              [Redirect]  [Route to  [Auto-  [Route      improve by X)]
                           Support]  Suggest]  to             |
                          (TaskSpec)   |     Support]   (Satisfied?)
                                       v                      |
                                (Resolved?)              YES      NO
                                  /     \                 |        |
                                YES      NO               v        v
                                 |       |             [Close]  [Route to
                                 v       v                       Support]
                              [Close]  [Route]                  (TaskSpec:
                                                                 ranking_review)

* Note: Any ticket from a "High Churn Risk" subscriber gets elevated priority queueing.
* Unreachable Claimed Profile Complaints: Entity auto-responds with alternative active providers.

```

---

## 12. CLAIM VOLUME PROJECTION & CAPACITY

A dynamic look at how organic and outreach volume translates into human verification load. The entity monitors the auto-approval rate and alerts when human capacity is breached.

```text
=====================================================================================================================
                                 V E R I F I C A T I O N   T H R O U G H P U T   M O D E L
=====================================================================================================================

  [ Total Available Targets : 4,700 Listings ]
  [ Including: ~4,657 imported from 4rfv (CS-WORK-021) ]

     { Organic Claim Rate }             { Outreach Claim Rate }
     Low: 5% | Mid: 10%                 Low: 10% | Mid: 20% | High: 30%
             \                                      /
              \                                    /
               +----------------------------------+
                                |
                        [ Gross Claims ] 
                                |
             +------------------+------------------+
             |                                     |
       [ Auto-Approval ]                    [ Manual Review ]
       (Planning Assumption: 75%)           (Planning Assumption: 25%)
             |                                     |
             v                                     v
       [ Zero Human Effort ]               [ Thorough Review Capacity ]
                                           (~1.5 reviews per hour)
                                                   |
                                                   v
                                          [ Entity Capacity Decision ]
                                          If load > 20 hrs/week -> Alert: "HIRE_CONTRACTOR"
                                          If load < 20 hrs/week -> Procure via Marketplace

```

---

## 13. ONBOARDING & LISTING ACTIVATION PATHS (A, B, C)

Three distinct funnels converge on a unified Account+Listing model. The entity focuses heavily on Path C (Claiming) as the supply-side growth engine. Account creation is implemented (CS-WORK-013).

```text
=====================================================================================================================
          O N B O A R D I N G   F U N N E L S   ( A ,   B ,   C )   —   I M P L E M E N T E D
=====================================================================================================================

                            [ ACCOUNT CREATION CORE ] (CS-WORK-013 ✅)
                            1. Name + Email + Password (Better Auth)
                            2. Email Verification (assertEmailVerified guard)
                            3. ensureProfile() — idempotent upsert
                            4. linkAnonymousEnquiries(db, accountId, email)
                               (retroactively links anonymous enquiries by email match)
                            5. completePersonalisation(departments[]) — skippable
                                      |
       +------------------------------+---------------------------+
       |                              |                           |
  [ PATH A: Freelancer ]       [ PATH B: Company  ]         [ PATH C: Claim Seeded Listing ]
       |                              |                           |
  1. Set Primary Role          1. Set Company Type          1. CTA: "Is this your business?"
  2. Entity Auto-suggests      2. Entity Auto-suggests      2. Entity Evaluates Claim
     specialisations              service areas                  |
  3. Add bio, day rate         3. Add CH number, web             +--> (Match Email Domain) -> Auto-Approve
  4. Portfolio upload          4. Verify unique ID               +--> (Low Conf) -> Manual Review
       |                              |                          +--> (CH Dissolved) -> Auto-Reject
       v                              v                          |
  [ Publish Listing ]          [ Publish Listing ]          [ Editable Pre-Populated Form ]
  (Strength ~35%)              (Strength ~40%)              Provider edits existing imported data
       |                              |                          |
       |                              |                          v
       +------------------------------+--------------------------+
                                      |
                                      v
                          [ LIVE LISTING ACTIVE ]
                Day 14: "Add media to boost rank"

  [ tRPC Middleware Chain ]
  protectedProcedure → verifiedProcedure (assertEmailVerified) → domain logic

=====================================================================================================================
```

---

## 14. CONVERSION OPTIMISATION FUNNEL

Conversion is an entity decision architecture based on engagement signals, milestone triggers, and cold-start mitigations.

```text
=====================================================================================================================
                         F R E E M I U M   C O N V E R S I O N   E N T I T Y   F U N N E L
=====================================================================================================================

  [ Free Tier Listing Active ]
               |
               v
      (7 Days Post-Creation)
               |
      +--------+--------+ (Has >= 5 views?)
      |                 |
     YES               NO  -->  [ Cold Start Mitigation ]
      |                           Send Category-level Proxy Data:
      |                           "Buyers searched your Service Area X times..."
      v
[ Day 7-14: Analytics Teaser ]
"See who viewed your profile"
 (In-app notification)
               |
               v
      (Does Provider Click?)
      /                    \
    YES                     NO ---> [ Day 14 ] --> Email: "Engagement Summary"
     |                                                 |
     v                                       (Does Provider Open?)
[ Shows Blurred Premium Data ]                          /             \
"3 companies viewed you —                            YES              NO ---> [ Flag Low Activation ]
 upgrade to see who"                                  |                         Decrease outreach freq.
     |                                                v
     v                                           [ View Teaser ]
(Provider clicks upgrade?)                                 |
     |                                                     v
    YES ---> [ CHECKOUT ]                          (Clicks upgrade?) --> NO
                                                           |
                                                           v
                                                       [ Day 30 ]
                                              Email: "Social Proof Signal"
                                              "47 providers in your area upgraded"

  [ EVENT-BASED TRIGGERS ] (Interrupt Time-Based Funnel)
   - First Enquiry Received -> Prompt: "See who's viewing you"
   - View Milestone Crossed (50/100/200 views) -> Prompt: "You've been viewed X times"
   - Multiple Search Terms -> Prompt: "Buyers found you via 3 search terms"

```

---

## 15. CANCELLATION & CHURN INTERVENTION

The entity executes a restrained, data-driven churn intervention. Once cancelled, it evaluates win-back eligibility at Day 60 based on subsequent engagement data.

```text
=====================================================================================================================
                         C H U R N   &   W I N - B A C K   D E C I S I O N   T R E E
=====================================================================================================================

  [ Cancellation Event Detected ] (From Paddle Webhook via Ops)
                 |
                 v
        { Reason For Cancel? }
                 |
   +-------------+---------------+-------------------+
   |                             |                   |
[Voluntary]               [Payment Failed]     [Paddle Recon. /
(Provider cancels)       (Paddle retries fail)  Account Closed]
   |                             |                   |
   v                             v                   v
(Active enquiries                |             [ Accept Gracefully ]
in last 30 days?)                |             (Cancel sub via API)
  /           \                  |                   |
YES            NO                |                   |
 |             |                 |                   |
 v             v                 v                   v
[Show: "You  [Accept          [14-Day Grace      [ End Sub ]
lose X"] --> Gracefully]       Period]            (Emit End Event)
 |             |                 |                   |
 v             |                 v                   |
(Cancel        |            (Recovered?)             |
anyway?)       |             /        \              |
 | \           |           YES         NO            |
 |  \          |            |          |             |
 v   v         v            v          v             |
YES  NO --> [Retain] [Sub Restored]  [Downgrade]     |
 |             |            ^          |             |
 +-------------+------------+          +-------------+
                 |                             |
                 +-----------------------------+
                               |
                               v
               [ SCHEDULE DEFERRED WIN-BACK (DAY 60) ]
               DAS action: `win_back_evaluation`
                               |
                               v
                     (Day 60 Arrival) ---> [ Evaluate Engagement Since Cancel ]
                                                     |
                                            +--------+--------+
                                            |                 |
                                    (>3 new enquiries   (Zero new data)
                                     or >100 views)           |
                                            |                 v
                                            v           [ Do Nothing. ]
                             [ Send Value-based Email ]
                             "You've received 4 new 
                              enquiries since you left.."

=====================================================================================================================
```

---

## 16. SHARED INFRASTRUCTURE: S0 LAYER

The S0 infrastructure layer provides 6 shared services consumed by all 4 domains. All built, all tested, zero type errors.

```text
=====================================================================================================================
          S 0   I N F R A S T R U C T U R E   L A Y E R   ( 6   M O D U L E S ,   4 5   A C )
=====================================================================================================================

+-----------------------------------+     +-----------------------------------+
| EVENT BUS (CS-WORK-001)           |     | DEFERRED ACTION SCHEDULER         |
| src/lib/events/*                  |     | (CS-WORK-002) src/lib/scheduler/* |
|                                   |     |                                   |
| - InProcessEventBus               |     | - scheduleDeferredAction()        |
| - 25 EventType union              |     | - cancelDeferredAction()          |
| - Sync + Async modes (per handler)|     | - pollAndExecute()                |
| - EventPayloadMap (type-safe)     |     | - ActionHandler<T> registry       |
| - ConsumerEntry matrix tracking   |     | - RecurringActionConfig seed      |
| - EventConsumerError logging to DB|     | - 35 action types (typed params)  |
+-----------------------------------+     +-----------------------------------+
              |                                         |
              v                                         v
+-----------------------------------+     +-----------------------------------+
| DECISION LOGGER (CS-WORK-003)     |     | FLOW ENGINE (CS-WORK-004)         |
| src/lib/decisions/*               |     | src/lib/flows/*                   |
|                                   |     |                                   |
| - logDecision(db, entry)          |     | - FlowType: "erasure" | "closure" |
| - Domain + decisionType + I/O     |     | - Step-level retry + skip         |
| - Immutable audit trail           |     | - Auto-escalation (3 failures)    |
|                                   |     | - FlowStatus lifecycle            |
+-----------------------------------+     +-----------------------------------+
              |                                         |
              v                                         v
+-----------------------------------+     +-----------------------------------+
| EMAIL + AUTH (CS-WORK-005)        |     | STORAGE / ISR / CI (CS-WORK-006)  |
| src/lib/email/*, src/lib/auth.ts  |     | src/lib/storage/*, notifications/ |
|                                   |     |                                   |
| - Resend transport (prod)         |     | - ObjectStorageService (R2 + mock)|
| - InMemoryEmailService (test)     |     | - ISR revalidation utility        |
| - Template registry               |     | - Notification system             |
| - Category preferences            |     | - Service abstraction (DI)        |
| - Better Auth (SSO, MFA, roles)   |     | - tRPC error handler              |
| - tRPC middleware chain           |     | - GitHub Actions CI/CD            |
+-----------------------------------+     +-----------------------------------+

  [ Services Abstraction ] (src/lib/services/types.ts)
  ┌──────────────────────────────────────────────────┐
  │ Services = {                                     │
  │   email:          EmailService                   │
  │   payment:        PaymentService (Paddle)        │
  │   companiesHouse: CompaniesHouseService           │
  │   storage:        ObjectStorageService (R2)      │
  │ }                                                │
  └──────────────────────────────────────────────────┘
  Production: real services. Tests: createTestServices() with mocks.
```

---

## 17. COMMUNICATIONS PIPELINE (PHASE 1)

End-to-end email lifecycle: send → log → deliver → track → bounce → suppress. Implemented as a decorator chain around the core EmailService.

```text
=====================================================================================================================
     C O M M U N I C A T I O N S   P I P E L I N E   ( P H A S E   1   C O M P L E T E )
=====================================================================================================================

  [ Application Code ]
          |
          | send(template, to, data, category, accountId?, listingId?)
          v
  +------------------------------------------------------------------+
  | LoggingEmailService (Decorator)                                  |
  | src/lib/email/logging-service.ts                                 |
  |                                                                  |
  | 1. System suppression check:                                     |
  |    - Account-level: account_profiles.suppressedAt IS NOT NULL    |
  |    - Email-level: suppressed_emails table lookup                 |
  |    - Blocks ALL categories (including transactional)             |
  |                                                                  |
  | 2. If suppressed → log correspondence row (status: "suppressed") |
  |    return { messageId: null, status: "suppressed", threadId }    |
  |                                                                  |
  | 3. If not suppressed → delegate to inner EmailService            |
  |    Log correspondence row (status: "sent" | "failed")            |
  |    Track: threadId, SHA-256 mergeFieldsHash, providerMessageId   |
  +---------------------------+--------------------------------------+
                              |
                              v
  +------------------------------------------------------------------+
  | Inner EmailService (Resend / InMemory)                           |
  | - Template rendering (renderTemplate)                            |
  | - Category preference enforcement                                |
  | - Actual send via Resend API (prod) or InMemory (test)           |
  +---------------------------+--------------------------------------+
                              |
                              | webhook: email.delivered / opened / clicked / bounced / complained
                              v
  +------------------------------------------------------------------+
  | Resend Webhook Handler                                           |
  | POST /api/webhooks/email/events                                  |
  | src/lib/email/webhook-handler.ts                                 |
  |                                                                  |
  | 1. HMAC signature verification (WebhookVerifier interface)       |
  | 2. Lookup correspondence_log by providerMessageId                |
  | 3. Validate status transition:                                   |
  |    sent → delivered → opened → clicked                           |
  |    sent → bounced | failed                                       |
  |    email.complained → treated as hard bounce (any state)         |
  | 4. Same-state = no-op, invalid = log to event_consumer_errors    |
  +---------------------------+--------------------------------------+
                              |
                              | (if bounced)
                              v
  +------------------------------------------------------------------+
  | Bounce Handler                                                   |
  | src/lib/email/bounce-handler.ts                                  |
  |                                                                  |
  | HARD BOUNCE:                                                     |
  |   - Suppress account (account_profiles.suppressedAt)             |
  |   - Suppress email (suppressed_emails table)                     |
  |   - Log "email_suppressed" decision (Decision Logger)            |
  |                                                                  |
  | SOFT BOUNCE:                                                     |
  |   - Schedule retry_bounced_email via DAS (24h, once, log)        |
  |   - Reconstruct originalParams from correspondence_log           |
  |                                                                  |
  | THRESHOLD ALERT:                                                 |
  |   - 3+ bounces in 90 days → admin notification                  |
  +------------------------------------------------------------------+

  [ DSAR Support ] (src/lib/email/correspondence-queries.ts)
  - getCorrespondenceForAccount(accountId | email) → data export
  - anonymiseCorrespondence(accountId) → erase fields, retain skeleton

  [ Schema ] (src/db/schema/correspondence.ts)
  - correspondence_log: 17 columns, 6 indexes, 2 enums, self-ref FK
  - suppressed_emails: email + reason + correspondenceLogId

```

---

## 18. DATA & LISTINGS: INTEGRITY PIPELINE & TAXONOMY

Listing integrity is enforced by a sequential rule pipeline with short-circuit evaluation. Taxonomy overlap uses Jaccard similarity at service-area level.

```text
=====================================================================================================================
     L I S T I N G   I N T E G R I T Y   &   T A X O N O M Y   ( S 1 ,   C S - W O R K - 0 1 1 )
=====================================================================================================================

  [ Listing Create / Update ]
              |
              v
  +--------------------------------------------------------------+
  | Sequential Integrity Pipeline (short-circuits on first fail) |
  +--------------------------------------------------------------+
              |
  +-----------+-----------+-----------+
  |           |           |           |
  v           v           v           v
[Rule 1]   [Rule 2]   [Rule 3]    (Extensible)
  |           |           |
  v           v           v
Duplicate  Identity   CH Uniqueness
Detection  Verification

  Rule 1: DUPLICATE DETECTION
  - Sorted-neighbour algorithm (window 10)
  - pg_trgm similarity > 0.9 on name
  - CH number clustering
  - Union-find merge for transitive duplicates

  Rule 2: IDENTITY VERIFICATION
  - Cross-reference name vs Companies House record
  - Validate entity type matches CH registration

  Rule 3: CH UNIQUENESS
  - No two active listings share the same CH number
  - Enforced at pipeline level (not DB constraint)

  [ TAXONOMY OVERLAP ]
  computeTaxonomyOverlap(tagsA, tagsB)
  - Jaccard similarity at service-area granularity
  - Taxonomy: 7 sectors → 64 service areas → 269 specialisations

  [ 4RFV IMPORT PIPELINE ] (CS-WORK-021, CS-WORK-022)
  - 5-phase CLI: normalise → CH verify → dedup → commit → Article 14
  - ~4,657 companies imported from SQLite source
  - Postcode/email/URL/phone normalisation with OCR fix
  - CH batch verification (500ms rate limit)
  - No listing_created events emitted (by design)
  - Article 14 GDPR: email notice OR on-page flag
  - DAS: article_14_progress_check (alert_principal if <80% by day 20)

=====================================================================================================================
```

---

## 19. S1 DATA MODEL: SEARCH INFRASTRUCTURE

Full-text search with synonym expansion, trigram fallback, and taxonomy filtering. Built on PostgreSQL tsvector, pg_trgm, and GIN/GiST indexes.

```text
=====================================================================================================================
          S E A R C H   I N F R A S T R U C T U R E   ( S 1 ,   C S - W O R K - 0 0 8 )
=====================================================================================================================

  [ Query Input ]                          [ Index Infrastructure ]
   SearchParams {                           - search_vector: tsvector column
     query?: string                         - GIN index on search_vector
     filters?: SearchFilters                - GiST index for pg_trgm
     page?: number (default 1)              - Weights: Name=A, Tag=B, Desc=C
     limit?: number (default 20)            - Auto-update trigger on insert/update
   }                                        - search_synonyms table
         |
         v
  +----------------------------------------------+
  | executeSearch(db, params)                    |
  |                                              |
  |  1. Empty query?                             |
  |     YES → executeEmptySearch()               |
  |           (all active, sorted by composite)  |
  |                                              |
  |  2. expandQuery(db, query)                   |
  |     Lookup search_synonyms table             |
  |     Build tsquery (expanded or plain)        |
  |                                              |
  |  3. FTS: search_vector @@ tsquery            |
  |     Rank: buildRankExpression(tsquery)        |
  |     Results > 0? → return ranked             |
  |                                              |
  |  4. Trigram fallback:                         |
  |     similarity(name, query) > 0.3            |
  |     Rank: similarity score                   |
  +----------------------------------------------+

  [ Filter Composition ]
  sectorId       → eq(listingTaxonomyTags.sectorId, ?)
  serviceAreaId  → eq(listingTaxonomyTags.serviceAreaId, ?)
  specialisationId → eq(listingTaxonomyTags.specialisationId, ?)
  entityType[]   → listings.entityType = ANY(?)
  subscriptionTier[] → listings.subscriptionTier = ANY(?)
  Always:        → eq(listings.lifecycleStatus, "active")

=====================================================================================================================
```
