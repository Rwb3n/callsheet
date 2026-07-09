import { describe, it, expect } from "vitest"
import { buildErasureSteps } from "../erasure"
import type { ErasureFlowDeps } from "../erasure"
import { EVENT_CONSUMER_MATRIX } from "@/lib/events/types"

// AC-1, AC-5 — unit tests for erasure flow step definitions

const EXPECTED_STEP_NAMES = [
  "verify_identity",
  "extract_account_data",
  "close_active_tickets",
  "process_erasure",
  "close_dsar_case",
  "emit_erasure_completed",
]

const EXPECTED_SKIPPABLE = [false, true, true, false, false, true]

// Minimal deps stub — only needed to build step definitions, not execute them
const stubDeps = {} as ErasureFlowDeps

describe("ERASURE_FLOW_STEPS", () => {
  const steps = buildErasureSteps(stubDeps)

  it("AC-1: contains exactly 6 steps in the correct order", () => {
    expect(steps).toHaveLength(6)
    expect(steps.map((s) => s.name)).toEqual(EXPECTED_STEP_NAMES)
  })

  it("AC-1: each step has the correct domain", () => {
    expect(steps[0].domain).toBe("operations")
    expect(steps[1].domain).toBe("operations")
    expect(steps[2].domain).toBe("operations")
    expect(steps[3].domain).toBe("data-and-listings")
    expect(steps[4].domain).toBe("operations")
    expect(steps[5].domain).toBe("data-and-listings")
  })

  it("AC-1: skippable flags match spec §3.5", () => {
    expect(steps.map((s) => s.skippable)).toEqual(EXPECTED_SKIPPABLE)
  })

  it("AC-5: EVENT_CONSUMER_MATRIX has no Ops entry for erasure_completed", () => {
    const consumers = EVENT_CONSUMER_MATRIX.erasure_completed
    // Verify no operations domain consumer exists (step 5 calls Ops directly, not via bus)
    const opsConsumers = consumers.filter((c) => (c.domain as string) === "operations")
    expect(opsConsumers).toHaveLength(0)
  })

  it("AC-5: all step executors are functions", () => {
    for (const step of steps) {
      expect(typeof step.execute).toBe("function")
    }
  })
})
