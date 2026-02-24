---
template: work_item
id: CS-WORK-013
title: "Account creation and onboarding router"
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
priority: critical
effort: medium
traces_to:
  - REQ-CS-ONBOARD-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-02-onboarding.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/platform-and-product.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-01: Signup creates Better Auth user + account_profiles row with default email preferences"
  - "AC-02: Email verification sends email_verification template, account browsable before verification"
  - "AC-03: Personalisation step stores departments array on account profile; skippable"
  - "AC-04: Anonymous enquiry retroactive linking: signup with email matching enquiry_records.sender_email updates sender_account_id"
  - "AC-05: Listing creation blocked for unverified email (returns FORBIDDEN)"
blocked_by: []
blocks: [CS-WORK-014, CS-WORK-015, CS-WORK-016]
enables: []
queue_position: backlog
cycle_phase: backlog
node_history:
  - node: backlog
    entered: 2026-02-22T00:00:00
    exited: null
artifacts: []
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S2
  spec_sections: "PP §4.1, SI §4, S2 §2"
version: "2.0"
generated: 2026-02-22
last_updated: 2026-02-22T00:00:00
---

# CS-WORK-013: Account creation and onboarding router

## Context

S2's account creation flow builds on S0 Better Auth (signup + email verification) and S1 account profiles. This work item adds the `onboardingRouter` with the `completePersonalisation` mutation, the `departments` column migration on `account_profiles`, the retroactive anonymous enquiry linking hook (S1-ST-20), and the verified-email guard that all listing creation paths depend on. AC-02 is E2E (email verification callback page) but the server-side hook and template registration are integration-testable.

## Deliverables

- [ ] Migration: add `departments` text array column to `account_profiles`
- [ ] `src/server/routers/onboarding.ts` -- `completePersonalisation` mutation
- [ ] `src/lib/onboarding/link-anonymous-enquiries.ts` -- `linkAnonymousEnquiries(accountId, email)` post-signup hook
- [ ] `src/lib/onboarding/verified-email-guard.ts` -- reusable middleware/guard for listing creation routes
- [ ] `src/lib/onboarding/__tests__/account-creation.integration.test.ts` -- Integration tests for AC-01, AC-03, AC-04, AC-05; AC-02 is E2E

## References

- `3-requirements/slices/slice-02-onboarding.md` S2 -- Account Creation, S2.2 Account Profile Extension, S2.3 Retroactive Linking
- `3-requirements/interfaces/platform-and-product.md` S4.1
- `3-requirements/interfaces/shared-infrastructure.md` S4 (auth)
