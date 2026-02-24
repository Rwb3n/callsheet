---
template: work_item
id: CS-WORK-010
title: "Image upload pipeline"
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
priority: medium
effort: small
traces_to:
  - REQ-CS-DATA-004
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-01-data-model.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-23: Image upload: verifies ownership, checks tier limit, uploads to R2, returns public URL"
  - "AC-24: Image upload: rejects >10MB, rejects non-JPEG/PNG/WebP"
  - "AC-25: Image delete: removes from R2 and mediaItems table"
  - "AC-26: Logo/headshot upload updates listing field (logoUrl / headshotUrl)"
blocked_by: [CS-WORK-007]
blocks: []
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
  spec_sections: "SI §6, D&L §1.9"
version: "2.0"
generated: 2026-02-20
last_updated: 2026-02-20T00:00:00
---

# CS-WORK-010: Image upload pipeline

## Context

Listing-specific image upload/delete via S0's `ObjectStorageService`. Upload verifies listing ownership, checks tier media limit (`TIER_LIMITS[tier].maxMedia` imported from CR via P4), uploads to R2 with key pattern `listings/{listingId}/images/{imageId}.{ext}`, creates `mediaItems` row, and updates listing `logoUrl`/`headshotUrl` for logo/headshot types. Delete removes from R2 and `mediaItems` table. Reorder updates `sortOrder`. S0 already enforces 10MB limit and content type validation.

## Deliverables

- [ ] `src/server/routers/media.ts` — uploadImage, deleteImage, reorderImages
- [ ] Tests for all 4 AC

## References

- `3-requirements/slices/slice-01-data-model.md` §5 Image Upload Pipeline
- `3-requirements/interfaces/shared-infrastructure.md` §6 (R2)
- `3-requirements/interfaces/commercial-and-revenue.md` §4.1 (TIER_LIMITS.maxMedia)
