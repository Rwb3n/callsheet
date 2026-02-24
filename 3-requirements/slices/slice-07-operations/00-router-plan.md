<!-- Part of slice-07-operations v2 -->

# S7 Router Plan — Operations

---

## 1. File Tree

```
src/app/admin/
├── layout.tsx                         # Auth guard + admin role check (CSR)
├── page.tsx                           # Admin dashboard overview (§1)
├── tasks/
│   ├── page.tsx                       # TaskSpec queue list — filter by domain/priority/status (§3)
│   └── [taskId]/page.tsx              # TaskSpec detail — context, checklist, actions (§3)
├── support/
│   ├── page.tsx                       # Support ticket list — filter by status/priority/category (§2)
│   └── [ticketId]/page.tsx            # Ticket detail — timeline, SLA, churn risk, actions (§2)
├── billing/
│   ├── page.tsx                       # Billing reconciliation status + hold list (§4)
│   └── refunds/page.tsx               # Refund evaluation queue + processing (§13)
├── compliance/
│   ├── page.tsx                       # Compliance register list — filter by type/status (§5)
│   └── [entryId]/page.tsx             # DSAR/obligation detail — timeline, deadline, actions (§5)
├── flows/
│   ├── page.tsx                       # Orchestrated flow list — erasure + closure (§6)
│   └── [flowId]/page.tsx              # Flow detail — step progress, retry/skip/escalate (§6)
├── events/page.tsx                    # Failed event admin view — grouped by consumerId (§7)
└── health/page.tsx                    # Platform health signals + friction summary (§8, §12)
```

**Backend-only sections (no dedicated admin pages):**

| Section | UI Surface | Rationale |
|---------|-----------|-----------|
| §9 Event Consumers | No UI — handler registrations in `EVENT_CONSUMER_MATRIX` | 13 consumer implementations are code modules, not admin views |
| §10 Registries | Embedded in `/admin/support` (churn risk badge) and `/admin/billing` (pending cancellation lookup) | Registry data surfaces as contextual indicators, not standalone views |
| §11 Email Delivery | Embedded in `/admin/compliance/[entryId]` (DSAR ack/completion sends) and `/admin/tasks/[taskId]` (decay/win-back delivery status) | Email sends are actions within existing views, not a separate admin surface |

---

## 2. Admin Role Guard

All S7 routes require `ctx.session?.role === "admin"`. Two enforcement layers:

### 2.1 App Router Layout Guard

```typescript
// src/app/admin/layout.tsx
export default async function AdminLayout({ children }) {
  const session = await auth()
  if (!session) redirect("/login?redirect=/admin")
  if (!session.role.startsWith("admin")) redirect("/dashboard")
  // role.startsWith("admin") per SI §4.1 note — eases V2 migration to scoped roles

  return <AdminShell session={session}>{children}</AdminShell>
}
```

### 2.2 tRPC Admin Procedure

```typescript
// src/server/procedures.ts
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session.role.startsWith("admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" })
  }
  return next({ ctx })
})
```

All admin tRPC routes use `adminProcedure`. The `AuthSession` type (SI §4.1) exposes `ctx.session.accountId` — not `ctx.session.id` (which does not exist). All S7 routes reference `ctx.session.accountId` for audit trails and notification delivery.

---

## 3. tRPC Router Inventory

### 3.1 admin.dashboard (`src/server/routers/admin/dashboard.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.dashboard.getOverview` | `adminProcedure.query` | none | `AdminOverview` | §1 | Aggregate stats: open tickets, pending tasks, active flows, health signals, approaching deadlines |

```typescript
type AdminOverview = {
  tickets: { open: number; critical: number; approachingSLA: number }
  tasks: { pending: number; overdue: number; byDomain: Record<TaskSpecDomain, number> }
  flows: { active: number; failed: number; escalated: number }
  health: { status: "healthy" | "degraded" | "unhealthy"; signals: HealthSignal[] }
  compliance: { openDSARs: number; approachingDeadlines: number }
  billing: { status: "healthy" | "anomaly_detected" | "failed"; activeHolds: number }
  notifications: { unread: number }     // admin's own unread count via getNotifications(ctx.session.accountId)
}
```

**Query strategy:** 6 parallel queries (one per aggregate), merged server-side. Each targets a COUNT with WHERE filters on the relevant table. Target: <500ms p95 total.

---

### 3.2 admin.support (`src/server/routers/admin/support.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.support.list` | `adminProcedure.query` | `SupportListInput` | `{ tickets: SupportTicketRow[], nextCursor? }` | §2 | Paginated ticket list with filters |
| `admin.support.getDetail` | `adminProcedure.query` | `{ ticketId: uuid }` | `SupportTicketDetail` | §2 | Full ticket detail with account context, churn risk badge, SLA progress |
| `admin.support.create` | `adminProcedure.mutation` | `CreateTicketInput` | `{ ticketId: uuid }` | §2 | Manual ticket creation by admin (e.g., from inbound email) |
| `admin.support.updateStatus` | `adminProcedure.mutation` | `{ ticketId: uuid, status: TicketStatus, resolution?: string }` | `void` | §2 | Transition ticket status. Logs decision. |
| `admin.support.updatePriority` | `adminProcedure.mutation` | `{ ticketId: uuid, priority: TicketPriority, reason: string }` | `void` | §2 | Escalate/de-escalate priority. Logs decision. |

```typescript
const supportListInput = z.object({
  status: z.enum(["open", "assigned", "resolved", "closed"]).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["sla_deadline", "priority", "created_at"]).default("sla_deadline"),
})

type SupportTicketRow = {
  id: UUID
  subject: string
  category: string
  priority: "critical" | "high" | "normal" | "low"
  status: "open" | "assigned" | "resolved" | "closed"
  slaDeadline: ISO8601 | null
  slaRemainingHours: number | null           // computed: slaDeadline - now()
  hasChurnRisk: boolean                       // joined from churn_risk_registry
  createdAt: ISO8601
}

type SupportTicketDetail = SupportTicketRow & {
  accountId: UUID | null
  listingId: UUID | null
  accountEmail: string | null                 // joined from accounts table
  listingName: string | null                  // joined from listings table
  churnRiskLevel: "at_risk" | "high_risk" | null  // from churn_risk_registry
  resolvedAt: ISO8601 | null
  closedAt: ISO8601 | null
}

type CreateTicketInput = z.infer<typeof z.object({
  accountId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  category: z.string(),
  priority: z.enum(["critical", "high", "normal", "low"]),
  subject: z.string().min(1).max(500),
  slaDeadline: z.string().datetime().optional(),
})>
```

**`admin.support.create` side effects:**

```
admin.support.create(input):
  ticketId = insert into support_tickets(...)

  // Schedule SLA breach warning if deadline set [D1]
  if input.slaDeadline:
    slaDuration = slaDeadline - now()
    warningAt = now() + (slaDuration * 0.8)
    scheduleAction("sla_breach_warning", { ticketId, slaDeadline: input.slaDeadline }, warningAt)

  // Send acknowledgment email if accountId has email [checklist §2.1]
  if input.accountId:
    account = getAccount(input.accountId)
    sendEmail("support_acknowledgment", { to: account.email, ticketId, subject: input.subject })

  // Decision log [SI §9]
  logDecision({
    domain: "operations",
    decisionType: "support_triage",
    inputs: { category: input.category, hasAccount: !!input.accountId },
    output: { priority: input.priority, slaDeadline: input.slaDeadline },
  })

  return { ticketId }
```

**`admin.support.updateStatus` — resolve/close:**

```
admin.support.updateStatus({ ticketId, status, resolution }):
  ticket = getTicket(ticketId)
  if ticket.status === status: return           // idempotent

  update support_tickets SET status, resolvedAt (if "resolved"), closedAt (if "closed")

  // Cancel SLA breach warning on resolution [D1]
  if status === "resolved" || status === "closed":
    cancelAction("sla_breach_warning", { ticketId })
```

---

### 3.3 admin.tasks (`src/server/routers/admin/tasks.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.tasks.list` | `adminProcedure.query` | `TaskListInput` | `{ tasks: TaskSpecRow[], nextCursor? }` | §3 | Paginated TaskSpec list with filters |
| `admin.tasks.getDetail` | `adminProcedure.query` | `{ taskId: uuid }` | `TaskSpecDetail` | §3 | Full task detail with listing context, evidence, checklist |
| `admin.tasks.complete` | `adminProcedure.mutation` | `{ taskId: uuid, result: Record<string, unknown> }` | `void` | §3 | Mark task completed + execute completion callback |
| `admin.tasks.reroute` | `adminProcedure.mutation` | `{ taskId: uuid, reason: string }` | `void` | §3 | Re-route task to different queue. Increments `rerouteCount`, rejects if `rerouteCount >= maxReroutes`. |
| `admin.tasks.escalate` | `adminProcedure.mutation` | `{ taskId: uuid, reason: string }` | `void` | §3 | Escalate to principal. Sets priority to "critical". |

```typescript
const taskListInput = z.object({
  domain: z.enum(["verification", "support", "moderation", "compliance", "data_maintenance", "outreach"]).optional(),
  status: z.enum(["pending", "assigned", "in_progress", "completed", "timed_out", "re_routed"]).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["deadline", "priority", "created_at"]).default("priority"),
})

type TaskSpecRow = {
  id: UUID
  domain: TaskSpecDomain
  task: string                                   // summary line
  priority: "critical" | "high" | "normal" | "low"
  status: TaskSpecStatus
  deadline: ISO8601 | null
  estimatedTime: string
  rerouteCount: number
  createdAt: ISO8601
}

type TaskSpecDetail = TaskSpecRow & {
  context: Record<string, unknown>               // R6: immutable snapshot from creation
  checklist: string[]
  acceptanceCriteria: string
  requiredSkills: string[]
  dataAccessScope: DataAccessScope
  learningCapture: LearningCapture
  maxReroutes: number
  timeout: number                                // hours
  completedAt: ISO8601 | null
  result: Record<string, unknown> | null
  listingContext: {                              // batch-joined from listings table
    listingId: UUID | null
    name: string | null
    entityType: EntityType | null
    verificationTier: VerificationTier | null
  } | null
}
```

**`admin.tasks.getDetail` — N+1 prevention [checklist §10.5]:**

```
admin.tasks.getDetail({ taskId }):
  // Single query: JOIN task_specs → listings (via context.listingId if present)
  // Extract listingId from context JSONB: context->>'listingId'
  // LEFT JOIN listings ON listings.id = context->>'listingId'
  // No per-task listing lookups
```

**`admin.tasks.complete` — completion callbacks [S3-6]:**

```
admin.tasks.complete({ taskId, result }):
  task = getTask(taskId)
  if task.status === "completed": return         // idempotent

  update task_specs SET status = "completed", completedAt = now(), result

  // Cancel timeout deferred action
  cancelAction("task_timeout_check", { taskId })

  // Domain-specific completion callback
  match task.domain:
    "verification":
      // S3-6: portfolio review TaskSpec → applyVerificationUpgrade
      if task.context.callbackType === "verification_upgrade":
        applyVerificationUpgrade(task.context.listingId)   // imported from S3

  // Decision log [SI §9]
  logDecision({
    domain: "operations",
    decisionType: "task_routing",
    inputs: { taskId, domain: task.domain },
    output: { action: "completed", result },
    entityContext: { listingId: task.context.listingId },
  })
```

---

### 3.4 admin.billing (`src/server/routers/admin/billing.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.billing.getStatus` | `adminProcedure.query` | none | `BillingReconciliationStatus` | §4 | Current reconciliation status from single-row table [D6] |
| `admin.billing.triggerReconciliation` | `adminProcedure.mutation` | none | `{ scheduled: boolean }` | §4 | Schedule immediate billing reconciliation run |
| `admin.billing.listHolds` | `adminProcedure.query` | `{ cursor?: string }` | `{ holds: BillingHoldRow[], nextCursor? }` | §4 | Active billing holds with listing context |
| `admin.billing.releaseHold` | `adminProcedure.mutation` | `{ holdId: uuid, reason: string }` | `void` | §4 | Manually release a billing hold before 48h expiry |

```typescript
// BillingReconciliationStatus — maps to D6 schema
type BillingReconciliationStatus = {
  lastRunAt: ISO8601
  status: "healthy" | "anomaly_detected" | "failed"
  activeHolds: number
  lastAnomalyAt: ISO8601 | null
  lastAnomalyDescription: string | null
}

type BillingHoldRow = {
  id: UUID
  listingId: UUID
  listingName: string                            // joined from listings
  expiresAt: ISO8601
  remainingHours: number                         // computed: expiresAt - now()
  createdAt: ISO8601
}
```

**`admin.billing.triggerReconciliation`:**

```
admin.billing.triggerReconciliation():
  // Schedule immediate execution — inserts deferred action with executeAt = now()
  scheduleAction("billing_reconciliation", {}, now())
  logDecision({
    domain: "operations",
    decisionType: "billing_reconciliation",
    inputs: { trigger: "manual_admin" },
    output: { action: "scheduled" },
  })
  return { scheduled: true }
```

---

### 3.5 admin.compliance (`src/server/routers/admin/compliance.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.compliance.list` | `adminProcedure.query` | `ComplianceListInput` | `{ entries: ComplianceRow[], nextCursor? }` | §5 | Paginated compliance register with filters |
| `admin.compliance.getDetail` | `adminProcedure.query` | `{ entryId: uuid }` | `ComplianceDetail` | §5 | Full entry detail with account context and timeline |
| `admin.compliance.create` | `adminProcedure.mutation` | `CreateComplianceInput` | `{ entryId: uuid }` | §5 | Create compliance entry (DSAR, obligation, etc.) |
| `admin.compliance.updateStatus` | `adminProcedure.mutation` | `{ entryId: uuid, status: ComplianceStatus, notes?: string }` | `void` | §5 | Transition entry status. Triggers email on DSAR completion. |

```typescript
const complianceListInput = z.object({
  type: z.enum(["dsar", "erasure", "article_14", "complaint", "investigation", "obligation"]).optional(),
  status: z.enum(["open", "in_progress", "completed", "overdue"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["deadline", "created_at", "status"]).default("deadline"),
})

type ComplianceRow = {
  id: UUID
  type: ComplianceEntryType
  status: ComplianceEntryStatus
  accountId: UUID | null
  accountEmail: string | null                    // joined from accounts
  deadline: ISO8601 | null
  daysRemaining: number | null                   // computed: deadline - now()
  receivedAt: ISO8601 | null
  createdAt: ISO8601
}

type ComplianceDetail = ComplianceRow & {
  completedAt: ISO8601 | null
  details: Record<string, unknown> | null        // type-specific structured data
  hasComplianceHold: boolean                     // derived: type IN ('dsar','complaint','investigation') AND status = 'open'
}

const createComplianceInput = z.object({
  type: z.enum(["dsar", "erasure", "article_14", "complaint", "investigation", "obligation"]),
  accountId: z.string().uuid().optional(),
  deadline: z.string().datetime().optional(),
  receivedAt: z.string().datetime().optional(),
  details: z.record(z.unknown()).optional(),
})
```

**`admin.compliance.updateStatus` — DSAR completion triggers:**

```
admin.compliance.updateStatus({ entryId, status, notes }):
  entry = getComplianceEntry(entryId)
  update compliance_register SET status, completedAt (if "completed")

  // On DSAR completion: send dsar_completion email [checklist §2.2]
  if entry.type === "dsar" && status === "completed" && entry.accountId:
    account = getAccount(entry.accountId)
    sendEmail("dsar_completion", { to: account.email, dsarId: entryId })

  // Decision log
  logDecision({
    domain: "operations",
    decisionType: "compliance_scheduling",
    inputs: { entryId, previousStatus: entry.status },
    output: { newStatus: status, notes },
  })
```

---

### 3.6 admin.flows (`src/server/routers/admin/flows.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.flows.list` | `adminProcedure.query` | `FlowListInput` | `{ flows: FlowRow[], nextCursor? }` | §6 | Paginated flow list with status filters |
| `admin.flows.getDetail` | `adminProcedure.query` | `{ flowId: uuid }` | `FlowDetail` | §6 | Full flow detail with step progress, skip/retry controls |
| `admin.flows.retryStep` | `adminProcedure.mutation` | `{ flowId: uuid }` | `void` | §6 | Retry the current failed step. Increments attempt counter. |
| `admin.flows.skipStep` | `adminProcedure.mutation` | `{ flowId: uuid, reason: string }` | `void` | §6 | Skip current step. Enforces skip constraint matrix (SI §3.5). Rejects non-skippable steps. |
| `admin.flows.escalate` | `adminProcedure.mutation` | `{ flowId: uuid, reason: string }` | `void` | §6 | Manually escalate flow to principal |

```typescript
const flowListInput = z.object({
  flowType: z.enum(["erasure", "closure"]).optional(),
  status: z.enum(["initiated", "in_progress", "completed", "failed", "escalated"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["deadline", "started_at", "updated_at"]).default("started_at"),
})

type FlowRow = {
  flowId: UUID
  flowType: "erasure" | "closure"
  status: "initiated" | "in_progress" | "completed" | "failed" | "escalated"
  currentStep: number
  totalSteps: number
  startedAt: ISO8601
  updatedAt: ISO8601                             // S0-3 amendment
  deadline: ISO8601 | null                       // erasure only: 30 days from DSAR
  daysRemaining: number | null                   // computed: deadline - now()
}

type FlowDetail = FlowRow & {
  triggeredBy: UUID
  completedAt: ISO8601 | null
  escalatedAt: ISO8601 | null
  escalationReason: string | null
  steps: FlowStepView[]
}

type FlowStepView = {
  name: string
  domain: string                                 // SI §3.2: owning domain
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  attempt: number
  completedAt: ISO8601 | null
  error: string | null
  retryable: boolean
  skippable: boolean                             // from SI §3.5 skip constraint matrix
  skipReason: string | null
  skippedBy: string | null
}
```

**`admin.flows.skipStep` — constraint enforcement:**

```
admin.flows.skipStep({ flowId, reason }):
  flow = getFlow(flowId)
  currentStep = flow.steps[flow.currentStep]

  // Enforce skip constraint matrix [SI §3.5, R11]
  if !currentStep.skippable:
    throw TRPCError({ code: "FORBIDDEN", message: "Step is not skippable: " + currentStep.name })

  // reason is mandatory per SI §3.5
  if !reason || reason.trim().length === 0:
    throw TRPCError({ code: "BAD_REQUEST", message: "Skip reason is required" })

  // Apply skip
  update step: status = "skipped", skipReason = reason, skippedBy = ctx.session.accountId
  advance flow to next step (or "completed" if last step)
  update orchestrated_flows.updatedAt = now()

  logDecision({
    domain: "operations",
    decisionType: "flow_step_skip",
    inputs: { flowId, stepName: currentStep.name, flowType: flow.flowType },
    output: { action: "skipped", reason, skippedBy: ctx.session.accountId },
  })
```

---

### 3.7 admin.events (`src/server/routers/admin/events.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.events.list` | `adminProcedure.query` | `EventErrorListInput` | `{ errors: EventErrorGroup[], totalUnresolved: number }` | §7 | Failed events grouped by `consumerId`, filterable by date range |
| `admin.events.resolve` | `adminProcedure.mutation` | `{ errorId: uuid }` | `void` | §7 | Mark error as resolved. Sets `resolved = true`, `resolvedAt = now()` [S0-11]. |
| `admin.events.retry` | `adminProcedure.mutation` | `{ errorId: uuid }` | `void` | §7 | Re-emit the original event payload for reprocessing |

```typescript
const eventErrorListInput = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  consumerId: z.string().optional(),             // filter to specific consumer
  resolved: z.boolean().default(false),          // default: show unresolved only
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

// Grouped by consumerId for admin readability [SI §1.5 consumerId convention]
type EventErrorGroup = {
  consumerId: string                             // "{domain}:{eventType}:{actionName}"
  errorCount: number
  latestError: {
    id: UUID
    eventType: EventType
    payload: unknown
    error: string
    timestamp: ISO8601
    mode: "sync" | "async"
  }
  oldestUnresolved: ISO8601
}
```

**`admin.events.retry` — re-emission:**

```
admin.events.retry({ errorId }):
  errorRecord = getEventConsumerError(errorId)
  // Re-emit the stored payload through the event bus
  // The original consumer will fire again
  emit(errorRecord.eventType, errorRecord.payload)
  // Mark as resolved — if it fails again, a new error row is created
  update event_consumer_errors SET resolved = true, resolvedAt = now() WHERE id = errorId
```

---

### 3.8 admin.health (`src/server/routers/admin/health.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.health.getStatus` | `adminProcedure.query` | none | `PlatformHealthStatus` | §8 | Aggregated health signals |

```typescript
type PlatformHealthStatus = {
  overall: "healthy" | "degraded" | "unhealthy"
  signals: HealthSignal[]
}

type HealthSignal = {
  name: string                                   // e.g., "billing_reconciliation", "event_consumer_errors", "deferred_action_failures"
  status: "healthy" | "warning" | "critical"
  detail: string                                 // human-readable summary
  lastChecked: ISO8601
}
```

**Health signal sources:**

```
admin.health.getStatus():
  signals = []

  // 1. Billing reconciliation — from billing_reconciliation_status [D6]
  billingStatus = getBillingReconciliationStatus()
  signals.push(mapBillingToSignal(billingStatus))

  // 2. Event consumer errors — COUNT unresolved in last 24h
  unresolvedErrors = count(event_consumer_errors WHERE resolved = false AND timestamp > now() - 24h)
  signals.push({ name: "event_consumer_errors", status: unresolvedErrors > 10 ? "critical" : unresolvedErrors > 0 ? "warning" : "healthy", ... })

  // 3. Deferred action failures — COUNT status = "exhausted" in last 24h
  exhaustedActions = count(deferred_actions WHERE status = "exhausted" AND updated_at > now() - 24h)
  signals.push({ name: "deferred_action_failures", status: exhaustedActions > 0 ? "warning" : "healthy", ... })

  // 4. Orchestrated flow failures — COUNT status = "failed" OR "escalated"
  failedFlows = count(orchestrated_flows WHERE status IN ("failed", "escalated"))
  signals.push({ name: "orchestrated_flows", status: failedFlows > 0 ? "critical" : "healthy", ... })

  // 5. Paddle webhook silence — check last subscription event timestamp
  // Warning if no Paddle events in 48h (expected daily at V1 scale)

  overall = signals.some(s => s.status === "critical") ? "unhealthy"
          : signals.some(s => s.status === "warning") ? "degraded"
          : "healthy"

  return { overall, signals }
```

---

### 3.9 admin.friction (`src/server/routers/admin/friction.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.friction.getSummary` | `adminProcedure.query` | `{ period: "30d" \| "90d" \| "365d" }` | `FeatureGateFrictionSummary` | §12 | Friction ratios per feature gate. Resolves S4-7. |

```typescript
// Implements Ops §3.4: getFeatureGateFrictionSummary
type FeatureGateFrictionSummary = {
  period: string
  gates: {
    gateName: string                             // e.g., "trendAnalytics", "topSearchTerms"
    ticketCount: number                          // support_tickets WHERE category = 'feature_gating_confusion' AND details->>'gate' = gateName
    totalTickets: number                         // all tickets in period
    frictionRatio: number                        // ticketCount / totalTickets
  }[]
}
```

**UI surface:** Friction summary is displayed on the `/admin/health` page as a sub-section. No dedicated friction page — the data volume at V1 (~50 tickets/month) does not warrant a standalone view. The route is separate for query interface compliance with Ops §3.4.

---

### 3.10 admin.refunds (`src/server/routers/admin/refunds.ts`)

| Route | Procedure | Input | Return | Section | Description |
|-------|-----------|-------|--------|---------|-------------|
| `admin.refunds.list` | `adminProcedure.query` | `{ status?: "pending" \| "approved" \| "denied", cursor?: string }` | `{ refunds: RefundRow[], nextCursor? }` | §13 | Refund requests pending evaluation |
| `admin.refunds.evaluate` | `adminProcedure.mutation` | `{ ticketId: uuid, decision: "approve" \| "deny", reason: string }` | `void` | §13 | Approve or deny refund. Calls Paddle API on approval. Resolves S4-8. |

```typescript
type RefundRow = {
  ticketId: UUID                                 // refund requests are support tickets with category = "refund_request"
  accountEmail: string | null
  listingName: string | null
  subscriptionTier: SubscriptionTier | null
  requestedAt: ISO8601
  status: "pending" | "approved" | "denied"
}
```

**`admin.refunds.evaluate` — approval path:**

```
admin.refunds.evaluate({ ticketId, decision, reason }):
  ticket = getTicket(ticketId)

  if decision === "approve":
    // Look up active subscription for the listing
    subscription = getSubscription(ticket.listingId)
    // Cancel via Paddle API — imported from SI §10.1 PaymentService (P4)
    PaymentService.cancelSubscription({
      paddleSubscriptionId: subscription.paddleSubscriptionId,
      reason: "admin_refund: " + reason,
      effectiveFrom: "immediately",
    })

  // Update ticket
  update support_tickets SET status = "resolved", resolvedAt = now()

  // Decision log [SI §9]
  logDecision({
    domain: "operations",
    decisionType: "refund_evaluation",
    inputs: { ticketId, subscriptionTier: subscription?.tier },
    output: { decision, reason },
    entityContext: { accountId: ticket.accountId, listingId: ticket.listingId },
  })
```

---

## 4. Rendering Strategy

All admin pages use CSR (client-side rendering). No SSG or ISR for any `/admin/*` route. [Source: SI §7.1]

| Page | Strategy | Rationale |
|------|----------|-----------|
| All `/admin/*` routes | CSR | Authenticated, role-guarded, no SEO value. Data is always fresh and user-specific. Interactive controls (retry, skip, resolve) require client-side state. |

---

## 5. Route-to-Skeleton Section Mapping

| Skeleton Section | Primary Routes | Backend-Only Notes |
|-----------------|---------------|-------------------|
| §1 Admin Dashboard | `admin.dashboard.getOverview` | Aggregates from all other sections |
| §2 Support Triage | `admin.support.*` (5 routes) | Creates notifications for admin via existing `Notification` table [D4] |
| §3 TaskSpec Queue | `admin.tasks.*` (5 routes) | Completion callback to S3 `applyVerificationUpgrade` [S3-6] |
| §4 Billing Reconciliation | `admin.billing.*` (4 routes) | Reconciliation handler is deferred action, not a route |
| §5 Compliance Management | `admin.compliance.*` (4 routes) | DSAR acknowledgment/completion emails triggered from `updateStatus` |
| §6 Orchestrated Flow Admin | `admin.flows.*` (5 routes) | Skip constraint matrix enforced server-side per SI §3.5 |
| §7 Failed Event Admin | `admin.events.*` (3 routes) | Groups by `consumerId` convention [SI §1.5] |
| §8 Platform Health | `admin.health.getStatus` | Aggregates 5 health signal sources |
| §9 Event Consumers | No routes | 13 handler registrations in `EVENT_CONSUMER_MATRIX` — code-only |
| §10 Registries | No dedicated routes | Churn risk: joined in `admin.support.getDetail`. Pending cancellation: read during billing reconciliation handler. |
| §11 Email Delivery | No dedicated routes | Win-back + decay warning sends happen in event consumer handlers (§9). DSAR emails triggered from `admin.compliance.updateStatus`. |
| §12 Feature Gate Friction | `admin.friction.getSummary` | Displayed as sub-section on `/admin/health` page |
| §13 Refund Processing | `admin.refunds.*` (2 routes) | Calls `PaymentService.cancelSubscription` (P4 import) |

---

## 6. Router File Organization

```
src/server/routers/admin/
├── index.ts                           # Merges all admin sub-routers
├── dashboard.ts                       # admin.dashboard.*
├── support.ts                         # admin.support.*
├── tasks.ts                           # admin.tasks.*
├── billing.ts                         # admin.billing.*
├── compliance.ts                      # admin.compliance.*
├── flows.ts                           # admin.flows.*
├── events.ts                          # admin.events.*
├── health.ts                          # admin.health.*
├── friction.ts                        # admin.friction.*
└── refunds.ts                         # admin.refunds.*
```

```typescript
// src/server/routers/admin/index.ts
export const adminRouter = router({
  dashboard: dashboardRouter,
  support: supportRouter,
  tasks: tasksRouter,
  billing: billingRouter,
  compliance: complianceRouter,
  flows: flowsRouter,
  events: eventsRouter,
  health: healthRouter,
  friction: frictionRouter,
  refunds: refundsRouter,
})
```

**Total routes:** 34 (all `adminProcedure`). 14 queries, 20 mutations. No public or `protectedProcedure` routes in S7.

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| `shared-infrastructure.md` (v6) | §3.5 skip constraint matrix (flow admin), §4.1 `AuthSession` type (admin guard), §7.1 CSR for admin pages, §9 decision logging, §10.1 `PaymentService` (refunds) |
| `operations.md` (v3) | §2 TaskSpec standard (task detail), §3 query interfaces (5 implementations), §4 support triage |
| `slices/slice-03-claim-verify.md` (v2) | S3-6: `applyVerificationUpgrade` completion callback |
| `slices/slice-04-subscriptions.md` (v2) | S4-6 billing monitoring, S4-7 friction tracking, S4-8 refund processing |
| `slices/slice-05-provider-experience.md` (v2) | Route organization pattern (§1), `getNotifications` query reuse |
| `s7-drafting/01-decisions.md` | D1 SLA breach warning, D2 contractor email deferred, D4 existing Notification table, D6 single-row billing status, D7 separate hold queries |
