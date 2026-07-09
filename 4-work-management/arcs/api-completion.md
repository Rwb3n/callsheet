---
id: api-completion
epoch: CS-E2
status: Complete
depends: null
chapters: [CH-CS-015, CH-CS-016]
---

# Arc: API Completion

## Mission

Close the 10 operational API gaps identified in the CS-E1 audit. Add API key authentication for machine clients. Fix the flow retry architecture gap. After this arc, every operational loop can be closed via tRPC — the admin UI and agent CLI both consume these routes.

## Scope

### CH-CS-015: Operational Routes (~8 work items, ~35 AC)

Fill missing admin routes. No new tables, no new events — queries and mutations over existing data.

| Work Item | Routes | Purpose |
|-----------|--------|---------|
| Erasure + closure initiation | `admin.flows.initiateErasure`, `admin.flows.initiateClosureForAccount` | Admin/agent can start GDPR and closure flows |
| Flow retry execution | Fix `retryStep` to actually re-execute via `resumeFlow` | Close the retry gap — currently resets state but nobody picks it up |
| Scheduler visibility | `admin.scheduler.list`, `admin.scheduler.getDetail`, `admin.scheduler.trigger`, `admin.scheduler.cancel` | See and manage the 37 deferred action types |
| Decision log search | `admin.decisions.search` | Query the 35 decision types with filters (domain, type, date range, listingId, accountId) |
| Notification management | `admin.notifications.list`, `admin.notifications.dismiss` | Admin can view and manage notification queue |
| User + account management | `admin.users.list`, `admin.users.getDetail`, `admin.users.updateRole` | Admin can manage users, assign roles |
| Listing admin | `admin.listings.suspend`, `admin.listings.unsuspend` | Admin can intervene on listings |
| Task management | `admin.tasks.list`, `admin.tasks.getDetail`, `admin.tasks.create`, `admin.tasks.updateStatus` | Wire the existing task_specs table to API |

### CH-CS-016: Machine Authentication (~2 work items, ~10 AC)

API key system for stateless machine client auth.

| Work Item | Deliverables | Purpose |
|-----------|-------------|---------|
| API key infrastructure | `api_keys` table, middleware, key generation/hashing | Bearer token auth for CLI/agent clients |
| API key admin routes | `admin.apiKeys.create`, `admin.apiKeys.list`, `admin.apiKeys.revoke` | Admin manages machine credentials |

## Exit Criteria

- [ ] Every operational loop identified in the audit can be closed via tRPC
- [ ] `retryStep` actually re-executes the failed step (not just state reset)
- [ ] Agent can authenticate via API key header
- [ ] All new routes have integration tests
- [ ] CS-E1 tests continue to pass (0 regressions)
