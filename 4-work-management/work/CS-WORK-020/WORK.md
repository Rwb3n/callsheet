---
template: work_item
id: CS-WORK-020
title: "Image processing pipeline"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-004
arc: onboarding-and-claims
epoch: CS-E1
closed: 2026-02-23
priority: medium
effort: medium
traces_to:
  - REQ-CS-ONBOARD-008
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-39: Image upload generates 3 WebP variants (150px, 400px, 1200px)"
  - "AC-40: Variant URLs follow deterministic naming convention"
  - "AC-41: Original image preserved in R2 for admin access"
  - "AC-50: Variant generation failure: media_items.url falls back to original URL; error logged [S2-ST-18]"
blocked_by: []
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: 2026-02-23T00:00:00
  - node: done
    entered: 2026-02-23T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "PP §4.3 [PP-23], SI §6, S2 §4.3"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-23T00:00:00
---

# CS-WORK-020: Image processing pipeline

## Context

Wraps S1's `media.uploadImage` with post-upload variant generation. Uses `sharp` to produce 3 WebP variants (thumbnail 150px, card 400px, full 1200px) from the original image. Variants uploaded to R2 with `Cache-Control: public, max-age=31536000, immutable` and deterministic naming (`listings/{listingId}/images/{imageId}_{variant}.webp`). The `media_items.url` field stores the card URL as default display. On variant generation failure (corrupt image, processing error), the original is preserved and `media_items.url` falls back to the original URL with structured error logging (S2-ST-18). Deployment constraint: `sharp` native module may hit Vercel's 50MB function limit -- fallback is `waitUntil()` background processing or Cloudflare Image Transformations (S2-ST-7). AC-40 is unit-testable (URL convention); AC-39, AC-41, AC-50 are integration tests.

## Deliverables

- [x] `src/lib/image-processing/variants.ts` -- `processListingImage()` with 3-variant generation
- [x] `src/lib/image-processing/naming.ts` -- Deterministic URL convention functions + types
- [x] `src/lib/image-processing/__tests__/naming.test.ts` -- Unit tests for AC-40 (14 tests)
- [x] `src/lib/image-processing/__tests__/variants.integration.test.ts` -- Integration tests for AC-39, AC-41, AC-50 (5 tests)
- [x] `src/server/routers/media.ts` -- Amended: processImage injection, variant-aware upload
- [x] `src/server/routers/__tests__/media.integration.test.ts` -- Amended: 6 variant tests (AC-39, AC-41, AC-50)
- [x] `src/lib/storage/types.ts` -- Added `download()` to ObjectStorageService
- [x] `src/lib/storage/r2.ts` -- Added `download()` to InMemoryObjectStorageService

## References

- `3-requirements/slices/slice-02-onboarding.md` S4.3 Image Processing Pipeline
- `3-requirements/interfaces/platform-and-product.md` S4.3 [PP-23]
- `3-requirements/interfaces/shared-infrastructure.md` S6 (R2 object storage)
