---
template: work_item
id: CS-WORK-026
title: "EmailService correspondence logging"
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
  - REQ-CS-COMMS-002
source_files:
  - D:/PROJECTS/callsheet/1-investigation/communications-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-05: LoggingEmailService checks suppression before inner send, blocks ALL categories"
  - "AC-06: Every send inserts one correspondence_log row with correct fields"
  - "AC-07: mergeFieldsHash is SHA-256 of sorted keys, deterministic"
  - "AC-08: threadId from params or new UUID, returned in EmailSendResult"
blocked_by: [CS-WORK-025]
blocks: [CS-WORK-027]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/lib/email/types.ts
  - src/lib/email/transport.ts
  - src/lib/email/logging-service.ts
  - src/lib/email/correspondence.ts
  - src/lib/email/suppression.ts
  - src/lib/email/index.ts
  - src/lib/email/__tests__/correspondence.test.ts
  - src/lib/email/__tests__/correspondence.integration.test.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  spec_sections: "Investigation §3.1, §3.2, §3.3; SI §5.1"
version: "1.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-026: EmailService correspondence logging

## Context

Adds `LoggingEmailService` decorator that wraps any `EmailService` implementation. Adds system-level suppression (account + email level) that blocks ALL categories including transactional. Extends `EmailSendParams` with optional `threadId` and `listingId`. Extends `EmailSendResult` with `threadId`. Existing callers and tests using bare `InMemoryEmailService` are unaffected — the decorator is opt-in.

## Deliverables

- [x] `src/lib/email/types.ts` — +threadId, +listingId on params; +threadId on result
- [x] `src/lib/email/transport.ts` — Both services return threadId
- [x] `src/lib/email/logging-service.ts` — LoggingEmailService decorator
- [x] `src/lib/email/correspondence.ts` — CorrespondenceWriter + computeMergeFieldsHash
- [x] `src/lib/email/suppression.ts` — SuppressionChecker (Db + InMemory)
- [x] `src/lib/email/__tests__/correspondence.test.ts` — 12 unit tests
- [x] `src/lib/email/__tests__/correspondence.integration.test.ts` — 5 integration tests
