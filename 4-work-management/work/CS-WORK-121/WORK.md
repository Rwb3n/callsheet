---
id: CS-WORK-121
title: Image optimization and Next.js config
chapter: CH-CS-024
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "next.config.ts remotePatterns for R2 cloudflare and cdn.callsheet.co.uk"
    test_type: manual
  - id: AC-2
    description: "Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy"
    test_type: manual
  - id: AC-3
    description: "No <img> tags in codebase (pre-satisfied — none exist)"
    test_type: manual
  - id: AC-4
    description: "next/image configured for WebP/AVIF format negotiation via remotePatterns"
    test_type: manual
  - id: AC-5
    description: "Output configuration for production deployment"
    test_type: manual
---

# CS-WORK-121: Image optimization and Next.js config

## Deliverables

- [x] `next.config.ts` — remotePatterns for R2, security headers, image optimization config
