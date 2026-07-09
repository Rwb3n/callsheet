---
id: CH-CS-029
title: CH Seed Pipeline
arc: venture-p1
epoch: CS-E2
status: Planned
depends: [CH-CS-028]
work_items: [CS-WORK-134, CS-WORK-135, CS-WORK-136]
---

# Chapter: CH Seed Pipeline

## Scope

Companies House-primary seeding for the post-production wedge, replacing the prohibited 4RFV record import. Three work items: a CH-CSV extractor feeding the existing source-agnostic import pipeline, non-S9 gate-read counters (P1 instrumentation), and the production seed run with validation. Input data: the lab's enriched candidate CSV (492-record cut; schema per `seed/enriched-partial-2026-07-09.csv` — company_number, name, website, role_emails, phones, service_keywords, site_match_score, disposition). Sources: venture spike deliverable 5 (Seed Source Register), P1-B backlog. B.1 (4RFV quarantine) completed 2026-07-10 — pre-satisfied.

## Work Items

| ID | Title | AC | Blocked By | Status |
|----|-------|----|------------|--------|
| CS-WORK-134 | extract-ch.ts — enriched CSV → ImportRecord[] | 6 | — | todo |
| CS-WORK-135 | Non-S9 gate-read counters | 4 | — | todo |
| CS-WORK-136 | Production seed run + validation | 4 | 134, CH-CS-028 (132), principal P0.3 | todo |

**Total: 14 AC across 3 work items.**

## Acceptance Criteria

### CS-WORK-134 — extract-ch.ts

- AC-01: `extract-ch.ts` parses the enriched candidate CSV into `ImportRecord[]` consumable by `runImportPipeline()` unchanged (phases 1–5 untouched)
- AC-02: Records with disposition ≠ `found` or `site_match_score < 7` are excluded and reported (curation floor)
- AC-03: Taxonomy mapping: `service_keywords` → Sector/ServiceArea/Specialisation tags via an explicit keyword map; unmapped keywords reported, never guessed
- AC-04: Brand-group dedupe: records sharing a website domain collapse to one listing (legal name from CH, trading name from site) — per Seed Source Register groups rule
- AC-05: `source` column value is `companies_house` (new enum value; `4rfv` retained for schema compatibility, no new rows)
- AC-06: Integration test: fixture CSV → pipeline → listings with verification tier `unclaimed`, CH number populated, zero `listing_created` events, zero `listing_live` emails (AC-47/AC-26 invariants carried from CS-WORK-021)

### CS-WORK-135 — Non-S9 gate-read counters

- AC-01: `page_view` and `search_performed` counters increment via a direct lightweight write path (single-row upsert per listing/term per day) that does NOT route through S9 consumers
- AC-02: Counters function with `ENABLE_INTELLIGENCE_CONSUMERS` unset — integration test under P1 env
- AC-03: `admin.health` or a new `admin.gates.p1Read` route returns: listing count, 7-day page views, 7-day search count — the DB half of the weekly gate read
- AC-04: `callsheet data validate` gains a P1 check: counters table writable and readable

### CS-WORK-136 — Production seed run + validation

- AC-01: Seed run executed against production: ≥150 listings at launch cut, path to 500 documented (remaining enrichment yield)
- AC-02: Phase-2 live CH verification passes for every published record (dissolved/overdue-resolved dispositions reported, not published)
- AC-03: Article 14 notices sent (via CS-WORK-132 path) for every published record with a contact email; on-page notice set for the rest — counts reconciled in a compliance decision log entry
- AC-04: `callsheet data validate` passes against production post-seed (row counts, FK integrity, search returns results, quality scores computed)

## Dependency Graph

```
CS-WORK-134 (Extractor, 6 AC) ──┐
CS-WORK-135 (Counters, 4 AC)    ├──▶ CS-WORK-136 (Seed Run, 4 AC)
CH-CS-028/CS-WORK-132 (Art.14) ─┘         (also principal-gated: CH API key, prod DB)
```
