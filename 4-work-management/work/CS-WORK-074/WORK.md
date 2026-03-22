---
template: work_item
id: CS-WORK-074
title: "Demo preparation — S8 close-out"
type: feature
status: done
owner: null
created: 2026-02-25
spawned_by: null
spawned_children: []
chapter: CH-CS-010
arc: commercial-and-intelligence
epoch: CS-E1
closed: 2026-03-06
priority: high
effort: medium
traces_to: []
source_files: []
acceptance_criteria:
  - "AC-01: Demo seed includes an admin user (admin@callsheet.test / password123, role: admin) with full admin panel access"
  - "AC-02: Demo seed creates 2–3 support tickets (open, assigned, resolved) with realistic categories and SLA deadlines"
  - "AC-03: Demo seed creates 1 compliance register entry (open DSAR with 30-day deadline) and 1 billing hold"
  - "AC-04: Demo seed creates 1 in-progress erasure flow (orchestrated_flows with 3+ steps, 1 completed, 1 in_progress)"
  - "AC-05: Demo seed creates 2–3 event_consumer_errors (1 resolved, 2 unresolved) for failed event admin view"
  - "AC-06: Demo seed creates enquiry records — 2 received by demo user's listing (1 responded, 1 pending), 2 sent by demo user to other listings"
  - "AC-07: Demo seed creates shortlist with 3 items for the demo user"
  - "AC-08: Demo seed creates search_history entries (3 recent searches) for the demo user"
  - "AC-09: Demo seed creates churn_risk_registry entry for one non-demo listing (visible in admin support detail)"
  - "AC-10: Demo seed creates conversion_triggers / feature_gate_friction records for S8 commercial admin views (if tables exist after S8)"
  - "AC-11: npm run db:seed-demo is idempotent — re-running skips existing records without error"
  - "AC-12: Demo walkthrough script in 4-work-management/work/CS-WORK-074/DEMO-SCRIPT.md covers 3 journeys: buyer (search→profile→shortlist→enquiry), provider (login→dashboard→listings→analytics→enquiries), admin (overview→support→billing→compliance→flows→events→commercial)"
blocked_by: [CS-WORK-073]
blocks: []
enables: []
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-25T00:00:00
    exited: 2026-03-06T00:00:00
  - node: done
    entered: 2026-03-06T00:00:00
    exited: null
artifacts:
  - src/db/seed/demo.ts
  - 4-work-management/work/CS-WORK-074/DEMO-SCRIPT.md
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S8
  spec_sections: "Cross-cutting — demo prep, no spec section"
  io_profile: "db-write"
version: "1.0"
generated: 2026-02-25
last_updated: 2026-02-25T00:00:00
---

# CS-WORK-074: Demo preparation — S8 close-out

## Context

After S8 completes, CALLSHEET has the full buyer journey, provider journey, and admin operations/commercial panel implemented. The current demo seed creates 1 user and 6 listings — enough for search and profile pages but not for demonstrating the operations or commercial admin views, which require support tickets, compliance entries, flows, failed events, enquiries, shortlists, and commercial analytics data.

This work item extends the demo seed to populate all admin views with realistic data and produces a walkthrough script for stakeholder presentation.

No new routes or schema — this consumes existing backend exclusively.

## Deliverables

- [x] `src/db/seed/demo.ts` — extend with admin user, support tickets, compliance entry, billing hold, orchestrated flow, event errors, enquiries, shortlists, search history, churn risk, and S8 commercial records
- [x] `4-work-management/work/CS-WORK-074/DEMO-SCRIPT.md` — 3-journey walkthrough script with page-by-page narration

## References

- `src/db/seed/demo.ts` — existing seed (1 user, 6 listings)
- `src/app/admin/` — admin layout and sidebar (8 nav items)
- `src/db/schema/operations.ts` — support_tickets, compliance_register, billing_holds, churn_risk_registry, etc.
- `src/db/schema/shared.ts` — orchestrated_flows, event_consumer_errors, deferred_actions
- `src/db/schema/data-and-listings.ts` — enquiry_records, shortlists, shortlist_items, search_history
