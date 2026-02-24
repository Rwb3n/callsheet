import { describe, it, expect, vi } from "vitest"
import { logDecision } from "../logger"
import type { DecisionLogDb } from "../logger"

function createMockDecisionDb(): DecisionLogDb & {
  insertedRows: Array<Record<string, unknown>>
} {
  const insertedRows: Array<Record<string, unknown>> = []
  return {
    insertedRows,
    insert: vi.fn(async (row) => {
      insertedRows.push(row)
      return "decision-1"
    }),
    findByDomainAndType: vi.fn(async (domain, decisionType) => {
      return insertedRows
        .filter((r) => r.domain === domain && r.decisionType === decisionType)
        .map((r, i) => ({ id: `decision-${i + 1}`, domain: r.domain as "data-and-listings", decisionType: r.decisionType as string }))
    }),
  }
}

describe("logDecision", () => {
  // AC-40: logDecision persists; queryable by domain + type
  it("persists a decision log and is queryable by domain and type", async () => {
    const db = createMockDecisionDb()

    const id = await logDecision(db, {
      domain: "data-and-listings",
      decisionType: "claim_evaluation",
      inputs: { companiesHouseNumber: "12345678", claimEmail: "info@example.co.uk" },
      output: { action: "auto_approve", assignedTier: "verified" },
      confidence: 0.92,
      listingId: "listing-1",
      accountId: "account-1",
    })

    expect(id).toBe("decision-1")
    expect(db.insertedRows).toHaveLength(1)
    expect(db.insertedRows[0]).toMatchObject({
      domain: "data-and-listings",
      decisionType: "claim_evaluation",
      confidence: 92, // 0.92 → 92 (stored as 0–100 integer)
      listingId: "listing-1",
      accountId: "account-1",
    })

    // Queryable by domain + type
    const results = await db.findByDomainAndType("data-and-listings", "claim_evaluation")
    expect(results).toHaveLength(1)
    expect(results[0].decisionType).toBe("claim_evaluation")
  })

  it("handles null confidence and optional fields", async () => {
    const db = createMockDecisionDb()

    await logDecision(db, {
      domain: "operations",
      decisionType: "support_triage",
      inputs: { ticketContent: "billing issue" },
      output: { priority: "medium", route: "billing-team" },
    })

    expect(db.insertedRows[0]).toMatchObject({
      confidence: null,
      listingId: null,
      accountId: null,
      additionalContext: null,
    })
  })
})
