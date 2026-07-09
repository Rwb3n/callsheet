import { describe, it, expect } from "vitest"
import { buildClosureSteps } from "../closure"
import type { ClosureFlowDeps } from "../closure"

// AC-23 — unit tests for closure flow step definitions

const EXPECTED_STEP_NAMES = [
  "archive_listings",
  "cancel_paddle_subscriptions",
  "anonymise_enquiry_data",
  "delete_defer_buyer_data",
  "deactivate_account",
  "emit_account_closed",
]

const EXPECTED_SKIPPABLE = [false, true, true, true, false, true]

// Minimal deps stub — only needed to build step definitions, not execute them
const stubDeps = {} as ClosureFlowDeps

describe("CLOSURE_FLOW_STEPS", () => {
  const steps = buildClosureSteps(stubDeps)

  it("AC-23: contains exactly 6 steps in the correct order", () => {
    expect(steps).toHaveLength(6)
    expect(steps.map((s) => s.name)).toEqual(EXPECTED_STEP_NAMES)
  })

  it("AC-23: each step has domain platform", () => {
    for (const step of steps) {
      expect(step.domain).toBe("platform")
    }
  })

  it("AC-23: skippable flags match spec SI §3.5", () => {
    expect(steps.map((s) => s.skippable)).toEqual(EXPECTED_SKIPPABLE)
  })

  it("AC-23: all step executors are functions", () => {
    for (const step of steps) {
      expect(typeof step.execute).toBe("function")
    }
  })
})
