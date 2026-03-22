// compliance_schedule_check handler integration tests — CS-WORK-060 AC-5.3
// Creates notifications for entries within 7 days. Marks overdue. Self-perpetuates.

import { describe, it, expect, beforeEach } from "vitest"
import { getTestDb, resetDb } from "@/db/test-utils"
import {
  seedTestUser,
  createSchedulerDb,
  createDecisionLogDb,
  InMemoryNotificationDb,
} from "@/db/test-fixtures"
import { complianceRegister } from "@/db/schema/operations"
import { deferredActions } from "@/db/schema/shared"
import { eq, and } from "drizzle-orm"
import { ActionHandlerRegistry } from "@/lib/scheduler"
import { registerComplianceScheduleCheckHandler } from "../compliance-schedule-check"
import { invokeHandler } from "./invoke-handler"

const db = getTestDb()
const ADMIN_ID = "admin-schedule-test"

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
  registerComplianceScheduleCheckHandler(registry, {
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

describe("compliance_schedule_check", () => {
  it("AC-5.3: creates compliance_deadline notification for entries within 7 days", async () => {
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    await db.insert(complianceRegister).values({
      type: "dsar",
      status: "open",
      receivedAt: new Date(),
      deadline,
    })

    await invokeHandler(registry, "compliance_schedule_check", {})

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe("compliance_deadline")
    expect(notifications[0].accountId).toBe(ADMIN_ID)
    expect(notifications[0].title).toContain("dsar")
  })

  it("AC-5.3: does not create notification for entries with deadline > 7 days away", async () => {
    const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // 10 days
    await db.insert(complianceRegister).values({
      type: "dsar",
      status: "open",
      receivedAt: new Date(),
      deadline,
    })

    await invokeHandler(registry, "compliance_schedule_check", {})

    const notifications = notificationDb.getAll()
    expect(notifications).toHaveLength(0)
  })

  it("AC-5.3: marks overdue entries", async () => {
    const pastDeadline = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
    const [entry] = await db.insert(complianceRegister).values({
      type: "dsar",
      status: "open",
      receivedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      deadline: pastDeadline,
    }).returning()

    await invokeHandler(registry, "compliance_schedule_check", {})

    const [updated] = await db
      .select({ status: complianceRegister.status })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entry.id))

    expect(updated.status).toBe("overdue")
  })

  it("AC-5.3: self-perpetuates with 24h delay", async () => {
    await invokeHandler(registry, "compliance_schedule_check", {})

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].action).toBe("compliance_schedule_check")

    const delayMs = scheduled[0].executeAt.getTime() - Date.now()
    const delayHours = delayMs / (60 * 60 * 1000)
    expect(delayHours).toBeGreaterThan(23)
    expect(delayHours).toBeLessThan(25)
  })

  it("does not mark completed entries as overdue", async () => {
    const pastDeadline = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const [entry] = await db.insert(complianceRegister).values({
      type: "dsar",
      status: "completed",
      receivedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      deadline: pastDeadline,
      completedAt: new Date(),
    }).returning()

    await invokeHandler(registry, "compliance_schedule_check", {})

    const [updated] = await db
      .select({ status: complianceRegister.status })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entry.id))

    expect(updated.status).toBe("completed")
  })
})
