# Running CALLSHEET solo: an operational blueprint for a one-person B2B directory

**A solo founder can realistically operate a 4,700-listing UK production directory through to 500 paying subscribers — but only with disciplined automation, ruthless prioritisation, and a near-zero-cost tooling stack.** The evidence from bootstrapped directory founders like Pieter Levels (Nomad List, $3.1M ARR, zero employees) and Piotr Kulpinski (OpenAlternative, $13k/month, 2–3 hours/week) shows this model works. The critical constraints are not technical but operational: manual verification throughput, support volume management, and knowing precisely when to stop doing everything yourself. This report maps every operational requirement — from Companies House API rate limits to cookie compliance — with real benchmarks and UK-specific numbers.

---

## How solo directory founders actually spend their time

The pattern across successful bootstrapped directories is consistent: **aggressive automation first, manual curation only for paid listings, self-service everything else**. Pieter Levels runs Nomad List on vanilla PHP with SQLite on a single $40/month VPS. Piotr Kulpinski automated data collection, content generation, and social posting via N8N, reducing his weekly time commitment to 2–3 hours. Tyler Tringas capped his work on Storemapper at **15–20 hours per month** while growing it to $20K+ MRR.

The realistic time split for a solo directory founder pre-$5K MRR is roughly **60% product/support, 30% marketing/growth, 10% admin**. That ratio shifts as revenue grows — at $5K–$20K MRR, customer support consumes approximately 30% of time and becomes the dominant operational burden. For CALLSHEET specifically, with 4,700 listings and a target of 500 paying subscribers, the total weekly commitment likely sits at **20–30 hours** once the platform is live and generating meaningful traffic.

The failure modes are well-documented. **Customer support drowning** is the number one killer — at 200–500 active users, support becomes the primary time sink, often requiring the founder to triage bugs rather than delegate. Manual curation that doesn't scale is the second classic trap: Microns.io's founder found that manually vetting every listing was the quality differentiator but also the bottleneck that forced him to hire. The third failure mode is motivational — Rob Walling's observation that "bootstrappers don't run out of money; they run out of motivation" during what Tyler Tringas calls the **"long, slow SaaS ramp of death"** where MRR grows linearly at £100–200/month for 12+ months.

---

## Verification throughput determines your operational ceiling

Manual business verification is the single most time-intensive operation for a pre-populated directory. Industry benchmarks from KYB (Know Your Business) providers put a full manual verification at **~1 hour per check**. For CALLSHEET's lighter-touch model — Companies House lookup, quick website/IMDb cross-reference, credential scan — realistic throughput is **4–6 light verifications per hour** or **1–2 thorough verifications per hour**.

At those rates, a part-time operator doing 20 hours/week can process 80–120 light verifications or 20–40 thorough ones weekly. Verifying all 4,700 seeded listings at the light-touch rate would take **40–60 weeks of part-time work** — nearly a year. This is clearly impractical as a batch exercise.

The solution is a **hybrid batch-plus-on-demand model**. Run all 4,700 listings through the Companies House API in a single automated batch — at 600 requests per 5 minutes, this takes roughly 40 minutes and costs nothing (the API is entirely free for commercial use). This automated pass confirms company status (active/dissolved), registered address, incorporation date, and SIC codes. Reserve manual verification exclusively for listings being claimed by business owners, targeting a **24–48 hour turnaround** on claim requests.

A critical limitation for the film/TV sector: **many broadcast professionals operate as sole traders or personal service companies**. Sole traders do not appear in Companies House records. For these individuals, IMDb profile, Bectu membership, website portfolio, and showreel become the primary verification vectors — and this work cannot be automated. At the point where new claim requests exceed **20–30 per week requiring thorough verification**, a part-time contractor or significant automation investment becomes necessary.

The major platforms' approaches offer useful models. Google Business Profile now primarily uses video verification (reviewed in 3–5 days). Yelp relies on phone PIN verification to business numbers plus human moderation. Trustpilot uses domain email matching. For CALLSHEET, a practical claim flow would be: business finds unclaimed listing → creates account with business email → email verification plus Companies House number cross-check → optional enhanced "Verified" badge via IMDb link or credential evidence → admin approval within 24–48 hours.

---

## Seeding 4,700 listings: claim rates, data decay, and GDPR

Pre-populating a directory creates immediate supply-side value but introduces three operational challenges: cleaning the data, managing unclaimed listings, and staying GDPR-compliant.

**Data cleaning for 4,700 scraped records** will require approximately **50–90 hours of total human effort**. Roughly 60–70% of records can be cleaned automatically through format standardisation, deduplication, and basic validation. Another 20–30% (~940–1,400 records) need manual intervention for ambiguous matches, incomplete data, or category misclassification. Around 5–10% (~235–470) should be removed entirely — dissolved companies, duplicates, or irrelevant businesses. Harvard Business Review data indicates that **47% of newly created data records have at least one critical error**, so this cleaning burden is normal, not exceptional.

Claim rates vary dramatically by platform and outreach effort. Yelp's overall claim rate across 64 million listings sits at just **~11%**. Google Business Profile is higher at approximately **44%**. For a niche B2B directory with targeted outreach, realistic expectations are:

- **Without active outreach**: 5–10% organic claims in year one (~235–470 listings)
- **With targeted email campaigns**: 10–20% claim rate (~470–940)  
- **With multi-touch outreach** (email + LinkedIn + phone): potentially 20–30% in a well-targeted niche where listings carry clear professional value

B2B data decays at roughly **30% per year** — companies dissolve, change addresses, rebrand, or exit the sector. Quarterly Companies House re-checks and an annual data refresh cycle are essential to prevent the directory from becoming stale.

On GDPR, a B2B directory holding business data under legitimate interest is defensible but requires proper documentation. Generic business data (company name, registered address, services) may fall outside GDPR scope entirely. Named individual contacts are personal data and require a documented **Legitimate Interest Assessment (LIA)** using the ICO's three-part test: purpose (maintaining an industry directory — valid), necessity (a directory cannot function without this data — valid), and balancing (business professionals reasonably expect industry directory listings, and the privacy impact is minimal — passes). The critical compliance requirement is sending an **Article 14 transparency notice within 1 month** of listing creation, informing businesses their data has been collected. Every listing must include a prominent "Claim or Remove" mechanism, and removal requests must be honoured promptly.

---

## The £0/month ops stack that actually works

The Supabase + Vercel + Resend foundation already provides most of what a solo directory founder needs: database, auth, storage, serverless functions, edge functions, deployment CI/CD, transactional email, and built-in logging. The additional tooling layer can genuinely cost nothing.

| Category | Tool | Cost | Key limits |
|---|---|---|---|
| Monitoring | UptimeRobot Free | £0 | 50 monitors, 5-min checks |
| Product analytics | PostHog Free | £0 | 1M events/month, 5K session replays |
| Error tracking | Sentry Free | £0 | 5K errors/month |
| Session recording | Microsoft Clarity | £0 | Unlimited |
| Support | Email inbox via Resend | £0 | Manual management |
| Live chat | Crisp Free | £0 | 2 seats |
| Billing | Paddle + Customer Portal | £0* | Transaction fees only |
| CRM | Notion / Google Sheets | £0 | Manual |
| Logging | Supabase built-in | £0 | Included |
| Issue tracking | Linear Free | £0 | Unlimited |

The first real spend should be **Vercel Pro at £16/month** — the Hobby tier technically prohibits commercial use. After that, Plausible at ~£8/month adds a clean, privacy-compliant web analytics dashboard alongside PostHog's deeper product analytics. Total growth stack cost: **~£31/month**.

The specific tool comparisons worth noting: **UptimeRobot beats Better Stack** on free tier generosity (50 monitors vs 10), though Better Stack wins if you need integrated logging. **PostHog beats Plausible** for a solo founder because it's free with vastly richer features (funnels, retention, feature flags, A/B testing, session replays) — Plausible has no free tier at all. For support, **start with a shared email inbox** and graduate to Freshdesk Free (2 agents, ticketing, knowledge base) at around 50+ customers. Paddle Dashboard plus Customer Portal covers 100% of billing needs with zero additional cost — the Customer Portal provides self-service subscription management, invoice downloads, and payment method updates out of the box.

---

## Support volume at 500 subscribers is manageable — barely

B2B SaaS benchmarks put ticket volume at **0.2–0.5 tickets per customer per month**. For a directory platform with lower product complexity than typical SaaS, CALLSHEET should expect **100–150 tickets per month** at 500 subscribers — roughly **5–8 per business day**.

The support mix for a directory platform follows a predictable pattern: **30–35% profile/listing management** (editing profiles, uploading showreels, changing categories), **20–25% account and billing** (renewal queries, payment issues, VAT questions), **10–15% login/access** (password resets, email changes), **10–15% search visibility concerns** ("why can't I find my listing?"), and the remainder split across data corrections, claims/disputes, feature requests, and bug reports. Film/TV directories specifically generate tickets from **category misselection at onboarding** — production companies choosing the wrong department classification.

A well-built 10-article knowledge base deflects **30–40% of support volume**, dropping the daily load to **3–4 tickets per business day**. This is manageable for a solo operator processing support in two focused batches (morning and afternoon). The SLA should promise **response within 1 business day** while internally targeting 4-hour turnaround during business hours. An autoresponder confirming receipt, setting the timeframe expectation, and linking to top FAQ articles is essential.

The transition from email to ticketing should happen at around **50+ tickets per month** — the point where tracking, categorisation, and canned responses deliver meaningful time savings. At 500 subscribers, Freshdesk Free is the pragmatic choice. The scaling trigger for hiring support help is **150+ tickets/month sustained**, or whenever CSAT drops below 75%.

---

## UK compliance: what you must do before launch

**ICO registration is mandatory and costs £52/year** (Tier 1, for organisations with turnover ≤£632,000 or ≤10 staff). Registration takes approximately 15 minutes online and provides a registration number to display on the website. Non-registration carries a maximum fine of approximately **£5,645**.

The broader compliance checklist breaks into pre-launch essentials and ongoing operations:

**Before launch**: Register with ICO. Conduct and document a Legitimate Interest Assessment. Publish a privacy policy covering all Article 13/14 UK GDPR requirements (controller identity, purposes, lawful basis, retention periods, individual rights, ICO complaint right). Publish a cookie policy with a consent mechanism offering equally prominent "Accept All" and "Reject All" buttons — analytics cookies still require consent until the Data Use and Access Act 2025 cookie exemptions come into force (expected Spring 2026). Draft terms of service. Create a data retention schedule.

**Ongoing**: Maintain a DSAR handling process (1-month response deadline). Have documented workflows for erasure requests and right-to-object requests, with suppression lists to prevent re-adding removed contacts. Ensure Data Processing Agreements with Stripe, Supabase, Vercel, and any other processors. Maintain Records of Processing Activities.

The **Companies House API** is completely free, has no commercial use restrictions, and provides real-time company data via REST/JSON. Rate limits of 600 requests per 5 minutes are generous for verification workflows. Higher limits are available on request.

**VAT registration** triggers at **£90,000 taxable turnover** in any rolling 12-month period (confirmed through at least March 2026, though some speculation exists about a reduction to £60–70K from April 2026 — unconfirmed). At 500 subscribers paying approximately £50/month, CALLSHEET would hit £300K ARR — well above the threshold. Registration must happen within 30 days of exceeding the threshold. Directory subscription fees are standard-rated at **20% VAT**. Budget £15–40/month for MTD-compatible accounting software (Xero, FreeAgent, or QuickBooks) once VAT-registered.

---

## When to stop doing everything yourself

The evidence from dozens of bootstrapped founders converges on remarkably consistent scaling triggers. The typical progression follows a clear revenue-linked pattern:

**Pre-£2K MRR**: Entirely solo. Automate everything possible. No hires whatsoever. This is the validation phase where Tringas's 15-hour-per-week discipline is most valuable — Parkinson's Law guarantees that allocating 60 hours will consume 60 hours without proportionally better results.

**£2K–£5K MRR** (~40–100 subscribers at £50/month): First freelancer or contractor, typically for content marketing or a virtual assistant handling repetitive listing management tasks. Spend £500–1,000/month maximum. The Data Fetcher founder hired two freelance content marketers at this stage for under $1,000/month combined.

**£5K–£10K MRR** (~100–200 subscribers): Multiple part-time contractors. Still no full-time employees. This is where listing moderation and content creation should be fully delegated. Parqet's founder uses the rule: **"for each €8–10K in monthly revenue I can hire a person"** — starting with freelancers for flexibility.

**£10K–£20K MRR** (~200–400 subscribers): Serious consideration of the first full-time hire, almost always **customer support or listing moderation**. Jon Yongfook's first full-time hire at Bannerbear came at £22K MRR and was customer support. Build an admin dashboard that a non-technical person can use before hiring — as the Data Fetcher founder discovered, "at least half the issues were bugs or limitations" that required the founder anyway.

**£20K+ MRR** (500+ subscribers): Small team of 2–4 people. Content marketing and technical development delegated. Founder shifts from operator to strategist. At CALLSHEET's target of 500 subscribers at ~£50/month (£25K MRR / £300K ARR), the business is firmly in **"solo founder plus 2–3 contractors/part-timers"** territory.

The side-project-to-primary-focus transition typically happens at **£3K–£5K MRR with 12+ months of personal runway**, or at £10K MRR with high confidence — the point where the business covers living costs indefinitely. For a UK founder in London, that threshold is closer to £6K–8K MRR.

---

## Cross-references

| Document | Relationship |
|---|---|
| `trust-verification-findings.md` | £75–85K "mature ops" verification cost is the target state. This ops model bridges from "just me" to that — automating Companies House, reserving manual work for claims only, hiring at 20–30 thorough verifications/week. |
| `platform-architecture-decisions.md` | Supabase + Vercel + Resend stack provides 80% of ops infrastructure. Ops tooling chosen to integrate with this stack, not introduce orthogonal dependencies. Paddle handles VAT compliance. |
| `onboarding-flow-findings.md` | Claim flow (Path C) is the primary ops workflow. 24–48 hour claim turnaround target. Domain email matching as first verification step. |
| `data-quality-framework.md` | 30%/year B2B data decay rate drives quarterly Companies House re-checks. Freshness dimension scoring triggers re-verification workflows. |
| `freemium-conversion-findings.md` | 500 paying subscribers at £50/month average = £25K MRR target. Revenue-linked hiring triggers defined against this trajectory. |
| `strategic-positioning.md` | "Documented from day one" principle fulfilled — every ops process mapped to tooling with scaling triggers. Side-project operating model confirmed as viable. |

---

## Decisions confirmed

| Decision | Rationale |
|---|---|
| Hybrid batch-plus-on-demand verification | Companies House API batch for all 4,700 (40 min, free). Manual verification only for claimed listings. Solo-founder throughput of 4–6 light or 1–2 thorough verifications/hour. |
| 24–48 hour claim turnaround SLA | Next-business-day for general support. Same-day for billing issues. Matches B2B expectations without requiring always-on availability. |
| £0–31/month ops tooling stack | Free tiers of UptimeRobot, PostHog, Sentry, Clarity, Crisp, Linear. First paid tool is Vercel Pro at £16/month. Aligns with platform stack. |
| Email-first support, ticketing at 50+ tickets/month | Shared inbox → Freshdesk Free. Knowledge base deflects 30–40%. Hire support contractor at 150+ tickets/month sustained. |
| Revenue-linked hiring triggers | Pre-£2K: solo. £2–5K: first contractor. £5–10K: multiple contractors. £10–20K: first FTE. £20K+: small team. |
| UK-only jurisdiction for V1 | ICO, UK GDPR, Companies House, HMRC. Ireland deferred to V2. Northern Ireland in scope. |
| £52/year ICO registration pre-launch | Mandatory. Non-registration fine up to £5,645. |
| Paddle handles VAT compliance | Merchant of Record eliminates 15–20 hours/month of finance work. VAT registration threshold £90K but Paddle handles collection/remittance. |

## Scaling triggers

| Trigger | Threshold | Action |
|---|---|---|
| Claim requests exceed solo capacity | >20–30 thorough verifications/week | Hire part-time verification contractor |
| Support volume exceeds email management | >50 tickets/month | Move to Freshdesk Free with ticketing |
| Support volume exceeds solo capacity | >150 tickets/month sustained or CSAT <75% | Hire part-time support contractor |
| Revenue justifies first contractor | £2–5K MRR | Content marketing or VA for listing management |
| Revenue justifies first FTE | £10–20K MRR | Customer support / listing moderation |
| Side project → primary focus | £3–5K MRR + 12 months runway (London: £6–8K MRR) | Transition from side project |
| Data decay requires systematic refresh | 12 months post-launch | Annual data refresh cycle + quarterly Companies House re-checks |
| Search quality degrades | 10–20K active listings | Migrate from PostgreSQL FTS to Meilisearch |
