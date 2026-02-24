---
template: work_item
id: CS-WORK-001
title: "Event bus module"
type: feature
status: done
owner: null
created: 2026-02-16
spawned_by: null
spawned_children: []
chapter: CH-CS-001
arc: infrastructure
epoch: CS-E1
closed: 2026-02-19
priority: critical
effort: medium
traces_to:
  - REQ-CS-INFRA-001
source_files:
  - D:/PROJECTS/callsheet/3-requirements/slices/slice-00-infrastructure.md
  - D:/PROJECTS/callsheet/3-requirements/interfaces/shared-infrastructure.md
acceptance_criteria:
  - "AC-01: Sync handlers execute sequentially; failure propagates to caller"
  - "AC-02: Async handlers dispatch via waitUntil(); execute after sync complete"
  - "AC-03: Async failure logs to event_consumer_errors, does not propagate"
  - "AC-04: EVENT_CONSUMER_MATRIX validation fails on missing consumer"
  - "AC-05: EVENT_CONSUMER_MATRIX validation passes with all consumers registered"
  - "AC-06: Duplicate emission to idempotent consumer produces same outcome"
  - "AC-45: Test waitUntilFn mock collector accumulates all async promises; all resolve"
  - "AC-46: Bus rejects handler registration with mode not matching EVENT_CONSUMER_MATRIX entry"
  - "AC-47: Event emission logs scaling metrics: syncDurationMs, asyncConsumerCount, asyncPercentage"
blocked_by: []
blocks: [CS-WORK-002, CS-WORK-003]
enables: [CS-WORK-004]
queue_position: done
cycle_phase: done
node_history:
  - node: backlog
    entered: 2026-02-16T00:00:00
    exited: 2026-02-19T00:00:00
  - node: in_progress
    entered: 2026-02-19T00:00:00
    exited: 2026-02-19T00:00:00
  - node: done
    entered: 2026-02-19T00:00:00
    exited: null
artifacts:
  - src/lib/events/types.ts
  - src/lib/events/bus.ts
  - src/lib/events/errors.ts
  - src/lib/events/waitUntil.ts
  - src/lib/events/index.ts
  - src/lib/events/__tests__/bus.test.ts
  - src/db/schema/shared.ts
cycle_docs: {}
memory_refs: []
extensions:
  project: CALLSHEET
  slice: S0
  spec_sections: "SI §1.1-§1.3"
version: "2.0"
generated: 2026-02-16
last_updated: 2026-02-19T00:00:00
---

# CS-WORK-001: Event bus module

## Context

In-process TypeScript event bus implementing SI §1.1-§1.3. Single `emit()` function dispatches to sync consumers (sequential, failure propagates) and async consumers (via `waitUntil()`, failure logged). `EVENT_CONSUMER_MATRIX` validates at startup that all expected consumers are registered. 3 sync consumers (search index consistency), ~48 async.

Tech: TypeScript module at `src/lib/events/bus.ts`. Types from `src/lib/events/types.ts` (EventPayloadMap, EVENT_CONSUMER_MATRIX).

## Deliverables

- [x] `src/lib/events/types.ts` — EventPayloadMap, EVENT_CONSUMER_MATRIX const, 25 branded placeholder payloads
- [x] `src/lib/events/bus.ts` — InProcessEventBus: emit(), on(), validateConsumers(), getRegisteredHandlers()
- [x] `src/lib/events/__tests__/bus.test.ts` — 9 tests, 1:1 AC mapping, all pass
- [x] `src/lib/events/waitUntil.ts` — createWaitUntilCollector() for tests
- [x] `src/lib/events/errors.ts` — logEventConsumerError() signature (DB write ready for S1+)
- [x] `src/lib/events/index.ts` — Barrel export
- [x] `src/db/schema/shared.ts` — event_consumer_errors table with composite index

## Implementation Notes

- **consumerMatrix injection:** Bus accepts optional `consumerMatrix` in constructor options. Production uses default `EVENT_CONSUMER_MATRIX`; tests inject a custom matrix. Follows inject-don't-patch principle.
- **Branded placeholder types:** Each event payload is `{ readonly _brand: "..." }`. Compiler prevents cross-event misuse. Domain slices replace with real payload types.
- **Type-erased internal storage:** `StoredHandler` uses `never` payload. Public `on<T>()` and `emit<T>()` are fully generic. Single `as unknown as StoredHandler` contained to registration site.
- **Empty matrix at S0:** All 25 entries are `[]`. Mode validation skips events with no entries.
- **Project scaffold included:** Next.js 16 + TypeScript strict + Tailwind + Vitest + Drizzle ORM. tsconfig path alias `@/*` → `src/*`.

## Verification

- `npx vitest run` — 9/9 pass
- `npx tsc --noEmit` — 0 errors
- `grep -r 'any' src/lib/events/` — 0 type annotations (1 comment match only)

## References

- `3-requirements/slices/slice-00-infrastructure.md` §2 Event Bus
- `3-requirements/interfaces/shared-infrastructure.md` §1
