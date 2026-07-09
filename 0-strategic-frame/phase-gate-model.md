# Phase Gate Model — Signal-Gated Deployment

**Status:** ACTIVE — governs all deployment and feature-enablement decisions
**Domain:** Cross-Domain
**Last updated:** 2026-07-10
**Inputs:** External venture spike 2026-07-09 (SOVEREIGN_PROJECT, deliverables 1–6), `deployment-gates.md`, `entity-architecture-frame.md`
**Downstream:** `4-work-management/` arc `venture-p1`, epoch CS-E2 (re-scoped exit criteria)

---

## Authority

This table is the sole authority for enabling any subsystem, slice, or capability in production. Nothing turns on except by a gate on this page being met and **recorded in the Gate Record**. Sunk cost — including S9's 101 built ACs — is not an argument this document recognises.

Every gate: numeric threshold + named measurement source + review cadence + explicit kill condition. A missed gate has two legal responses: kill, or declare the test invalid with enumerated untested conditions and re-test. "Nearly passed" does not exist.

This model supersedes the CS-E2 full-platform deployment sequence (CH-CS-026/027) as the deployment thesis. It does not alter the entity-architecture design frame — S9 is deferred behind the P5 gate, not deleted. `deployment-gates.md` (the 4-gate quality framework) still applies to every individual deploy *within* a phase; this document decides *what scope may deploy at all*.

## Phase gates

| Phase | Entry state | PROCEED gate (all must hold) | KILL / iterate condition | Measurement source | Review cadence |
|-------|-------------|------------------------------|--------------------------|--------------------|----------------|
| **P1 Inert Directory** | 150+ CH-verified post-production listings live, S8/S9 verifiably inert (per CH-CS-028 verification test), sitemap submitted, gate instrumentation live | ① 500 listings live · ② ≥90% of listing pages indexed · ③ organic impressions ≥1,000/wk for 4 consecutive weeks · ④ organic clicks ≥50/wk in same window | <100 impressions/wk at 12 weeks post-indexation → SEO thesis dead for this wedge: re-wedge (camera dept, pre-registered hedge) or kill. **This gate governs SEO/content investment only — it does not gate P2 entry (Amendment 1)** | GSC API (impressions, clicks, coverage); DB listing count | Weekly 30-min mechanical read; gate review at week 12 |
| **P2 Claim Loop** | Auth + onboarding + claim/verify enabled (S2/S3), real CH client built, Resend live, claim invitations tranched | ① claim rate ≥8% of invited listings within 60 days of first tranche · ② median time-to-claim ≤14 days · ③ ≥50% of claimants add/correct ≥1 field. **Read valid only if the deliverability condition holds (Amendment 2)** | claim rate <3% after one iteration of invite/landing flow AND a valid deliverability read → **the venture-predictive metric failed: providers don't care about being listed. Primary kill signal for the whole venture** | DB: claims table, claim timestamps, profile-edit events; correspondence log (deliverability) | Fortnightly; gate review at day 60 |
| **P3 Demand Proof** | Buyer search UX + enquiry submission enabled (S6 write paths), enquiry notifications live | ① internal searches ≥200/wk · ② enquiries ≥10/wk sustained 4 consecutive weeks · ③ provider response rate ≥40% within 7 days · ④ ≥3 buyer repeat-users/wk | <2 enquiries/wk after 8 weeks despite ≥1,000 sessions/wk → demand doesn't route through a directory here → pivot wedge per pre-registered flip condition, or kill | DB: `search_performed`, enquiry records, response timestamps; analytics sessions | Fortnightly; gate review at week 8 |
| **P4 Revenue** | Real Paddle client BUILT (new work), tiers £199/£399/£699, upgrade surfaces on | ① free→paid ≥2% of claimed accounts within 90 days of price exposure · ② ≥10 paying accounts · ③ zero involuntary churn from billing failures in first quarter · ④ first renewal cohort ≥60% (12mo lag — tracked, not gating) | conversion <0.5% at 90 days after one pricing/packaging iteration → willingness-to-pay absent → revert to P3 state, re-price or kill | Paddle dashboard + webhook-fed DB events; renewal cohort ledger | Monthly; gate review at day 90 |
| **P5 Autonomy** | S9 in shadow mode (predictions logged, actions NOT executed), scheduler productionised (cron/poller — new build; ghost today) | Per S10 graduation ACs (AC-58–72): ① ≥12 logged decisions over 6 months · ② FP rate ≤1.5% · ③ ROI ≥0.7 · ④ ceremony precedent ≥50 non-financial · ⑤ shadow intervention→outcome delta positive vs holdout over ≥3 months | Shadow delta ≤0 or FP >1.5% at 6 months → S9 stays off; entity thesis remains deferred (not deleted — env gates preserve it) | `graduation_evaluation` decision logs, `algorithm_comparison`, shadow-vs-holdout ledger | Monthly; graduation review per S10 AC-58 window |

## Amendments (pre-registered 2026-07-10, before any measurement window opened)

**Amendment 1 — P1/P2 decoupling.** Claim rate (P2) and organic discoverability (P1) are independent signal axes; strict sequencing would delay the venture's primary kill signal by ~3 months of domain-trust noise. Claim invitations begin at **week 4–6 after directory launch**, in tranches (first tranche ≤100 invitations), without waiting for P1 gate ③/④. P2 *enablement* (auth, claim routes, Resend live) still requires a dated Gate Record entry authorising tranche 1. The P1 gate continues to govern SEO/content investment and the re-wedge decision.

**Amendment 2 — P2 deliverability validity condition.** A claim-rate read is valid only if, for the tranche measured: bounce rate <10% AND ≥85% of invitations reached `delivered` status in the correspondence log. An invalid read means "re-run the invite with fixed deliverability" — it can never mean "providers don't care." This prevents killing the venture on a spam-folder artifact. Measurement: `correspondence_log` status lifecycle (built, CH-CS-013).

## Cross-cutting rules

1. **One gate at a time.** No phase's build work is *enabled* until the prior gate is RECORDED. (Build-ahead is permitted — P2 prep during the P1 window per Amendment 1 — enablement is not.)
2. **Vanity-metric guard:** impressions gate P1 only. From P2 onward the primary metric is always a counterparty action (claim, enquiry, payment, response) — never traffic.
3. **Threshold changes require a written amendment** to this file before the measurement window opens — never during or after. Post-hoc reinterpretation is prohibited.
4. **S9 sunk-cost containment:** any proposal to enable an S9 capability early must cite the P5 row and identify which threshold is already met. There is no other path.
5. **Instrumentation is a P1 deliverable:** GSC property + sitemap + non-S9 event counters ship WITH the inert directory, or the P1 gate cannot be read (CH-CS-029).

## Wedge

**Post-production facilities, UK** (SIC 59120: picture post, sound post, VFX, dailies/DIT, mastering/QC; excludes freelance individuals at P1 — corporate-only shrinks the GDPR surface). Pre-registered pivot hedge: **camera department** (crew + kit hire). Flip conditions: P3 demand gate miss → pivot; Keyword Planner unblocks showing post-production buyer-intent <20% of camera-dept volume → re-score before P1 content build completes. [Source: venture spike deliverable 2 — Wedge Decision Record]

## Gate Record

Dated entries only. Append; never edit prior rows.

| Date | Gate / decision | Result | Evidence | Decision |
|------|-----------------|--------|----------|----------|
| 2026-07-10 | Model adopted | — | Venture spike 2026-07-09 + principal decision | Phase model + Amendments 1–2 adopted as deployment authority. CH-CS-026/027 superseded. |
