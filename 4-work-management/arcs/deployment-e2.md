---
id: deployment-e2
epoch: CS-E2
status: Superseded
depends: [api-completion, presentation-e2]
chapters: [CH-CS-026, CH-CS-027]
superseded_by: venture-p1 (phase-gate-model.md adoption, 2026-07-10)
---

# Arc: Deployment (CS-E2)

**Superseded 2026-07-10.** The full-platform deployment thesis this arc encoded (deploy everything, import ~4,700 scraped 4RFV listings, Paddle live at launch) is replaced by the signal-gated phase model (`0-strategic-frame/phase-gate-model.md`). Replacement arc: `venture-p1`.

Disposition of scope:

- **CH-CS-026 (Gate Infrastructure)** — superseded. Browser E2E + journey tests move behind the P2 gate (authenticated UI is inert at P1). `callsheet smoke` / `data validate` (CH-CS-019) carry forward into venture-p1 as-is.
- **CH-CS-027 (Production Deployment)** — superseded. 4RFV record import is **prohibited** (Seed Source Register: counts-only; database quarantined 2026-07-10). Seeding is Companies House-primary at 500 curated records. Paddle live is P4 scope. Infrastructure provisioning carries into CH-CS-030.
- Work item IDs CS-WORK-123–128 are retired unused; venture-p1 items start at CS-WORK-129.

Original mission and exit criteria retained below for the record.

## Mission (superseded)

Deploy CALLSHEET to production. Provision infrastructure, run data import, verify all 4 deployment quality gates, and promote to the production URL.

## Exit Criteria (superseded)

- [ ] ~~All 4 deployment quality gates pass against production~~
- [ ] ~~Platform accessible at production URL (callsheet.co.uk)~~
- [ ] ~~4,700 listings searchable with computed quality scores~~
- [ ] ~~Paddle checkout completes in live mode~~
- [ ] ~~CI deploys to production on main push (gated by all 4 gates)~~
- [ ] ~~Agent can run `callsheet smoke --env production` and all checks pass~~
