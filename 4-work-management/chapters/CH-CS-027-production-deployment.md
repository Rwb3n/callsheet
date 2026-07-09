---
id: CH-CS-027
title: Production Deployment
arc: deployment-e2
epoch: CS-E2
status: Superseded
superseded_by: CH-CS-029/CH-CS-030 (venture-p1 arc — CH-primary seed replaces 4RFV import; see phase-gate-model.md)
depends: [CH-CS-026]
work_items: [CS-WORK-126, CS-WORK-127, CS-WORK-128]
---

# Chapter: Production Deployment

## Scope

3 work items for production go-live: infrastructure provisioning (Vercel project, Supabase production, Cloudflare R2, Paddle, Resend, DNS), data import and validation (production seed from real listings data, integrity checks), and go-live verification (smoke tests, monitoring, rollback plan execution).

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-126 | Infrastructure provisioning | 5 | — (principal-gated prereqs) | todo |
| CS-WORK-127 | Data import and validation | 5 | 126 | todo |
| CS-WORK-128 | Go-live verification | 4 | 126, 127, 124, 125 | todo |

**Total: 14 AC across 3 work items.**

## Dependency Graph

```
CS-WORK-126 (Infrastructure Provisioning, 5 AC)
  ├──▶ CS-WORK-127 (Data Import/Validation, 5 AC)
  │     └──▶ CS-WORK-128 (Go-Live Verification, 4 AC)
  └────────▶ CS-WORK-128 (also blocked by 126)

CS-WORK-124 (User Journey Tests — from CH-CS-026) ──▶ CS-WORK-128
CS-WORK-125 (CI/CD Enhancement — from CH-CS-026) ───▶ CS-WORK-128
```

**Independent entry points:** 126 (1 parallelisable; principal-gated).
**Longest chain:** 126 → 127 → 128 (3 items, 14 AC).
