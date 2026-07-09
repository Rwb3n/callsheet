---
id: deployment
epoch: CS-E1
status: Superseded
depends: commercial-and-intelligence
chapters: []
superseded_by: CS-E2 (deployment arc)
---

# Arc: Deployment

## Mission

Deploy the platform to production. Provision cloud infrastructure (Supabase, Vercel), run 4rfv import against production DB, verify Paddle webhook integration end-to-end, and confirm the platform is live and searchable. This arc is principal-gated — all launch readiness workstreams (Companies House, banking, ICO, Paddle account) must complete before execution.

## Scope

- Supabase production project provisioning + schema push
- Vercel project creation + environment configuration + CI deploy job
- DNS configuration (callsheet.co.uk)
- 4rfv import pipeline execution against production
- Article 14 notice batch (requires ICO registration + compliance advisor sign-off)
- Paddle webhook verification (test mode → live mode cutover)
- Production smoke test against demo script

## Relationship to Launch Readiness

This arc consumes the outputs of `5-launch-readiness/LAUNCH-READINESS-TRACKER.md` workstreams 1–9. It does not own those workstreams — they are principal actions. This arc owns the build tasks that wire those outputs into a running production system.

## Exit Criteria

**Superseded.** These exit criteria are carried forward to `CS-E2 > deployment` arc with expanded scope (agent CLI operability, API key auth, presentation polish).

- [ ] ~~Platform accessible at production URL~~
- [ ] ~~4,700 4rfv listings searchable~~
- [ ] ~~Paddle checkout completes in live mode~~
- [ ] ~~Article 14 notices dispatched~~
- [ ] ~~Admin dashboard shows real operational data~~
- [ ] ~~CI deploys to production on main push~~
