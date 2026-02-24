---
template: work_item
id: CS-WORK-005
title: "Email transport and auth"
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
  - REQ-CS-INFRA-005
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-21: Signup + verification email sent"
  - "AC-22: Login after verification"
  - "AC-23: protectedProcedure returns 401 unauthenticated"
  - "AC-24: adminProcedure returns 403 non-admin"
  - "AC-25: Session persists across navigation"
  - "AC-26: send() delivers via Resend (mock records call)"
  - "AC-27: Unsubscribed category → suppressed, no send"
  - "AC-28: Transactional bypasses preference check"
  - "AC-29: Unregistered template throws"
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
  spec_sections: "SI §4, §5"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-16T00:00:00
---

# CS-WORK-005: Email transport and auth

## Context

Better Auth integration (SI §4) + Resend email transport (SI §5). Auth: signup with email verification, login, session middleware, protectedProcedure and adminProcedure tRPC middleware. Email: template-based send with category preferences (marketing/listing_status/operational/transactional), transactional bypass, unsubscribe enforcement.

## Deliverables

- [ ] `src/lib/auth/` — Better Auth config, session middleware, tRPC procedures
- [ ] `src/lib/email/transport.ts` — send(), checkPreference()
- [ ] `src/lib/email/templates.ts` — Template registry (30 templates by S10)
- [ ] Tests for all 9 AC

## References

- `3-requirements/slices/slice-00-infrastructure.md` §5 Auth, §6 Email Transport
- `3-requirements/interfaces/shared-infrastructure.md` §4, §5
