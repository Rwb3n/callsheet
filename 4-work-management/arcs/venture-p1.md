---
id: venture-p1
epoch: CS-E2
status: Active
depends: [api-completion, presentation-e2, agent-cli]
chapters: [CH-CS-028, CH-CS-029, CH-CS-030, CH-CS-031]
governed_by: 0-strategic-frame/phase-gate-model.md
---

# Arc: Venture P1 — Inert Directory

## Mission

Launch P1 of the signal-gated venture model: a public, read-only, SEO-indexed directory of 500 CH-verified UK post-production facilities at the production domain, with S8/S9 code paths **verifiably** inert, full gate instrumentation live (GSC + non-S9 DB counters), and a lawful publishing posture (Article 14 notices actually sent; correction/removal route live). Prepare P2 (claim loop) during the P1 window per Amendment 1, enabled only by a Gate Record entry.

## Definition of done (P1 live)

- 500 CH-verified post-production listings published (150 minimum at launch)
- Inertness verification test passes against production env: zero commercial/intelligence consumer registrations, zero writes to intelligence tables or `deferred_actions` on public reads
- Article 14 notices sent on publish via a direct send path (not the ghost scheduler)
- Public correction/removal route live (accountless takedown obligation)
- Sitemap submitted to GSC; weekly gate-read ritual operating with dated Gate Record entries
- Run cost ≈ £37/month (Vercel Pro + Supabase Pro)

## Chapters

| Chapter | Scope | Depends |
|---------|-------|---------|
| CH-CS-028 Inertness & Takedown | Consumer env gates, fail-closed Resend webhook, P1 UI mode, inertness verification, Article 14 direct send, correction/removal route | — |
| CH-CS-029 CH Seed Pipeline | `extract-ch.ts` extractor, non-S9 gate-read counters, production seed run + validation | CH-CS-028 (Art. 14 path) |
| CH-CS-030 P1 Deploy | Production env per default-off list, DNS/TLS, GSC submission, gate-read ritual | CH-CS-028, CH-CS-029, principal P0 items |
| CH-CS-031 P2 Prep (build-ahead) | Real CH client, Resend live wiring, claim invite template + tranche tooling, P1-UI-mode reversal switch. **Enablement gated** by Gate Record entry per Amendment 1 | CH-CS-028 |

## Principal-gated prerequisites (P0)

Tracked in `open-actions.md`: domain ownership verification (callsheet.co.uk resolves to a parked host — scope-changing if squatted), GSC property, live Companies House API key, Supabase production + Vercel projects (+ CI secrets, env vars), Google Ads Basic re-application (demand re-score flip condition), seed enrichment acceleration decision (492-record cut sits at 33/492 in the lab's autonomous drip).

## Explicitly out of scope

Real Paddle client (P4), scheduler/poller productionisation (P5), any S9 consumer activation (P5), enquiry submission (P3), browser E2E + journey tests (P2 — no authenticated UI is reachable at P1).

## Exit Criteria

- [ ] P1 definition of done met (above)
- [ ] P1 gate metrics being read weekly with dated Gate Record entries
- [ ] P2 tranche-1 invitations ready to send at week 4–6 (Amendment 1), pending Gate Record authorisation
