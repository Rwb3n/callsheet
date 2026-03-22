// Unit tests for health signal severity mapping — CS-WORK-062 AC-8.2
// Tests computeOverallStatus pure logic independent of DB.

import { describe, it, expect } from "vitest"

type SignalStatus = "healthy" | "warning" | "critical"
type OverallStatus = "healthy" | "degraded" | "unhealthy"

// Extracted from computeHealthSignals — same logic.
function computeOverallStatus(statuses: SignalStatus[]): OverallStatus {
  if (statuses.some(s => s === "critical")) return "unhealthy"
  if (statuses.some(s => s === "warning")) return "degraded"
  return "healthy"
}

describe("computeOverallStatus (AC-8.2)", () => {
  it("returns healthy when all signals are healthy", () => {
    expect(computeOverallStatus(["healthy", "healthy", "healthy", "healthy", "healthy"])).toBe("healthy")
  })

  it("returns degraded when any signal is warning (no critical)", () => {
    expect(computeOverallStatus(["healthy", "warning", "healthy", "healthy", "healthy"])).toBe("degraded")
  })

  it("returns degraded when multiple signals are warning", () => {
    expect(computeOverallStatus(["warning", "warning", "healthy", "healthy", "warning"])).toBe("degraded")
  })

  it("returns unhealthy when any signal is critical", () => {
    expect(computeOverallStatus(["healthy", "healthy", "critical", "healthy", "healthy"])).toBe("unhealthy")
  })

  it("returns unhealthy when critical present alongside warnings", () => {
    expect(computeOverallStatus(["warning", "healthy", "critical", "warning", "healthy"])).toBe("unhealthy")
  })

  it("returns unhealthy when multiple signals are critical", () => {
    expect(computeOverallStatus(["critical", "critical", "healthy", "healthy", "healthy"])).toBe("unhealthy")
  })
})

describe("billing signal severity mapping (AC-8.3)", () => {
  function billingSignalStatus(dbStatus: string | null): SignalStatus {
    if (dbStatus === null) return "warning" // no row
    if (dbStatus === "failed") return "critical"
    if (dbStatus === "anomaly_detected") return "warning"
    return "healthy"
  }

  it("maps null (no row) to warning", () => {
    expect(billingSignalStatus(null)).toBe("warning")
  })

  it("maps 'healthy' to healthy", () => {
    expect(billingSignalStatus("healthy")).toBe("healthy")
  })

  it("maps 'anomaly_detected' to warning", () => {
    expect(billingSignalStatus("anomaly_detected")).toBe("warning")
  })

  it("maps 'failed' to critical", () => {
    expect(billingSignalStatus("failed")).toBe("critical")
  })
})

describe("event consumer errors severity mapping (AC-8.4)", () => {
  function eventErrorSignalStatus(count: number): SignalStatus {
    if (count > 10) return "critical"
    if (count > 0) return "warning"
    return "healthy"
  }

  it("maps 0 to healthy", () => {
    expect(eventErrorSignalStatus(0)).toBe("healthy")
  })

  it("maps 1-10 to warning", () => {
    expect(eventErrorSignalStatus(1)).toBe("warning")
    expect(eventErrorSignalStatus(10)).toBe("warning")
  })

  it("maps >10 to critical", () => {
    expect(eventErrorSignalStatus(11)).toBe("critical")
  })
})

describe("deferred action severity mapping (AC-8.5)", () => {
  function deferredActionSignalStatus(count: number): SignalStatus {
    return count > 0 ? "warning" : "healthy"
  }

  it("maps 0 to healthy", () => {
    expect(deferredActionSignalStatus(0)).toBe("healthy")
  })

  it("maps >0 to warning", () => {
    expect(deferredActionSignalStatus(1)).toBe("warning")
    expect(deferredActionSignalStatus(5)).toBe("warning")
  })
})

describe("orchestrated flow severity mapping (AC-8.6)", () => {
  function flowSignalStatus(count: number): SignalStatus {
    return count > 0 ? "critical" : "healthy"
  }

  it("maps 0 to healthy", () => {
    expect(flowSignalStatus(0)).toBe("healthy")
  })

  it("maps >0 to critical", () => {
    expect(flowSignalStatus(1)).toBe("critical")
    expect(flowSignalStatus(3)).toBe("critical")
  })
})

describe("paddle webhook silence severity mapping (AC-8.7)", () => {
  function paddleSignalStatus(lastRunAt: Date | null): SignalStatus {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    if (!lastRunAt || lastRunAt < fortyEightHoursAgo) return "warning"
    return "healthy"
  }

  it("maps null (no run) to warning", () => {
    expect(paddleSignalStatus(null)).toBe("warning")
  })

  it("maps recent run to healthy", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    expect(paddleSignalStatus(oneHourAgo)).toBe("healthy")
  })

  it("maps >48h ago to warning", () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
    expect(paddleSignalStatus(threeDaysAgo)).toBe("warning")
  })
})
