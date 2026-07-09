---
id: CS-WORK-115
title: Settings page
chapter: CH-CS-021
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Email preferences wired to settings.getEmailPreferences + updateEmailPreference"
    test_type: manual
  - id: AC-2
    description: "Toggle checkboxes for each email category, mutation on change"
    test_type: manual
  - id: AC-3
    description: "Account closure section with confirmation flow"
    test_type: manual
  - id: AC-4
    description: "Closure calls settings.initiateAccountClosure mutation"
    test_type: manual
---
# CS-WORK-115: Settings page
## Deliverables
- [x] `src/app/dashboard/settings/page.tsx` — email preferences + account closure, wired to tRPC
