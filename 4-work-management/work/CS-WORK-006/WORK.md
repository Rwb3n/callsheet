---
template: work_item
id: CS-WORK-006
title: "Object storage, rendering, notifications, service abstraction, tRPC, CI/CD"
type: feature
status: done
owner: null
created: 2026-02-16
spawned_by: null
spawned_children: []
chapter: CH-CS-001
arc: infrastructure
epoch: CS-E1
closed: 2026-02-23
priority: high
effort: medium
traces_to:
  - REQ-CS-INFRA-006
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-30: Public upload returns URL; private returns null"
  - "AC-31: getSignedUrl returns time-limited URL"
  - "AC-32: deleteByPrefix removes all matching objects"
  - "AC-33: >10MB upload rejected"
  - "AC-34: Disallowed content type rejected"
  - "AC-35: Homepage renders via SSG"
  - "AC-36: revalidateListingProfile triggers cache invalidation"
  - "AC-37: createNotification persists; getUnreadCount correct"
  - "AC-38: markRead / markAllRead work correctly"
  - "AC-39: Cleanup deletes >90 days"
  - "AC-41: Test mocks record calls; getCalls/wasCalledWith correct"
  - "AC-42: Production services init without error (env vars present)"
  - "AC-50: INTERNAL_SERVER_ERROR logged with structured error"
  - "AC-51: Zod validation failure returns fieldErrors keyed by field name"
  - "AC-52: GitHub Actions runs lint + type-check + unit + integration on push"
  - "AC-53: Vercel deploys main after CI passes"
blocked_by: []
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-16T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §6-§8, §10-§12"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-16T00:00:00
---

# CS-WORK-006: Object storage, rendering, notifications, service abstraction, tRPC, CI/CD

## Context

Remaining S0 infrastructure: Cloudflare R2 object storage (SI §6), Next.js SSG/ISR rendering (SI §7), notification system (SI §8), service abstraction layer with test mocks (SI §10), tRPC error handling (SI §11), and CI/CD pipeline (SI §12). Grouped because each is small (2-5 AC) and shares no dependencies with the other work items.

## Deliverables

- [ ] `src/lib/storage/r2.ts` — upload(), getSignedUrl(), deleteByPrefix()
- [ ] `src/lib/notifications/` — createNotification(), getUnreadCount(), markRead(), cleanup()
- [ ] `src/lib/services/` — Service abstraction + test mock factory
- [ ] `src/server/trpc.ts` — Error handler middleware
- [ ] `.github/workflows/ci.yml` — Lint, type-check, test pipeline
- [ ] `vercel.json` — Deploy config
- [ ] Tests for all 16 AC

## References

- `3-requirements/slices/slice-00-infrastructure.md` §7-§12
- `3-requirements/interfaces/shared-infrastructure.md` §6-§8, §10-§12
