---
template: work_item
id: CS-WORK-022
title: "Article 14 GDPR compliance"
type: feature
status: done
owner: null
created: 2026-02-22
spawned_by: null
spawned_children: []
chapter: CH-CS-003
arc: infrastructure
epoch: CS-E1
closed: 2026-02-22
priority: high
effort: small
traces_to:
  - REQ-CS-SEED-002
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/operations.md
acceptance_criteria:
  - "AC-27: Phase 5 Article 14 email sent to all listings with contact email"
  - "AC-28: Phase 5 On-page Article 14 notice added for listings without email"
blocked_by: [CS-WORK-021]
blocks: [CS-WORK-023]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts:
  - src/scripts/import/phase-5-article14.ts
  - src/scripts/import/__tests__/phase-5-article14.integration.test.ts
  - drizzle/0003_wooden_liz_osborn.sql
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "S2 §6.5, §11, Ops §5 (Article 14)"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-022: Article 14 GDPR compliance

## Context

UK GDPR Article 14 requires notification within 30 days of data collection when personal data is obtained from a source other than the data subject. The 4rfv import creates ~4,700 listings from publicly available industry records — each requires Article 14 notification. Two paths: listings with a contact email receive the `article_14_notice` email template (legal notice + claim CTA + removal link); listings without email receive an on-page transparency banner via `article_14_notice_displayed` column. Email sending uses daily batches (~150/day over 20 days) to stay within Resend Pro rate limits and leave a 10-day buffer. A self-perpetuating `article_14_progress_check` deferred action monitors send progress and alerts the principal if <80% sent by day 20. The on-page banner persists until claim approval (S3 removes it). This work item depends on CS-WORK-021 because Phase 5 runs after Phases 1-4 commit listings to the database.

## Deliverables

- [ ] Migration: `article_14_notice_displayed` boolean column on `listings` table (default false)
- [ ] `src/scripts/import/phase-5-article14.ts` — Article 14 email sending (batched, rate-limited) + on-page notice flagging + compliance action logging
- [ ] `article_14_notice` email template registration with S0 email transport
- [ ] `article_14_progress_check` deferred action handler registration + `DeferredActionParamsMap` extension
- [ ] `src/scripts/import/__tests__/phase-5-article14.test.ts` — Integration tests: email sent for listings with email (AC-27), on-page notice set for listings without email (AC-28), compliance logging

## References

- `3-requirements/slices/slice-02-onboarding.md` §6.5 Phase 5 Article 14 GDPR Notices, §11 Article 14 On-Page Notice, §12 Deferred Actions (`article_14_progress_check`)
- `3-requirements/interfaces/operations.md` §5 (Article 14 compliance obligations)
- `3-requirements/interfaces/shared-infrastructure.md` §5.2 (email transport, template registration)
