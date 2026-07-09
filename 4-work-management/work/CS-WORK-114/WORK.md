---
id: CS-WORK-114
title: Homepage
chapter: CH-CS-020
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
source_files:
  - 4-work-management/arcs/presentation-e2.md
extensions:
  io_profile: pure
  spec_sections: ["presentation-e2 arc §CH-CS-020"]
acceptance_criteria:
  - id: AC-1
    description: "Hero section with headline, description, and CTA buttons (Search providers, List your services)"
    test_type: manual
  - id: AC-2
    description: "Value proposition section: quality ranked, verified providers, built for broadcast"
    test_type: manual
  - id: AC-3
    description: "How it works section: search, compare, connect — 3-step flow"
    test_type: manual
  - id: AC-4
    description: "Pricing preview with link to /pricing page, £199/year headline"
    test_type: manual
---

# CS-WORK-114: Homepage

## Deliverables

- [x] `src/app/page.tsx` — full homepage replacing placeholder (hero, value props, how it works, pricing preview, CTA)
