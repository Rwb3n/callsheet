# Chapter Template

## Skeleton (created before work items exist)

```markdown
---
id: CH-CS-{NNN}
title: {Chapter Title}
arc: {arc-id}
epoch: CS-E1
status: Planned
depends: {CH-CS-NNN or null}
work_items: []
---

# Chapter: {Title}

Source: `3-requirements/slices/{slice-path}` (v2, {N} AC). Work items created when arc activates.
```

## Full (after work item decomposition)

```markdown
---
id: CH-CS-{NNN}
title: {Chapter Title}
arc: {arc-id}
epoch: CS-E1
status: Planned
depends: {CH-CS-NNN or [CH-CS-NNN, CH-CS-NNN] or null}
work_items: [CS-WORK-{NNN}, CS-WORK-{NNN}, ...]
---

# Chapter: {Title}

## Problem

{2-3 sentences. What user or system need does this chapter address? Reference the slice.}

## Requirements

Source: `3-requirements/slices/{slice-path}` (v2, {N} AC)

### R1: {Feature Group 1}
{One paragraph. Which AC this covers. Key constraints.}

### R2: {Feature Group 2}
{One paragraph. Which AC this covers. Key constraints.}

## Success Criteria

- [ ] All {N} AC pass ({test types})
- [ ] {Domain-specific criterion}
- [ ] {Integration criterion}
```

## Chapter-to-Slice Mapping

| Chapter | Slice | Domain |
|---------|-------|--------|
| CH-CS-001 | S0 | Infrastructure (event bus, scheduler, flows, auth, email, storage, CI) |
| CH-CS-002 | S1 | Data Model (45 tables, pgEnums, seed schema) |
| CH-CS-003 | S1 | Seed Pipeline (4rfv import, ~4700 listings) |
| CH-CS-004 | S2 | Onboarding (signup, profile, provider opt-in) |
| CH-CS-005 | S3 | Claim & Verify (listing claim, Companies House, 4-tier verification) |
| CH-CS-006 | S4 | Subscriptions (Paddle integration, tier management, billing) |
| CH-CS-007 | S5 | Provider Experience (dashboard, listing editor, media, analytics) |
| CH-CS-008 | S6 | Buyer Experience (search, profiles, shortlists, enquiries) |
| CH-CS-009 | S7 | Operations (admin dashboard, support triage, compliance, billing recon) |
| CH-CS-010 | S8 | Commercial (pricing, conversion, churn, revenue intelligence) |
| CH-CS-011 | S9 | Entity Intelligence (quality scoring, engagement, decay, autonomy signals) |
| CH-CS-012 | S10 | Hardening (erasure, closure, graduation, cross-domain wiring) |

## Notes

- S1 produces two chapters (CH-CS-002 for the Drizzle schema, CH-CS-003 for seed data import) because they are independently implementable with different dependency shapes.
- Chapters CH-CS-004 through CH-CS-006 (S2/S3/S4) can be worked in parallel after infrastructure completes — they share no data dependencies.
- Chapter `depends:` can be a single ID or an array. An array means ALL listed chapters must complete (AND, not OR).
