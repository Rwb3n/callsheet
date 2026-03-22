// Admin compliance router integration tests — CS-WORK-060
// AC-5.5: DSAR creation sends dsar_acknowledgment email
// AC-5.6: DSAR completion sends dsar_completion email
// AC-5.7: DSAR deadline defaults to receivedAt + 30 days
// AC-5.10: every create and updateStatus produces a decision_logs entry

import { describe, it, expect, beforeEach } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import {
  seedTestUser,
  makeUUID,
  makeAdminSession,
  makeSession,
  ctx,
  createSchedulerDb,
  createDecisionLogDb,
} from "@/db/test-fixtures"
import { complianceRegister } from "@/db/schema/operations"
import { decisionLogs } from "@/db/schema/shared"
import { eq, sql } from "drizzle-orm"
import { createAdminComplianceRouter } from "../admin/compliance"
import { InMemoryEmailService } from "@/lib/email/transport"
import { registerTemplate, hasTemplate } from "@/lib/email/templates"

// Ensure templates are registered for tests
if (!hasTemplate("dsar_acknowledgment")) {
  registerTemplate("dsar_acknowledgment", (data) => ({
    subject: `DSAR acknowledgment — ${data.dsarId}`,
    html: `<p>DSAR ${data.dsarId} received on ${data.receivedAt}.</p>`,
  }))
}
if (!hasTemplate("dsar_completion")) {
  registerTemplate("dsar_completion", (data) => ({
    subject: `DSAR complete — ${data.dsarId}`,
    html: `<p>DSAR ${data.dsarId} completed.</p>`,
  }))
}

const db = getTestDb()
const ADMIN_ID = makeUUID("admin01")
const USER_ID = makeUUID("user001")

let emailService: InMemoryEmailService

function createRouter() {
  emailService = new InMemoryEmailService()
  return createAdminComplianceRouter({
    db,
    decisionLogDb: createDecisionLogDb(db),
    emailService,
  })
}

beforeEach(async () => {
  await resetDb()
  await seedTestUser(db, ADMIN_ID, "admin@callsheet.co.uk")
  await seedTestUser(db, USER_ID, "user@example.com")
})

describe("admin.compliance.create", () => {
  it("AC-5.7: DSAR deadline defaults to receivedAt + 30 days when not provided", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "dsar", accountId: USER_ID })

    const [entry] = await db
      .select({ deadline: complianceRegister.deadline, receivedAt: complianceRegister.receivedAt })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entryId))

    expect(entry.deadline).toBeDefined()
    expect(entry.receivedAt).toBeDefined()

    const daysDiff = Math.round(
      (entry.deadline!.getTime() - entry.receivedAt!.getTime()) / (24 * 60 * 60 * 1000),
    )
    expect(daysDiff).toBe(30)
  })

  it("AC-5.5: creating a DSAR entry sends dsar_acknowledgment email", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar", accountId: USER_ID })

    const sent = emailService.getCalls()
    expect(sent).toHaveLength(1)
    expect(sent[0].template).toBe("dsar_acknowledgment")
    expect(sent[0].to).toBe("user@example.com")
  })

  it("AC-5.5: DSAR without accountId does not send email", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar" })

    const sent = emailService.getCalls()
    expect(sent).toHaveLength(0)
  })

  it("AC-5.10: create produces a decision_logs entry", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar", accountId: USER_ID })

    const [log] = await db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.decisionType, "compliance_scheduling"))

    expect(log).toBeDefined()
    expect(log.domain).toBe("operations")
    expect(log.accountId).toBe(ADMIN_ID)
  })

  it("creates erasure entries with status = completed", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "erasure" })

    const [entry] = await db
      .select({ status: complianceRegister.status, completedAt: complianceRegister.completedAt })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entryId))

    expect(entry.status).toBe("completed")
    expect(entry.completedAt).toBeDefined()
  })

  it("creates complaint entries with status = open", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "complaint", accountId: USER_ID })

    const [entry] = await db
      .select({ status: complianceRegister.status })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entryId))

    expect(entry.status).toBe("open")
  })

  it("non-admin users are rejected", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeSession({ accountId: USER_ID })))

    await expect(caller.create({ type: "dsar" })).rejects.toThrow()
  })
})

describe("admin.compliance.updateStatus", () => {
  it("AC-5.6: transitioning DSAR to completed sends dsar_completion email", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "dsar", accountId: USER_ID })
    emailService.clear()

    await caller.updateStatus({ entryId, status: "completed" })

    const sent = emailService.getCalls()
    expect(sent).toHaveLength(1)
    expect(sent[0].template).toBe("dsar_completion")
    expect(sent[0].to).toBe("user@example.com")
  })

  it("AC-5.6: non-DSAR completion does not send dsar_completion email", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "complaint", accountId: USER_ID })
    emailService.clear()

    await caller.updateStatus({ entryId, status: "completed" })

    const sent = emailService.getCalls()
    expect(sent).toHaveLength(0)
  })

  it("AC-5.10: updateStatus produces a decision_logs entry", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "complaint" })

    // Clear decision logs from create
    await db.delete(decisionLogs)

    await caller.updateStatus({ entryId, status: "in_progress", notes: "Work started" })

    const logs = await db.select().from(decisionLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0].decisionType).toBe("compliance_scheduling")
    expect((logs[0].output as Record<string, unknown>).newStatus).toBe("in_progress")
    expect((logs[0].output as Record<string, unknown>).notes).toBe("Work started")
  })

  it("idempotent: same status transition is a no-op", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "complaint" })
    await db.delete(decisionLogs)

    await caller.updateStatus({ entryId, status: "open" })

    // No decision log for idempotent transition
    const logs = await db.select().from(decisionLogs)
    expect(logs).toHaveLength(0)
  })

  it("sets completedAt when transitioning to completed", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "investigation" })

    await caller.updateStatus({ entryId, status: "completed" })

    const [entry] = await db
      .select({ completedAt: complianceRegister.completedAt })
      .from(complianceRegister)
      .where(eq(complianceRegister.id, entryId))

    expect(entry.completedAt).toBeDefined()
  })
})

describe("admin.compliance.list", () => {
  it("returns paginated entries filtered by type", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar", accountId: USER_ID })
    await caller.create({ type: "complaint" })
    await caller.create({ type: "dsar", accountId: USER_ID })

    const result = await caller.list({ type: "dsar" })
    expect(result.entries).toHaveLength(2)
    for (const entry of result.entries) {
      expect(entry.type).toBe("dsar")
    }
  })

  it("returns paginated entries filtered by status", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar", accountId: USER_ID })
    await caller.create({ type: "erasure" })

    const result = await caller.list({ status: "completed" })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("erasure")
  })

  it("joins account email", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await caller.create({ type: "dsar", accountId: USER_ID })

    const result = await caller.list({})
    expect(result.entries[0].accountEmail).toBe("user@example.com")
  })
})

describe("admin.compliance.getDetail", () => {
  it("returns entry detail with hasComplianceHold derived field", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "dsar", accountId: USER_ID })

    const detail = await caller.getDetail({ entryId })

    expect(detail.type).toBe("dsar")
    expect(detail.hasComplianceHold).toBe(true)
    expect(detail.accountEmail).toBe("user@example.com")
  })

  it("hasComplianceHold is false for non-hold-creating types", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    const { entryId } = await caller.create({ type: "obligation" })

    const detail = await caller.getDetail({ entryId })
    expect(detail.hasComplianceHold).toBe(false)
  })

  it("returns NOT_FOUND for non-existent entry", async () => {
    const router = createRouter()
    const caller = router.createCaller(ctx(makeAdminSession(ADMIN_ID)))

    await expect(
      caller.getDetail({ entryId: makeUUID("nonexistent") }),
    ).rejects.toThrow()
  })
})
