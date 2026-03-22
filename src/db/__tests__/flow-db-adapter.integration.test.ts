// FlowDb Drizzle adapter — round-trip integration test.
// Verifies insert → findById → update against real Postgres.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
import { getTestDb, resetDb, closeTestDb } from "@/db/test-utils"
import { createFlowDb } from "@/db/adapters"
import type { FlowDb } from "@/lib/flows"
import type { OrchestratedFlowStep } from "@/lib/flows"

let db: ReturnType<typeof getTestDb>
let flowDb: FlowDb

beforeAll(() => {
  db = getTestDb()
})

beforeEach(async () => {
  await resetDb()
  flowDb = createFlowDb(db)
})

afterAll(async () => {
  await closeTestDb()
})

const STEPS: OrchestratedFlowStep[] = [
  { name: "step-1", domain: "platform", status: "pending", attempt: 0, retryable: true, skippable: false },
  { name: "step-2", domain: "data-and-listings", status: "pending", attempt: 0, retryable: true, skippable: true },
]

describe("createFlowDb", () => {
  it("insert returns a UUID id", async () => {
    const id = await flowDb.insert({
      flowType: "closure",
      triggeredBy: "account-text-id",
      status: "initiated",
      steps: STEPS,
      currentStep: 0,
      context: { accountId: "account-text-id" },
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("findById returns the inserted row with correct types", async () => {
    const id = await flowDb.insert({
      flowType: "closure",
      triggeredBy: "test-account",
      status: "initiated",
      steps: STEPS,
      currentStep: 0,
      context: { foo: "bar" },
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const row = await flowDb.findById(id)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(id)
    expect(row!.flowType).toBe("closure")
    expect(row!.triggeredBy).toBe("test-account")
    expect(row!.status).toBe("initiated")
    expect(row!.steps).toHaveLength(2)
    expect(row!.steps[0].name).toBe("step-1")
    expect(row!.steps[1].skippable).toBe(true)
    expect(row!.currentStep).toBe(0)
    expect(row!.context).toEqual({ foo: "bar" })
    expect(row!.startedAt).toBeInstanceOf(Date)
    expect(row!.createdAt).toBeInstanceOf(Date)
    expect(row!.completedAt).toBeNull()
  })

  it("findById returns null for non-existent id", async () => {
    const row = await flowDb.findById("00000000-0000-4000-8000-000000000000")
    expect(row).toBeNull()
  })

  it("update modifies specific fields", async () => {
    const id = await flowDb.insert({
      flowType: "closure",
      triggeredBy: "test-account",
      status: "initiated",
      steps: STEPS,
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const updatedSteps = [...STEPS]
    updatedSteps[0] = { ...updatedSteps[0], status: "completed", completedAt: new Date().toISOString() }

    await flowDb.update(id, {
      status: "in_progress",
      steps: updatedSteps,
      currentStep: 1,
      context: { listingsArchived: ["abc"] },
    })

    const row = await flowDb.findById(id)
    expect(row!.status).toBe("in_progress")
    expect(row!.currentStep).toBe(1)
    expect(row!.steps[0].status).toBe("completed")
    expect(row!.context).toEqual({ listingsArchived: ["abc"] })
  })

  it("update sets completedAt and escalation fields", async () => {
    const id = await flowDb.insert({
      flowType: "erasure",
      triggeredBy: "admin-1",
      status: "initiated",
      steps: STEPS,
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const now = new Date()
    await flowDb.update(id, {
      status: "escalated",
      escalatedAt: now,
      escalationReason: "step failed 3 times",
    })

    const row = await flowDb.findById(id)
    expect(row!.status).toBe("escalated")
    expect(row!.escalatedAt).toEqual(now)
    expect(row!.escalationReason).toBe("step failed 3 times")
  })

  it("accepts text triggeredBy (not restricted to UUID format)", async () => {
    const id = await flowDb.insert({
      flowType: "closure",
      triggeredBy: "better-auth-text-id-not-uuid",
      status: "initiated",
      steps: [],
      currentStep: 0,
      context: {},
      startedAt: new Date(),
      completedAt: null,
      deadline: null,
      escalatedAt: null,
      escalationReason: null,
    })

    const row = await flowDb.findById(id)
    expect(row!.triggeredBy).toBe("better-auth-text-id-not-uuid")
  })
})
