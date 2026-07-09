---
id: CS-WORK-120
title: SEO infrastructure
chapter: CH-CS-023
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Dynamic sitemap.xml from active listings + static pages"
    test_type: manual
  - id: AC-2
    description: "robots.txt disallows /api/, /dashboard/, /admin/, /login, /signup"
    test_type: manual
  - id: AC-3
    description: "Root layout metadata with title template, description, OG tags, metadataBase"
    test_type: manual
  - id: AC-4
    description: "Per-page metadata on public pages (homepage, search, pricing, providers already done)"
    test_type: manual
  - id: AC-5
    description: "JSON-LD on provider profile pages (pre-satisfied from CS-E1)"
    test_type: manual
  - id: AC-6
    description: "Canonical URLs via metadataBase"
    test_type: manual
---

# CS-WORK-120: SEO infrastructure

## Deliverables

- [x] `src/app/sitemap.ts` — dynamic sitemap from active listings
- [x] `src/app/robots.ts` — robots.txt with disallow rules
- [x] `src/app/layout.tsx` — enhanced root metadata (title template, OG, metadataBase)
