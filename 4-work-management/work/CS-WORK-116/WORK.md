---
id: CS-WORK-116
title: Notifications page
chapter: CH-CS-021
arc: presentation-e2
epoch: CS-E2
status: done
closed: 2026-03-30
effort: small
blocked_by: []
acceptance_criteria:
  - id: AC-1
    description: "Notifications list wired to notification.list"
    test_type: manual
  - id: AC-2
    description: "Dismiss and mark-read buttons call notification.dismiss/markRead mutations"
    test_type: manual
  - id: AC-3
    description: "New badge on unread notifications, opacity on read"
    test_type: manual
---
# CS-WORK-116: Notifications page
## Deliverables
- [x] `src/app/dashboard/notifications/page.tsx` — notification list with dismiss/mark-read, wired to tRPC
