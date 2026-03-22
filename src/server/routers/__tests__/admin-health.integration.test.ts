// Admin health integration tests — CS-WORK-062 AC-8.1 through AC-8.10

import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { makeUUID, makeAdminSession, makeSession, ctx, seedTestUser } from "@/db/test-fixtures"
import { createAdminHealthRouter } from "@/server/routers/admin/health"
import { billingReconciliationStatus } from "@/db/schema/operations"
import { eventConsumerErrors, deferredActions, orchestratedFlows } from "@/db/schema/shared"

const db = getTestDb()
const router = createAdminHealthRouter({ db })

const ADMIN_ID = makeUUID("admin001")

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID, "admin@callsheet.test")
})

afterAll(async () => {
  await closeTestDb()
})

describe("admin.health.getStatus auth guard", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = router.createCaller(ctx(null))
    await expect(caller.getStatus()).rejects.toThrow("Authentication required")
  })

  it("rejects non-admin users", async () => {
    const userId = makeUUID("user001")
    await seedTestUser(db, userId, "user@callsheet.test")
    const caller = router.createCaller(ctx(makeSession({ accountId: userId, role: "user" })))
    await expect(caller.getStatus()).rejects.toThrow("Admin access required")
  })
})

describe("AC-8.1: returns 5 health signals with correct severity mapping", () => {
  it("returns exactly 5 signals on empty tables", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    expect(result.signals).toHaveLength(5)
    const names = result.signals.map(s => s.name)
    expect(names).toContain("billing_reconciliation")
    expect(names).toContain("event_consumer_errors")
    expect(names).toContain("deferred_action_failures")
    expect(names).toContain("orchestrated_flows")
    expect(names).toContain("paddle_webhook_silence")
  })

  it("each signal has name, status, detail, lastChecked", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    for (const signal of result.signals) {
      expect(signal.name).toBeDefined()
      expect(["healthy", "warning", "critical"]).toContain(signal.status)
      expect(typeof signal.detail).toBe("string")
      expect(signal.lastChecked).toBeDefined()
    }
  })
})

describe("AC-8.2: overall status worst-case aggregation", () => {
  it("returns healthy when all signals are healthy", async () => {
    // Insert healthy billing row + recent timestamp for Paddle silence signal
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "healthy",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()
    expect(result.overall).toBe("healthy")
  })

  it("returns degraded when any signal is warning (no critical)", async () => {
    // No billing row → billing defaults to warning, Paddle also warning
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const billingSignal = result.signals.find(s => s.name === "billing_reconciliation")
    expect(billingSignal?.status).toBe("warning")
    expect(result.overall).toBe("degraded")
  })

  it("returns unhealthy when any signal is critical", async () => {
    // Insert failed billing → critical
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "failed",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()
    expect(result.overall).toBe("unhealthy")
  })
})

describe("AC-8.3: billing reconciliation signal", () => {
  it("defaults to warning when no row exists", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "billing_reconciliation")!
    expect(signal.status).toBe("warning")
    expect(signal.detail).toBe("No reconciliation run recorded")
  })

  it("maps healthy status correctly", async () => {
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "healthy",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "billing_reconciliation")!
    expect(signal.status).toBe("healthy")
  })

  it("maps anomaly_detected to warning", async () => {
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "anomaly_detected",
      activeHolds: 1,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "billing_reconciliation")!
    expect(signal.status).toBe("warning")
  })

  it("maps failed to critical", async () => {
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "failed",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "billing_reconciliation")!
    expect(signal.status).toBe("critical")
  })
})

describe("AC-8.4: event consumer errors signal", () => {
  const baseError = {
    eventType: "test_event",
    consumerDomain: "platform",
    consumerId: "platform.test",
    payload: {},
    error: "Test error",
    mode: "async",
    resolved: false,
  }

  it("returns healthy with 0 unresolved errors", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "event_consumer_errors")!
    expect(signal.status).toBe("healthy")
  })

  it("returns warning with 1-10 unresolved errors in last 24h", async () => {
    await db.insert(eventConsumerErrors).values(
      Array.from({ length: 5 }, (_, i) => ({ ...baseError, consumerId: `platform.test${i}` })),
    )

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "event_consumer_errors")!
    expect(signal.status).toBe("warning")
    expect(signal.detail).toContain("5 unresolved")
  })

  it("returns critical with >10 unresolved errors in last 24h", async () => {
    await db.insert(eventConsumerErrors).values(
      Array.from({ length: 12 }, (_, i) => ({ ...baseError, consumerId: `platform.test${i}` })),
    )

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "event_consumer_errors")!
    expect(signal.status).toBe("critical")
  })

  it("excludes resolved errors from count", async () => {
    await db.insert(eventConsumerErrors).values([
      { ...baseError, consumerId: "platform.a", resolved: false },
      { ...baseError, consumerId: "platform.b", resolved: true },
    ])

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "event_consumer_errors")!
    expect(signal.status).toBe("warning")
    expect(signal.detail).toContain("1 unresolved")
  })
})

describe("AC-8.5: deferred action failures signal", () => {
  it("returns healthy with 0 exhausted actions", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "deferred_action_failures")!
    expect(signal.status).toBe("healthy")
  })

  it("returns warning with >0 exhausted actions in last 24h", async () => {
    await db.insert(deferredActions).values({
      action: "test_action",
      params: {},
      executeAt: new Date(),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "system",
      status: "exhausted",
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "deferred_action_failures")!
    expect(signal.status).toBe("warning")
    expect(signal.detail).toContain("1 exhausted")
  })

  it("excludes non-exhausted actions", async () => {
    await db.insert(deferredActions).values({
      action: "test_action",
      params: {},
      executeAt: new Date(),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "system",
      status: "completed",
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "deferred_action_failures")!
    expect(signal.status).toBe("healthy")
  })
})

describe("AC-8.6: orchestrated flow failures signal", () => {
  const baseFlow = {
    flowType: "erasure" as const,
    triggeredBy: ADMIN_ID,
    steps: [{ name: "step1", status: "pending" }],
    currentStep: 0,
    context: { accountId: ADMIN_ID },
  }

  it("returns healthy with 0 failed/escalated flows", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "orchestrated_flows")!
    expect(signal.status).toBe("healthy")
  })

  it("returns critical with failed flows", async () => {
    await db.insert(orchestratedFlows).values({
      ...baseFlow,
      status: "failed",
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "orchestrated_flows")!
    expect(signal.status).toBe("critical")
  })

  it("returns critical with escalated flows", async () => {
    await db.insert(orchestratedFlows).values({
      ...baseFlow,
      status: "escalated",
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "orchestrated_flows")!
    expect(signal.status).toBe("critical")
  })

  it("excludes completed/in_progress flows", async () => {
    await db.insert(orchestratedFlows).values([
      { ...baseFlow, status: "completed" },
      { ...baseFlow, status: "in_progress" },
    ])

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "orchestrated_flows")!
    expect(signal.status).toBe("healthy")
  })
})

describe("AC-8.7: Paddle webhook silence signal", () => {
  it("returns warning when no reconciliation row exists", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "paddle_webhook_silence")!
    expect(signal.status).toBe("warning")
  })

  it("returns healthy when last run is within 48h", async () => {
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: new Date(),
      status: "healthy",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "paddle_webhook_silence")!
    expect(signal.status).toBe("healthy")
  })

  it("returns warning when last run is >48h ago", async () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
    await db.insert(billingReconciliationStatus).values({
      lastRunAt: threeDaysAgo,
      status: "healthy",
      activeHolds: 0,
    })

    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const result = await caller.getStatus()

    const signal = result.signals.find(s => s.name === "paddle_webhook_silence")!
    expect(signal.status).toBe("warning")
  })
})

describe("AC-8.8: parallel execution performance", () => {
  it("completes in <500ms with empty tables", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))
    const start = Date.now()
    await caller.getStatus()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})

describe("AC-8.10: no persistent health history", () => {
  it("returns point-in-time status without storing results", async () => {
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    // Call twice — both return current state, no history accumulation
    const result1 = await caller.getStatus()
    const result2 = await caller.getStatus()

    // Both calls return equivalent structure (no stored delta between calls)
    expect(result1.signals).toHaveLength(5)
    expect(result2.signals).toHaveLength(5)
    expect(result1.overall).toBe(result2.overall)
  })
})
