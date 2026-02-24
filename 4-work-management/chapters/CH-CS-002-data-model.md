---
id: CH-CS-002
title: Data Model
arc: infrastructure
epoch: CS-E1
status: Complete
depends: CH-CS-001
work_items: [CS-WORK-007, CS-WORK-008, CS-WORK-009, CS-WORK-010, CS-WORK-011, CS-WORK-012]
---

# Chapter: Data Model

## Problem

CALLSHEET needs its complete data model and CRUD surface. Source: S1 (42 AC). Schema for listings, accounts, taxonomy, quality scores, engagement, enquiries, media, verification, and supporting entities. Full-text search via tsvector + pg_trgm. tRPC routes for listing CRUD, profile management, taxonomy queries, image upload. Listing integrity rules. Event consumer registrations.

## Requirements

Source: `3-requirements/slices/slice-01-data-model.md` (v2, 42 AC)
Schema: `3-requirements/references/cumulative-schema.md`

## Work Items

| ID | Title | AC | Priority | Depends On |
|----|-------|----|----------|------------|
| CS-WORK-007 | Data model schema and seed | 10 | critical | — |
| CS-WORK-008 | Full-text search infrastructure | 5 | high | 007 |
| CS-WORK-009 | Listing and profile CRUD routes | 9 | high | 007, 011 |
| CS-WORK-010 | Image upload pipeline | 4 | medium | 007 |
| CS-WORK-011 | Listing integrity rules + taxonomy overlap | 6 | high | 007 |
| CS-WORK-012 | Event consumers and query interfaces | 8 | high | 007 |

## Success Criteria

- [ ] All 42 S1 acceptance criteria pass
- [ ] All tables created with correct types, nullability, defaults, indexes
- [ ] All pgEnums declared as standalone Drizzle constants
- [ ] Taxonomy seeded (7 sectors, ~51 service areas, ~209 specialisations)
- [ ] Full-text search returns ranked results
- [ ] Event consumers registered in EVENT_CONSUMER_MATRIX
