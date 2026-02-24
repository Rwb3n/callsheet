---
template: work_item
id: CS-WORK-028
title: "Bounce handling, suppression, and DSAR extension"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-013
arc: infrastructure
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: medium
traces_to:
  - REQ-CS-COMMS-004
source_files:
  - D:/PROJECTS/callsheet/1-investigation/communications-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-14: hard bounce suppresses account + email, logs email_suppressed decision"
  - "AC-15: soft bounce schedules retry_bounced_email with originalParams, 24h delay"
  - "AC-16: 3+ bounces in 90 days creates admin notification"
  - "AC-17: getCorrespondenceForAccount + anonymiseCorrespondence work correctly"
blocked_by: [CS-WORK-025, CS-WORK-027]
blocks: []
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/lib/email/bounce-handler.ts
  - src/lib/email/correspondence-queries.ts
  - src/lib/email/__tests__/bounce.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  spec_sections: "Investigation §3.4, §3.7; SI §9.2"
version: "1.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-028: Bounce handling, suppression, and DSAR extension

## Context

Hard bounce: suppress at account level (`account_profiles.suppressedAt`) and email level (`suppressed_emails` table), log `email_suppressed` decision via `logDecision()`. Soft bounce: schedule `retry_bounced_email` deferred action (24h, once, log). 3+ bounces in 90 days for same account/email → admin notification via existing notification infrastructure. DSAR: `getCorrespondenceForAccount()` queries by accountId OR externalEmail. `anonymiseCorrespondence()` sets erased values, retains row skeleton. Both are standalone functions — not wired into the erasure flow (that's S10).

## Deliverables

- [x] `src/lib/email/bounce-handler.ts` — handleBounce with hard/soft logic + threshold check
- [x] `src/lib/email/correspondence-queries.ts` — getCorrespondenceForAccount + anonymiseCorrespondence
- [x] `src/lib/email/__tests__/bounce.integration.test.ts` — 5 integration tests
