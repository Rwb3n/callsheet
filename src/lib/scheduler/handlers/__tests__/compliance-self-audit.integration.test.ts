// compliance_self_audit handler integration tests — CS-WORK-060 AC-5.4
// Checks data retention, GDPR register completeness, DSAR status. Escalates on failure.

import { describe, it, expect, beforeEach } from "vitest"
import { getTestDb, resetDb } from "@/db/test-utils"
import {
  seedTestUser,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
  createTestListing,
} from "@/db/test-fixtures"
import { complianceRegister } from "@/db/schema/operations"
import { deferredActions, decisionLogs } from "@/db/schema/shared"
import { eq, and } from "drizzle-orm"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { registerComplianceSelfAuditHandler } from "../compliance-self-audit"
import { invokeHandler } from "./invoke-handler"

const db = getTestDb()
const ADMIN_ID = "admin-audit-test"

let notificationDb: InMemoryNotificationDb
let registry: ActionHandlerRegistry
let scheduled: Array<{ action: string; params: Record<string, unknown>; executeAt: Date }>

function setup() {
  notificationDb = new InMemoryNotificationDb()
  scheduled = []
  const schedulerDb = {
    insert: async (row: Record<string, unknown>) => {
      scheduled.push(row as { action: string; params: Record<string, unknown>; executeAt: Date })
      return "test-id"
    },
    cancelMatching: async () => 0,
    findPending: async () => null,
  }

  registry = new ActionHandlerRegistry()
  registerComplianceSelfAuditHandler(registry, {
    db,
    schedulerDb,
    decisionLogDb: createDecisionLogDb(db),
    notificationDb,
    adminAccountId: ADMIN_ID,
  })
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID)
  setup()
})

describe("compliance_self_audit", () => {
  it("AC-5.4: passes when all checks are healthy", async () => {
    // Seed a recent search_history_cleanup completion
    await db.insert(deferredActions).values({
      action: "search_history_cleanup",
      params: {},
      executeAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "test",
      status: "completed",
      attempts: 1,
      completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    })

    await invokeHandler(registry, "compliance_self_audit", {})

    // No failure notification
    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(0)

    // Decision log records passed audit
    const logs = await db.select().from(decisionLogs)
    const auditLog = logs.find((l) => l.decisionType === "compliance_self_audit")
    expect(auditLog).toBeDefined()
    expect((auditLog!.output as Record<string, unknown>).passed).toBe(true)
  })

  it("AC-5.4: escalates when search_history_cleanup has not run in 48h", async () => {
    // No search_history_cleanup completed at all
    await invokeHandler(registry, "compliance_self_audit", {})

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain("Compliance self-audit failures")
    expect(notifications[0].body).toContain("search_history_cleanup")
  })

  it("AC-5.4: escalates when urgent DSARs are still in open status", async () => {
    // Seed a recent cleanup so that check passes
    await db.insert(deferredActions).values({
      action: "search_history_cleanup",
      params: {},
      executeAt: new Date(),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "test",
      status: "completed",
      attempts: 1,
      completedAt: new Date(),
    })

    // DSAR with deadline in 3 days still at status: open
    await db.insert(complianceRegister).values({
      type: "dsar",
      status: "open",
      receivedAt: new Date(Date.now() - 27 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    })

    await invokeHandler(registry, "compliance_self_audit", {})

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].body).toContain("DSARs approaching deadline")
  })

  it("AC-5.4: self-perpetuates with 24h delay", async () => {
    await db.insert(deferredActions).values({
      action: "search_history_cleanup",
      params: {},
      executeAt: new Date(),
      retryPolicy: "once",
      onFailure: "log",
      createdBy: "test",
      status: "completed",
      attempts: 1,
      completedAt: new Date(),
    })

    await invokeHandler(registry, "compliance_self_audit", {})

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].action).toBe("compliance_self_audit")

    const delayMs = scheduled[0].executeAt.getTime() - Date.now()
    const delayHours = delayMs / (60 * 60 * 1000)
    expect(delayHours).toBeGreaterThan(23)
    expect(delayHours).toBeLessThan(25)
  })

  it("AC-5.4: logs decision with audit results", async () => {
    await invokeHandler(registry, "compliance_self_audit", {})

    const logs = await db.select().from(decisionLogs)
    const auditLog = logs.find((l) => l.decisionType === "compliance_self_audit")
    expect(auditLog).toBeDefined()
    expect((auditLog!.output as Record<string, unknown>).passed).toBe(false)
    expect((auditLog!.output as Record<string, unknown>).failures).toBeInstanceOf(Array)
  })
})
