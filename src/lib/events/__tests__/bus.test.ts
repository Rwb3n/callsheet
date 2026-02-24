import { describe, it, expect, vi } from "vitest"
import { InProcessEventBus } from "../bus"
import { createWaitUntilCollector } from "../waitUntil"
import type {
  EventConsumerError,
  ScalingMetrics,
  EventType,
  ConsumerEntry,
} from "../types"
import { EMPTY_MATRIX } from "../test-helpers"

// Test matrix with one entry — used by AC-04, AC-05, AC-46
const TEST_MATRIX: Record<EventType, ConsumerEntry[]> = {
  ...EMPTY_MATRIX,
  claim_approved: [
    { consumer: "platform.searchIndex", domain: "platform", mode: "sync" },
  ],
}

function createTestBus(overrides?: {
  logError?: (err: EventConsumerError) => Promise<void>
  onScalingMetrics?: (eventType: EventType, metrics: ScalingMetrics) => void
  consumerMatrix?: Record<EventType, ConsumerEntry[]>
}) {
  const logError = overrides?.logError ?? vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined)
  const onScalingMetrics = overrides?.onScalingMetrics ?? vi.fn()
  const bus = new InProcessEventBus({
    logError,
    onScalingMetrics,
    consumerMatrix: overrides?.consumerMatrix ?? EMPTY_MATRIX,
  })
  return { bus, logError, onScalingMetrics }
}

// listing_created has no matrix entries at S0 — registration is unrestricted
const TEST_EVENT = "listing_created" as const
const TEST_PAYLOAD = {
  _brand: "ListingCreatedEvent" as const,
  listingId: "00000000-0000-0000-0000-000000000001",
  accountId: "test-account",
  entityType: "company",
  slug: "test-listing",
}

describe("InProcessEventBus", () => {
  // AC-01: Sync handlers execute sequentially; failure propagates to caller
  it("executes sync handlers sequentially and propagates failure", async () => {
    const { bus } = createTestBus()
    const order: number[] = []

    bus.on({
      domain: "platform",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => { order.push(1) },
    })
    bus.on({
      domain: "operations",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => {
        order.push(2)
        throw new Error("sync failure")
      },
    })
    bus.on({
      domain: "commercial",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => { order.push(3) },
    })

    const { waitUntilFn } = createWaitUntilCollector()
    await expect(
      bus.emit(TEST_EVENT, TEST_PAYLOAD, waitUntilFn),
    ).rejects.toThrow("sync failure")

    // First two ran in order; third never reached
    expect(order).toEqual([1, 2])
  })

  // AC-02: Async handlers dispatch via waitUntilFn after sync complete
  it("dispatches async handlers via waitUntilFn after sync handlers complete", async () => {
    const { bus } = createTestBus()
    let syncDone = false

    bus.on({
      domain: "platform",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => { syncDone = true },
    })

    // Async handler verifies sync already ran when it executes
    let syncWasDoneWhenAsyncRan = false
    bus.on({
      domain: "operations",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => { syncWasDoneWhenAsyncRan = syncDone },
    })

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    await bus.emit(TEST_EVENT, TEST_PAYLOAD, waitUntilFn)

    // Sync completed before emit returned
    expect(syncDone).toBe(true)

    // Async dispatched to collector, not yet settled
    expect(getPromises()).toHaveLength(1)
    await Promise.all(getPromises())
    expect(syncWasDoneWhenAsyncRan).toBe(true)
  })

  // AC-03: Async failure logs to event_consumer_errors, does not propagate
  it("logs async failure without propagation", async () => {
    const logError = vi.fn<(err: EventConsumerError) => Promise<void>>().mockResolvedValue(undefined)
    const { bus } = createTestBus({ logError })

    bus.on({
      domain: "operations",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => { throw new Error("async boom") },
    })

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    await bus.emit(TEST_EVENT, TEST_PAYLOAD, waitUntilFn)

    // Resolve async — error is caught internally
    await Promise.all(getPromises())
    expect(logError).toHaveBeenCalledOnce()
    expect(logError.mock.calls[0][0].error).toBe("async boom")
    expect(logError.mock.calls[0][0].mode).toBe("async")
  })

  // AC-04: EVENT_CONSUMER_MATRIX validation fails on missing consumer
  it("validateConsumers fails when a matrix entry has no registered handler", () => {
    const { bus } = createTestBus({ consumerMatrix: TEST_MATRIX })

    const result = bus.validateConsumers()
    expect(result.valid).toBe(false)
    expect(result.missing).toContain("claim_approved:platform:sync")
  })

  // AC-05: EVENT_CONSUMER_MATRIX validation passes with all consumers registered
  it("validateConsumers passes when all matrix entries have handlers", () => {
    const { bus } = createTestBus({ consumerMatrix: TEST_MATRIX })

    bus.on({
      domain: "platform",
      eventType: "claim_approved",
      mode: "sync",
      handler: async () => {},
    })

    const result = bus.validateConsumers()
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  // AC-06: Duplicate emission to idempotent consumer produces same outcome
  it("duplicate emission to idempotent consumer produces same outcome", async () => {
    const { bus } = createTestBus()
    let callCount = 0
    const results: string[] = []

    bus.on({
      domain: "platform",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => {
        callCount++
        results.push("processed")
      },
    })

    const { waitUntilFn } = createWaitUntilCollector()
    const payload = TEST_PAYLOAD

    await bus.emit(TEST_EVENT, payload, waitUntilFn)
    await bus.emit(TEST_EVENT, payload, waitUntilFn)

    expect(callCount).toBe(2)
    expect(results).toEqual(["processed", "processed"])
  })

  // AC-45: waitUntilFn mock collector accumulates all promises; all resolve
  it("waitUntilFn collector accumulates all async promises", async () => {
    const { bus } = createTestBus()
    const resolved: number[] = []

    bus.on({
      domain: "platform",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => { resolved.push(1) },
    })
    bus.on({
      domain: "operations",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => { resolved.push(2) },
    })
    bus.on({
      domain: "commercial",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => { resolved.push(3) },
    })

    const { waitUntilFn, getPromises } = createWaitUntilCollector()
    await bus.emit(TEST_EVENT, TEST_PAYLOAD, waitUntilFn)

    const promises = getPromises()
    expect(promises).toHaveLength(3)
    await Promise.all(promises)
    expect(resolved).toHaveLength(3)
  })

  // AC-46: Bus rejects handler registration with mode not matching EVENT_CONSUMER_MATRIX entry
  it("rejects handler registration when mode does not match matrix entry", () => {
    const { bus } = createTestBus({ consumerMatrix: TEST_MATRIX })

    expect(() =>
      bus.on({
        domain: "platform",
        eventType: "claim_approved",
        mode: "async", // matrix says sync
        handler: async () => {},
      }),
    ).toThrow("Mode mismatch")
  })

  // AC-47: Event emission logs scaling metrics
  it("emits scaling metrics on event emission", async () => {
    const onScalingMetrics = vi.fn()
    const { bus } = createTestBus({ onScalingMetrics })

    bus.on({
      domain: "platform",
      eventType: TEST_EVENT,
      mode: "sync",
      handler: async () => {},
    })
    bus.on({
      domain: "operations",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => {},
    })
    bus.on({
      domain: "commercial",
      eventType: TEST_EVENT,
      mode: "async",
      handler: async () => {},
    })

    const { waitUntilFn } = createWaitUntilCollector()
    await bus.emit(TEST_EVENT, TEST_PAYLOAD, waitUntilFn)

    expect(onScalingMetrics).toHaveBeenCalledOnce()
    const [eventType, metrics] = onScalingMetrics.mock.calls[0]
    expect(eventType).toBe(TEST_EVENT)
    expect(metrics.syncDurationMs).toBeGreaterThanOrEqual(0)
    expect(metrics.asyncConsumerCount).toBe(2)
    // 2 async out of 3 total = 66.67%
    expect(metrics.asyncPercentage).toBeCloseTo(66.67, 0)
  })
})
