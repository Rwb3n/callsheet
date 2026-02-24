# CALLSHEET platform architecture decisions

**CALLSHEET should ship a lean V1 built on Supabase PostgreSQL, Better Auth, tRPC, and Vercel — a stack that costs under £40/month at launch and scales cleanly to 50,000 listings.** This architecture record covers seven interconnected decisions: V1 feature scope, search, authentication, API layer, ranking logic, infrastructure, and payment processing. Every recommendation prioritises solo-founder velocity, generous free tiers, and the ability to add a second vertical later without a rebuild. The decisions below are informed by how Clutch, Checkatrade, Thumbtack, and Bark actually work — not theoretical comparisons — and grounded in confirmed pricing and real-world production experience as of early 2026.

---

## 1. What ships in V1 and what waits

The single most important scoping principle is that CALLSHEET's competitive advantage at launch is a **clean, claimed, verified database** — not feature richness. Every feature that delays seeding and claiming those 4,700 listings is a V2 feature.

**V1 must-haves** (the platform does not function without these):

- **Provider profile management**: company name, description, logo, service categories from the relational taxonomy, primary location, contact info, website URL. Clutch, Checkatrade, and ProductionHub all treat this core profile card as the atomic unit of value. Rich portfolio galleries, video embeds, and rate cards are V2 — they add upload/storage complexity without proportional value before the database has critical mass.
- **Claim-and-verify flow**: the primary growth mechanism for 4,700 pre-seeded listings. Yelp's model is the proven template — search → click "Claim this listing" → create account → verify via email confirmation → dashboard unlocked. Phone verification adds telephony complexity and is V2. Map directly to the four-tier model: Unclaimed listings show a prominent claim CTA, Claimed requires only email verification, Verified triggers Companies House API lookup, and Premium Verified gates behind a paid tier.
- **Search and filtering**: category search across the taxonomy, location filtering by UK region/city, and keyword text search. These three filters handle **90% of buyer use cases** across every B2B directory studied. Anonymous browsing with no login wall is non-negotiable — Clutch, Checkatrade, and ProductionHub all allow free browsing, and a login wall would destroy SEO indexing and inflate the bounce rates that already plague competitors like 4RFV.
- **Basic enquiry form**: buyer fills in name, email, brief description, and approximate budget → email sent to provider → provider sees enquiry in dashboard. Do not build a messaging system. Bark and Clutch both started with email-forwarded enquiries before investing in in-platform messaging. The enquiry form captures the transaction metric and creates the value loop.
- **Admin dashboard**: view/search all listings, approve/reject claims, edit listings, manage verification queue. This needs to be functional, not polished — only the founder uses it. Bulk actions and audit logs are V2.
- **Transactional email**: account verification, claim confirmation, enquiry notifications, verification status updates, subscription receipts. Six to eight templates via Resend's API.
- **Stripe/Paddle subscription checkout**: the £199/£399/£699 tiers need to work at launch. Using hosted checkout and a pre-built customer portal eliminates the need for custom payment UI. Budget one to two weeks using the well-documented Vercel subscription-payments starter as a reference.

**V1 should-haves** (significantly improve value proposition, build if time permits):

- **Basic dashboard analytics**: profile view count, search appearance count, enquiry count. These are simple database counters, not time-series charts. They serve a critical commercial purpose — demonstrating the value gap between free and paid tiers, exactly as Clutch does with its gated Audience Tab.
- **Profile completeness scoring**: a visible completeness percentage that nudges providers to fill out their profiles. This simultaneously improves data quality and feeds the ranking algorithm. Google Business Profile reports that verified businesses with complete profiles receive **42% more direction requests**.
- **Text-based credits/project list**: project name, client name, brief description, year. Simple text entries, no image uploads.
- **Registration-gated contact**: show direct contact info only on Verified+ profiles to incentivise claiming and verification. Buyers must register to send enquiries, capturing their identity for platform analytics.

**V2+ deferrals** (confirmed through comparable platform analysis as post-launch features):

Side-by-side comparison (no platform launches with this), in-platform messaging/chat, rich portfolio galleries and video, advanced faceted filters (budget, team size, ratings), in-app notification centre, automated data quality monitoring, digest emails, promotional codes, and AI-powered matching. Clutch built many of these features over a decade. CALLSHEET should not attempt them in six months.

---

## 2. PostgreSQL search is the right V1 choice, with a clear migration trigger

At **4,700 listings**, PostgreSQL full-text search is not a compromise — it is the correct engineering decision. The search workload at launch is overwhelmingly filter-driven (category, location, verification tier), which is just SQL `WHERE` clauses where PostgreSQL excels. The text-search component is secondary.

The implementation approach uses `tsvector` with weighted columns — company name at weight A, service categories at B, description at C — plus `pg_trgm` GIN indexes for fuzzy matching on company names. Benchmarks on datasets orders of magnitude larger (10 million rows with pg_trgm) show GIN-indexed queries returning in **5ms for LIKE and ~137ms for similarity searches**. At 5,000–50,000 records, every query will complete well under 100ms.

The practical limitations are real but manageable at V1 scale. **Typo tolerance is character-level, not semantic** — searching "cameraman" will not find "camera operator" without synonym mapping. Faceted count queries grow in complexity as filters multiply. There is no built-in search-as-you-type. These limitations matter at scale but not at launch, and they are solvable with application-layer workarounds (synonym tables, pre-computed facet counts, debounced prefix queries).

A case study from CybermindWorks confirms the pattern: they **switched back from Typesense to PostgreSQL FTS** for ~17,000 records because the sync complexity and memory overhead outweighed the benefits. Conversely, a marketplace architect reported latency dropping from ~1.2 seconds to ~50ms after migrating from PostgreSQL `ILIKE` to Meilisearch at 50,000+ listings — confirming that the migration trigger is real but comes later.

**The migration target is Meilisearch**, either self-hosted (MIT license, free) or via Meilisearch Cloud (**$30/month** for 50,000 documents and 50,000 searches). Typesense Cloud is cheaper at **$7–25/month** for equivalent scale but Meilisearch has better PostgreSQL sync tooling via `meilisync` (real-time WAL-based replication). Algolia's 10,000 free searches per month is too restrictive for production, and pricing escalates unpredictably.

**The migration trigger**: users complaining about search quality, demand for instant search-as-you-type, or facet count queries noticeably slowing down — likely around 10,000–20,000 active listings. The migration itself is low-to-moderate difficulty: a one-time bulk index at 50,000 records is trivial, the real work is refactoring search queries from SQL to the Meilisearch API and maintaining the sync pipeline. Design the V1 search as a service layer abstraction (`searchProviders(query, filters)`) so the underlying implementation can be swapped without touching UI code.

---

## 3. Better Auth is the clear winner for dual-role authentication

The authentication landscape shifted significantly in September 2025 when **Auth.js (formerly NextAuth.js) officially joined Better Auth**, with the Auth.js team recommending all new projects use Better Auth. Auth.js v5, which never left beta, is now in maintenance mode receiving only security patches. This makes the decision clearer than it would have been six months ago.

Better Auth is the right choice for CALLSHEET for four reasons that compound. First, it handles **multiple roles per user natively** — users can hold both `provider` and `buyer` roles simultaneously, with typed permission checks via `createAccessControl()` and `hasPermission()`. This maps directly to CALLSHEET's unified account model without workarounds. Second, it costs **£0 at any scale** — no per-MAU pricing. For a marketplace where both sides need accounts, Clerk's pricing would reach £550+/month at 40,000 MAUs before add-ons. Third, Better Auth stores all user data in your own PostgreSQL, meaning CALLSHEET's custom fields — `verificationTier`, `subscriptionTier`, `profileCompleteness` — live alongside auth data in a single database with no black-box metadata. Fourth, the TypeScript-first architecture with Zod validation creates a unified type-safety chain from auth through tRPC to the frontend.

The tRPC middleware pattern maps cleanly to CALLSHEET's access model:

- `publicProcedure` → browse directory, search
- `authedProcedure` → any authenticated action  
- `providerProcedure` → listing management, enquiry responses  
- `buyerProcedure` → send enquiries, save shortlists  
- `adminProcedure` → platform management, verification queue  
- `subscribedProcedure(tier)` → features gated by subscription level

**Clerk** remains the faster-to-ship option (~30 minutes to working auth vs ~2–4 hours for Better Auth), but the ongoing cost and vendor lock-in make it a poor choice for a platform that will grow linearly in user accounts on both sides of the marketplace. **Supabase Auth** is viable if going all-in on Supabase's ecosystem, but its role-based access requires custom PostgreSQL functions and JWT manipulation that is less clean than Better Auth's TypeScript-native approach. A production-ready starter template already exists combining **Next.js 16 + Better Auth + Drizzle ORM + Supabase** as the database layer, validating this exact combination.

---

## 4. tRPC delivers maximum velocity with a REST escape hatch

For a solo TypeScript founder writing both frontend and backend, **end-to-end type safety without code generation is the single largest productivity multiplier available**. Change a procedure's return type and every component consuming it shows instant type errors — no OpenAPI spec regeneration, no client SDK rebuild, no runtime surprises.

tRPC's middleware chain, combined with Better Auth's permission system and Zod for input validation, creates a composable security model where auth checks, role enforcement, and subscription gating are all typed and testable. The canonical stack — **Next.js + tRPC + Drizzle + PostgreSQL** (the T3 stack) — is the most widely adopted full-stack TypeScript pattern in production, with thousands of apps validating the approach.

The concern about future decoupling is addressed by `trpc-to-openapi`, which lets you selectively annotate procedures with OpenAPI metadata to expose them as standard REST endpoints with automatic Swagger documentation. This means CALLSHEET can offer a public API for integrations (production companies pulling provider data into their systems) without rewriting a single procedure — just add the `.meta({ openapi: { method: 'GET', path: '/v1/providers' } })` annotation.

**GraphQL is ruled out.** Both Checkatrade and Thumbtack use it, but they have engineering teams of 30–100+. For a solo developer, the overhead of schema definition, resolver implementation, N+1 query prevention, and dataloader management is not justified when the query patterns are predictable (search providers, view profile, manage listing). GraphQL's flexibility in client-specified queries provides no meaningful benefit for a directory where the UI defines what data is needed.

**REST with ts-rest** is the runner-up — more conventional and inherently decoupled, but requires more boilerplate and has a smaller community than tRPC. The type-safety benefits are similar but achieved through a contract-first approach that adds a layer of abstraction. For a solo founder, tRPC's ergonomics win.

---

## 5. Ranking separates quality signals from paid visibility

The ranking algorithm is where CALLSHEET's "pay for visibility, not credibility" principle becomes concrete. Research across Clutch, Yelp, and Google Business Profile reveals a consistent pattern: **all successful directories maintain a hard separation between earned quality metrics and paid placement**.

Clutch's model is instructive. Its "Ability to Deliver" score (reviews, market presence, experience) determines position in the Leaders Matrix and **cannot be purchased**. Paid sponsorship only affects placement within directory browse pages, and is clearly labeled. Yelp explicitly states paid ads do not affect organic ranking. Google's official position is "no way to request or pay for better local ranking."

**The V1 ranking formula** uses a composite quality score (0–100) plus an additive paid boost:

The quality score weights five signals: **relevance to search query (30%)**, profile completeness (25%), verification tier (20%), freshness/recency (15%), and engagement (10%). Profile completeness at 25% is intentionally high — it is the key cold-start lever, giving new listings an immediate, controllable path to better ranking without needing reviews or engagement history. Engagement score defaults to a neutral **0.5** for new listings rather than zero, preventing a cold-start penalty. A small random factor (±3 points) within similar score bands ensures fair rotation of impressions.

The paid boost is additive, not multiplicative. Free listings get +0, basic paid gets +15, premium gets +25. This means **a paid listing with poor quality still ranks below a free listing with excellent quality**. Sponsored/Featured listings appear in a clearly labeled section above organic results, visually distinct — the Google Ads pattern. Quality badges (Verified, Premium Verified) are earned through the verification process, never purchased.

New listings receive a temporary "New" badge and a +5 point boost for 30 days. A "Recently Added" section on category pages provides guaranteed initial visibility. These mechanisms address the Amazon-style cold-start problem where algorithms cannot determine relevance for listings with no engagement history.

This entire formula is implementable as a single PostgreSQL `ORDER BY` clause combining `ts_rank`, computed columns, and stored scoring values — no external ranking service needed.

---

## 6. The recommended infrastructure stack costs £36/month at launch

The optimal stack for a solo founder building CALLSHEET combines **Supabase for database and storage, Better Auth for authentication, Cloudflare R2 for public images, Resend for email, and Paddle for payments**, all fronted by Vercel.

| Service | Launch cost | Growth cost (50K listings) |
|---|---|---|
| Vercel Pro | £16/month | £16/month |
| Supabase Pro (PostgreSQL + Storage) | £20/month | £36/month |
| Better Auth | £0 | £0 |
| Cloudflare R2 (provider images) | £0 (10GB free) | ~£1/month |
| Resend (transactional email) | £0 (3K emails/month free) | £16/month |
| Paddle | Transaction fees only | Transaction fees only |
| **Total** | **~£36/month** | **~£69/month** |

**Supabase Pro at £20/month** provides 8GB PostgreSQL with all required extensions (pg_trgm, PostGIS, full-text search), 100GB file storage, 100,000 auth MAUs (though Better Auth handles auth separately, Supabase's database is the value), daily backups, and email support. The spend cap feature prevents surprise bills. Supabase's PostgreSQL extension support is confirmed — pg_trgm, PostGIS, and pgvector all work, giving CALLSHEET fuzzy matching, geospatial queries, and future AI-powered similarity search from the same database.

**Cloudflare R2** deserves special attention for file storage. Its free tier includes **10GB storage, 1 million writes, and 10 million reads per month — with zero egress fees forever**. For a directory serving provider logos and portfolio thumbnails, this means 4,700 listings with ~5GB of images costs literally nothing. At 50,000 listings with 50GB of images, storage costs approximately £0.60/month. The zero-egress pricing model is uniquely advantageous for a directory that serves the same images repeatedly.

**Paddle over Stripe** is the highest-leverage infrastructure decision for a solo UK founder. Paddle's 5% + 40p transaction fee appears higher than Stripe's ~2.5%, but Paddle is a Merchant of Record — it calculates, collects, files, and remits VAT across all jurisdictions. For a solo founder selling £199–£699 annual subscriptions to UK businesses, this eliminates **15–20 hours per month** of finance and compliance work. One audit found Paddle saves ~$7,000/year versus Stripe plus a full compliance stack. The recommendation is to start with Paddle and consider migrating to Stripe only after £100K+ MRR when dedicated finance support is affordable.

**Neon is the runner-up database** if database branching for CI/CD preview environments is a priority. Neon's instant copy-on-write branching creates a database branch per Vercel PR preview — significantly more efficient than Supabase's branching. Neon's post-Databricks-acquisition pricing is also competitive at ~£8/month at launch. The trade-off is managing separate services for auth, storage, and other capabilities that Supabase bundles.

**PlanetScale is confirmed ruled out** — MySQL-compatible only, free tier removed in March 2024, no PostgreSQL support.

---

## 7. Competitors validate the stack and reveal the opportunity

Tech stack analysis of comparable platforms confirms CALLSHEET's architectural choices and reveals the competitive landscape.

**Checkatrade** — the closest UK comparable — runs **TypeScript, React, Node.js, GraphQL, PostgreSQL on GCP with Terraform**. This is near-identical to CALLSHEET's planned stack, validating the technology choices for a UK directory at scale (~100-person engineering team). **Thumbtack** uses React, Next.js, TypeScript, PostgreSQL, and Elasticsearch — confirming both the frontend framework choice and the eventual need for dedicated search. **Clutch** rebuilt from a monolithic CMS to Go/Python microservices on Kubernetes with PostgreSQL, storing 3M+ rows in their stats service alone.

The direct competitors tell the real story. **ProductionHub** runs jQuery, Bootstrap, and Microsoft IIS on Azure — legacy technology with no modern framework. **The Knowledge Online** is a traditional CMS that originated as a 1986 print directory. **4RFV** is a traditional web application with 33 detected technologies per BuiltWith. All three are **monolithic, legacy platforms** with no evidence of modern search, TypeScript, or reactive UI capabilities.

This creates a significant competitive moat through technology alone. CALLSHEET's instant search, progressive disclosure onboarding, responsive design, and API-first architecture will deliver a qualitatively different user experience from competitors still running jQuery-era interfaces. The data layer advantage — Companies House API verification, structured taxonomy with relational hierarchy, profile completeness scoring — compounds this gap.

Every major platform that reached scale (Clutch, Bark, Thumbtack, Houzz) started as a monolith and migrated to microservices later. CALLSHEET should follow the same pattern: ship a **modular monolith** (Next.js + tRPC with clean service-layer abstractions), then extract services only when specific bottlenecks demand it.

---

## Cross-references

| Document | Relationship |
|---|---|
| `data-model-proposal.md` | Schema design (accounts, providers, taxonomies, verifications) implemented in Drizzle ORM on Supabase PostgreSQL. Provider type field supports V2 talent expansion. |
| `taxonomy-v1-proposal.md` | 7 sectors → ~50 service areas → ~200 specialisations stored as relational hierarchy. Loaded from seed configuration — vertical-agnostic by design. |
| `trust-verification-findings.md` | 4-tier verification (Unclaimed→Claimed→Verified→Premium Verified) maps directly to claim flow and ranking algorithm. Companies House API integration is a V1 must-have. |
| `data-quality-framework.md` | 5-dimension, 0–100 composite score feeds profile completeness ranking signal (25% weight). |
| `onboarding-flow-findings.md` | 3 onboarding paths (freelancer/company/claim) implemented via Better Auth with progressive disclosure. Claim path is highest-conversion supply-side growth engine. |
| `freemium-conversion-findings.md` | £199/£399/£699 tiers processed via Paddle. Analytics-as-conversion-lever implemented as simple database counters at V1. |
| `provider-buyer-duality-findings.md` | Unified account with dual roles implemented natively in Better Auth. No role-switching UI — capabilities accumulate. |
| `on-screen-talent-scope-findings.md` | B2B talent services (voice-over agencies, presenter agencies) included in V1 taxonomy. Individual talent profiles deferred to V2+. |
| `strategic-positioning.md` | "Pay for visibility, not credibility" principle made concrete in ranking algorithm. Vertical-agnostic data layer confirmed at every architectural level. |

---

## Decisions confirmed

| Decision | Rationale |
|---|---|
| Next.js + TypeScript end-to-end | Solo founder velocity, strongest AI tooling, ecosystem maturity |
| Supabase PostgreSQL | Relational data model, required extensions (pg_trgm, PostGIS), £20/month, managed |
| Better Auth | Free at any scale, native multi-role, own-database, TypeScript-first. Auth.js now recommends it. |
| tRPC | End-to-end type safety, T3 stack validation, REST escape hatch via trpc-to-openapi |
| PostgreSQL full-text search at V1 | Correct for 4,700 listings. Migration to Meilisearch at 10–20K. Service layer abstraction preserves swap. |
| Paddle over Stripe | Merchant of Record eliminates VAT compliance for solo founder. Migrate at £100K+ MRR. |
| Cloudflare R2 for images | Zero egress, 10GB free, £0 at launch scale |
| Resend for email | 3K/month free, simple API, £0 at launch |
| Vercel Pro for hosting | £16/month, Next.js-native, preview deployments |
| Modular monolith architecture | Ship fast, extract services when bottlenecks demand it. Every scaled platform started here. |
| Ranking: quality + additive paid boost | Verification tier and completeness are earned. Payment buys visibility boost, not credibility. |

## Decisions deferred

| Decision | Trigger |
|---|---|
| Meilisearch migration | Search quality complaints or facet slowdowns at 10–20K listings |
| Public REST API via trpc-to-openapi | External integration demand from production companies |
| Microservice extraction | Specific performance bottleneck in a bounded context |
| In-platform messaging | Enquiry volume exceeds email-forward capacity |
| Rich portfolio/video hosting | Provider demand + storage cost justified by paid tier revenue |
| AI-powered matching | V2+ after structured search validates query patterns |
