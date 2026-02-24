---
id: CH-CS-001
title: Event Bus & Core Infrastructure
arc: infrastructure
epoch: CS-E1
status: Active
depends: null
work_items: [CS-WORK-001, CS-WORK-002, CS-WORK-003, CS-WORK-004, CS-WORK-005, CS-WORK-006, CS-WORK-034]
---

# Chapter: Event Bus & Core Infrastructure

## Problem

CALLSHEET requires shared infrastructure before any feature can be built: event bus (sync/async dispatch), deferred action scheduler, orchestrated flow engine, decision logging, email transport, auth, object storage, notifications, rendering, and CI/CD.

## Requirements

Source: `3-requirements/slices/slice-00-infrastructure.md` (v2, 52 AC)

### R1: Event Bus Module
In-process TypeScript event bus with sync and async dispatch modes. 3 sync consumers (search index), ~48 async via waitUntil(). EVENT_CONSUMER_MATRIX startup validation. AC-01 through AC-06, AC-45 through AC-47.

### R2: Deferred Action Scheduler
Cron-polled scheduler with retry policies (retry_3, once). DeferredActionParamsMap typed. AC-07 through AC-12, AC-48, AC-49.

### R3: Orchestrated Flow Engine
Sequential step execution with context persistence, skip constraints, and auto-escalation. AC-13 through AC-20.

### R4: Auth (Better Auth)
Signup, login, session, protectedProcedure, adminProcedure. AC-21 through AC-25.

### R5: Email Transport (Resend)
Template-based send with category preferences and transactional bypass. AC-26 through AC-29.

### R6: Object Storage (Cloudflare R2)
Upload, signed URLs, delete by prefix, size/type validation. AC-30 through AC-34.

### R7: Rendering, Notifications, Decision Logging, Service Abstraction, tRPC, CI/CD
AC-35 through AC-42, AC-50 through AC-53.

## Success Criteria

- [ ] All 52 S0 acceptance criteria pass
- [ ] Event bus handles 50+ events/day without >30% request duration impact
- [ ] Deferred actions execute within 120s of scheduled time
