---
id: CH-CS-030
title: P1 Deploy
arc: venture-p1
epoch: CS-E2
status: Planned
depends: [CH-CS-028, CH-CS-029]
work_items: [CS-WORK-137, CS-WORK-138]
---

# Chapter: P1 Deploy

## Scope

Put the inert directory live and make the P1 gate readable. Two work items: production environment + deploy configuration per the default-off list, and DNS/GSC cutover with the weekly gate-read ritual. Sitemap, robots, homepage, error boundaries, and middleware already exist (CH-CS-020/023/025) — this chapter is configuration and process, not page building. Principal-gated: P0.1 (domain), P0.2 (GSC), P0.5 (Supabase/Vercel projects + secrets).

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-137 | Production env + deploy configuration | 4 | CH-CS-028, principal P0.5 | todo |
| CS-WORK-138 | DNS/GSC cutover + gate-read ritual | 4 | 137, CS-WORK-136, principal P0.1/P0.2 | todo |

**Total: 8 AC across 2 work items.**

## Acceptance Criteria

### CS-WORK-137 — Production env + deploy configuration

- AC-01: `.env.production` documented per the P1 default-off list: `PADDLE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `E2E_TEST_MODE`, `ENABLE_INTELLIGENCE_CONSUMERS`, `ENABLE_COMMERCIAL_CONSUMERS` all UNSET; `NEXT_PUBLIC_P1_MODE=true`; `RESEND_API_KEY` set (Article 14 sends only)
- AC-02: Production DB migrated (`drizzle-kit migrate` + `db:custom-sql` + taxonomy `db:seed`); demo seed verifiably absent
- AC-03: CI deploys main to Vercel with type-check + unit + integration green (existing pipeline + deploy job); no gate-sequenced browser jobs (P2 scope)
- AC-04: Inertness verification (CS-WORK-129 AC-04/05/06 method) executed against the production deployment and recorded in the Gate Record

### CS-WORK-138 — DNS/GSC cutover + gate-read ritual

- AC-01: Production domain live with TLS, www canonicalisation, apex redirect
- AC-02: Sitemap submitted in GSC; robots.txt verified serving; indexation coverage report readable
- AC-03: Weekly gate-read ritual documented (30-min: GSC impressions/clicks/coverage + `admin.gates.p1Read` DB read) with a dated row appended to `phase-gate-model.md` Gate Record per read
- AC-04: First gate-read row recorded (week 0 baseline)

## Dependency Graph

```
CS-WORK-137 (Env + Deploy, 4 AC)
  └──▶ CS-WORK-138 (DNS/GSC + Ritual, 4 AC)  [also blocked by CS-WORK-136 seed + P0.1/P0.2]
```
