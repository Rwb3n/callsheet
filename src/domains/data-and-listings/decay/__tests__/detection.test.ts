import { describe, it, expect, vi } from "vitest"
import {
  computeSeverityEscalation,
  evaluateDecayResponse,
  getApplicableCheckTypes,
  evaluateEnrichmentCadenceAdjustment,
} from "../detection"
import type { DecaySignal } from "../detection"
import type { LivenessServices } from "../liveness-services"

// --- Stub factories ---

function stubLivenessServices(overrides?: Partial<LivenessServices>): LivenessServices {
  return {
    website: { checkUrl: vi.fn(async () => ({ status: 200 })) },
    email: {
      checkMx: vi.fn(async () => ({ records: ["mx.example.com"] })),
      probeMailbox: vi.fn(async () => ({ status: "valid" as const })),
    },
    companiesHouse: { getCompany: vi.fn(async () => ({ status: "active", name: "Test Ltd" })) },
    social: { checkUrl: vi.fn(async () => ({ status: 200 })) },
    postcode: { validate: vi.fn(async () => ({ status: "valid" as const })) },
    ...overrides,
  }
}

function makeSignal(overrides?: Partial<DecaySignal>): DecaySignal {
  return {
    signalType: "website_dead",
    severity: "high",
    checkDetails: { url: "https://example.com", httpStatus: 500 },
    ...overrides,
  }
}

function makeDeps() {
  return {
    updateSignal: vi.fn<(id: string, checkDetails: Record<string, unknown>) => Promise<void>>(async () => {}),
    insertSignal: vi.fn<(signal: { listingId: string; signalType: string; severity: string; checkDetails: Record<string, unknown> }) => Promise<string>>(async () => "signal-1"),
    logDecision: vi.fn<(params: { domain: string; decisionType: string; inputs: Record<string, unknown>; output: Record<string, unknown>; listingId: string }) => Promise<void>>(async () => {}),
    emitEvent: vi.fn<(event: unknown) => Promise<void>>(async () => {}),
  }
}

// --- AC-27: severity escalation ---

describe("computeSeverityEscalation", () => {
  it("escalates website_dead to critical when email_bounced is active", () => {
    const result = computeSeverityEscalation("website_dead", true)
    expect(result).toBe("critical")
  })

  it("escalates email_bounced to critical when website_dead is active", () => {
    const result = computeSeverityEscalation("email_bounced", true)
    expect(result).toBe("critical")
  })

  it("does not escalate when no paired signal exists", () => {
    const result = computeSeverityEscalation("website_dead", false)
    expect(result).toBe("high")
  })
})

// --- AC-28: duplicate suppression ---

describe("evaluateDecayResponse — duplicate suppression", () => {
  it("updates existing signal checkDetails instead of inserting when same type unresolved", async () => {
    const deps = makeDeps()
    const result = await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal(),
      existingSignals: [{ id: "existing-1", signalType: "website_dead", resolvedAt: null, checkDetails: {} }],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(result.action).toBe("suppress")
    expect(deps.updateSignal).toHaveBeenCalledWith("existing-1", expect.any(Object))
    expect(deps.insertSignal).not.toHaveBeenCalled()
    expect(deps.emitEvent).not.toHaveBeenCalled()
  })

  it("inserts new signal when no unresolved signal of same type exists", async () => {
    const deps = makeDeps()
    const result = await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal({ severity: "critical" }),
      existingSignals: [],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(result.action).toBe("warn_immediately")
    expect(deps.insertSignal).toHaveBeenCalled()
    expect(deps.updateSignal).not.toHaveBeenCalled()
  })
})

// --- AC-29: active ticket suppression ---

describe("evaluateDecayResponse — active ticket suppression", () => {
  it("suppresses notification and event when active support ticket exists", async () => {
    const deps = makeDeps()
    const result = await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal({ severity: "critical" }),
      existingSignals: [],
      hasActiveSupportTicket: { ticketId: "ticket-1", category: "decay", openedAt: new Date() },
      deps,
    })

    expect(result.action).toBe("suppress")
    expect(result.notificationSent).toBe(false)
    expect(deps.emitEvent).not.toHaveBeenCalled()
    expect(deps.insertSignal).toHaveBeenCalled()
  })

  it("does not suppress when no active ticket", async () => {
    const deps = makeDeps()
    const result = await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal({ severity: "critical" }),
      existingSignals: [],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(result.action).not.toBe("suppress")
    expect(deps.emitEvent).toHaveBeenCalled()
  })
})

// --- AC-30: enrichment check type counts ---

describe("getApplicableCheckTypes", () => {
  it("paid tier: 6 check types", () => {
    const types = getApplicableCheckTypes("paid")
    expect(types).toHaveLength(6)
    expect(types).toEqual(expect.arrayContaining(["website", "email", "ch", "social", "postcode", "imdb"]))
  })

  it("claimed tier: 6 check types", () => {
    const types = getApplicableCheckTypes("claimed")
    expect(types).toHaveLength(6)
    expect(types).toEqual(expect.arrayContaining(["website", "email", "ch", "social", "postcode", "imdb"]))
  })

  it("unclaimed tier: 3 check types (website, email, ch)", () => {
    const types = getApplicableCheckTypes("unclaimed")
    expect(types).toHaveLength(3)
    expect(types).toEqual(expect.arrayContaining(["website", "email", "ch"]))
    expect(types).not.toContain("social")
    expect(types).not.toContain("postcode")
    expect(types).not.toContain("imdb")
  })
})

// --- AC-33: event payload shape ---

describe("evaluateDecayResponse — event payload", () => {
  it("emits decay_signal_detected with correct payload shape", async () => {
    const deps = makeDeps()
    await evaluateDecayResponse({
      listingId: "listing-42",
      signal: makeSignal({ signalType: "email_bounced", severity: "critical" }),
      existingSignals: [],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(deps.emitEvent).toHaveBeenCalledTimes(1)
    const emitted = deps.emitEvent.mock.calls[0][0]
    expect(emitted).toEqual({
      _brand: "DecaySignalDetectedEvent",
      listingId: "listing-42",
      signal: { type: "email_bounced", severity: "critical" },
    })
  })
})

// --- AC-34: decision logging ---

describe("evaluateDecayResponse — decision logging", () => {
  it("logs decay_response_evaluation for every invocation", async () => {
    const deps = makeDeps()
    await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal({ severity: "high" }),
      existingSignals: [],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(deps.logDecision).toHaveBeenCalled()
    const logCall = deps.logDecision.mock.calls[0][0]
    expect(logCall.decisionType).toBe("decay_response_evaluation")
    expect(logCall.listingId).toBe("listing-1")
  })

  it("logs duplicate_update action for duplicate signals", async () => {
    const deps = makeDeps()
    await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal(),
      existingSignals: [{ id: "existing-1", signalType: "website_dead", resolvedAt: null, checkDetails: {} }],
      hasActiveSupportTicket: null,
      deps,
    })

    expect(deps.logDecision).toHaveBeenCalled()
    const logCall = deps.logDecision.mock.calls[0][0]
    expect(logCall.output.action).toBe("duplicate_update")
  })

  it("logs suppress action when ticket active", async () => {
    const deps = makeDeps()
    await evaluateDecayResponse({
      listingId: "listing-1",
      signal: makeSignal(),
      existingSignals: [],
      hasActiveSupportTicket: { ticketId: "ticket-1", category: "decay", openedAt: new Date() },
      deps,
    })

    expect(deps.logDecision).toHaveBeenCalled()
    const logCall = deps.logDecision.mock.calls[0][0]
    expect(logCall.output.action).toBe("suppress")
  })
})

// --- AC-36: cadence adjustment ---

describe("evaluateEnrichmentCadenceAdjustment", () => {
  const baseMetrics = {
    falsePositiveRate: 0.10,
    signalDetectionRate: 0.05,
    averageCheckLatency: 200,
    costPerCheckBatch: 10,
  }

  it("recommends decrease when false positive rate > 30%", () => {
    const log = vi.fn()
    const result = evaluateEnrichmentCadenceAdjustment({
      tier: "paid",
      metrics: { ...baseMetrics, falsePositiveRate: 0.35 },
      logDecision: log,
    })

    expect(result.action).toBe("decrease_frequency")
    expect(log).toHaveBeenCalled()
  })

  it("recommends increase when signal detection rate > 15%", () => {
    const log = vi.fn()
    const result = evaluateEnrichmentCadenceAdjustment({
      tier: "claimed",
      metrics: { ...baseMetrics, signalDetectionRate: 0.20 },
      logDecision: log,
    })

    expect(result.action).toBe("increase_frequency")
    expect(log).toHaveBeenCalled()
  })

  it("escalates to principal when cost exceeds threshold", () => {
    const log = vi.fn()
    const result = evaluateEnrichmentCadenceAdjustment({
      tier: "unclaimed",
      metrics: { ...baseMetrics, costPerCheckBatch: 75 },
      logDecision: log,
    })

    expect(result.action).toBe("escalate_to_principal")
    expect(log).toHaveBeenCalled()
  })

  it("maintains when metrics within tolerance", () => {
    const log = vi.fn()
    const result = evaluateEnrichmentCadenceAdjustment({
      tier: "paid",
      metrics: baseMetrics,
      logDecision: log,
    })

    expect(result.action).toBe("maintain")
    expect(result.reason).toBe("all metrics within tolerance")
    expect(log).toHaveBeenCalled()
  })
})
