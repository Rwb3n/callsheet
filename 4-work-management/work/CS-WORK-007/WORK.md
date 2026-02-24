---
template: work_item
id: CS-WORK-007
title: "Data model schema and seed"
type: feature
status: done
owner: null
created: 2026-02-20
spawned_by: null
spawned_children: []
chapter: CH-CS-002
arc: infrastructure
epoch: CS-E1
closed: 2026-02-23
priority: critical
effort: large
traces_to:
  - REQ-CS-DATA-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/data-and-listings.md
acceptance_criteria:
  - "AC-01: Listing created with all required fields; claimStatus defaults to unclaimed, subscriptionTier to free"
  - "AC-02: Listing with accountId = null (unclaimed) persists and queries correctly"
  - "AC-03: Verification table created with listing; defaults to tier = unclaimed, verificationScore = 0"
  - "AC-04: Quality score table created with listing; all dimensions default to 0, composite = 0"
  - "AC-05: Engagement counters table created with listing; all counters default to 0"
  - "AC-06: Account profile created on signup; email preferences default to all-true"
  - "AC-07: Taxonomy hierarchy seed: 7 sectors, ~51 service areas, ~209 specialisations"
  - "AC-08: Taxonomy seed is idempotent (ON CONFLICT DO NOTHING)"
  - "AC-09: listings.companiesHouseNumber index supports < 10ms lookup"
  - "AC-10: Cascade delete: listing deletion cascades to verification, quality score, engagement, taxonomy tags, credits, media, social profiles, accreditations, pending enquiries, pre-claim snapshot"
blocked_by: []
blocks: [CS-WORK-008, CS-WORK-009, CS-WORK-010, CS-WORK-011, CS-WORK-012]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-20T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S1
  spec_sections: "D&L §1-§4, SI §4"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-007: Data model schema and seed

## Context

Complete Drizzle schema for D&L entities: listings, verifications, quality scores, engagements, taxonomy (3-level), credits, media, social profiles, accreditations, pending enquiries, pre-claim snapshots, additional locations, zero-result queries, controlled vocabulary, account profiles, shortlists, saved searches, enquiry records. 15 pgEnum declarations. Custom `tsvector` type factory. Taxonomy seed data (7 sectors, ~51 service areas, ~209 specialisations). All one-to-one tables zero-initialised at listing creation per two-phase pattern (S1 §10). This is the critical path — every other S1 work item depends on the schema existing.

## Deliverables

- [ ] `src/db/schema/data-and-listings.ts` — All D&L tables, enums, indexes
- [ ] `src/db/schema/accounts.ts` — Account profiles, shortlists, saved searches, enquiry records
- [ ] `src/db/types.ts` — Custom `tsvector` Drizzle type factory
- [ ] `src/db/seed/taxonomy-data.json` — Canonical taxonomy hierarchy
- [ ] `src/db/seed/taxonomy.ts` — Seed script with ON CONFLICT DO NOTHING
- [ ] Drizzle migration generated and applied
- [ ] Tests for all 10 AC (integration tests against local Supabase)

## References

- `3-requirements/slices/slice-01-data-model.md` §1 Schema, §2 Account Extensions, §8 Taxonomy Seed, §9 Controlled Vocabularies
- `3-requirements/interfaces/data-and-listings.md` §1-§4
