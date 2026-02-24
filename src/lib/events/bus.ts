// InProcessEventBus — SI §1.2, S0 §2
// Sync handlers: sequential, failure propagates + logs [AC-01]
// Async handlers: via waitUntilFn, failure logs only [AC-02, AC-03]

import type {
  EventType,
  EventPayloadMap,
  EventHandler,
  ConsumerEntry,
  Domain,
  ScalingMetrics,
  EventConsumerError,
} from "./types"
import { EVENT_CONSUMER_MATRIX } from "./types"
import type { LogEventConsumerErrorFn } from "./errors"
import type { WaitUntilFn } from "./waitUntil"

export type OnScalingMetrics = (eventType: EventType, metrics: ScalingMetrics) => void

// Internal type-erased handler entry. Public API is type-safe via EventHandler<T>;
// internally we store handlers with unknown payload to avoid branded-type cast issues.
interface StoredHandler {
  domain: Domain
  eventType: EventType
  mode: "sync" | "async"
  handler: (payload: never) => Promise<void>
}

export interface EventBusOptions {
  logError: LogEventConsumerErrorFn
  onScalingMetrics?: OnScalingMetrics
  consumerMatrix?: Record<EventType, ConsumerEntry[]>
}

export class InProcessEventBus {
  private handlers = new Map<EventType, StoredHandler[]>()
  private logError: LogEventConsumerErrorFn
  private onScalingMetrics?: OnScalingMetrics
  private matrix: Record<EventType, ConsumerEntry[]>

  constructor(options: EventBusOptions) {
    this.logError = options.logError
    this.onScalingMetrics = options.onScalingMetrics
    this.matrix = options.consumerMatrix ?? EVENT_CONSUMER_MATRIX
  }

  on<T extends EventType>(registration: EventHandler<T>): void {
    this.validateRegistrationMode(registration)
    const existing = this.handlers.get(registration.eventType) ?? []
    // Safe: handler accepts EventPayloadMap[T], stored as (never) => Promise<void>.
    // At dispatch time emit() passes the correct payload type for the event.
    existing.push(registration as unknown as StoredHandler)
    this.handlers.set(registration.eventType, existing)
  }

  async emit<T extends EventType>(
    eventType: T,
    payload: EventPayloadMap[T],
    waitUntilFn: WaitUntilFn,
  ): Promise<void> {
    const handlers = this.handlers.get(eventType) ?? []
    const syncHandlers = handlers.filter((h) => h.mode === "sync")
    const asyncHandlers = handlers.filter((h) => h.mode === "async")

    // Sync: sequential, awaited [AC-01]
    const syncStart = performance.now()
    for (const h of syncHandlers) {
      try {
        await (h.handler as (p: EventPayloadMap[T]) => Promise<void>)(payload)
      } catch (err) {
        await this.logConsumerError(eventType, h, payload, err)
        throw err
      }
    }
    const syncDurationMs = performance.now() - syncStart

    // Async: via waitUntilFn, post-response [AC-02, AC-03]
    for (const h of asyncHandlers) {
      const run = h.handler as (p: EventPayloadMap[T]) => Promise<void>
      const asyncTask = run(payload).catch(async (err) => {
        await this.logConsumerError(eventType, h, payload, err)
      })
      waitUntilFn(asyncTask)
    }

    // Scaling metrics [AC-47]
    if (this.onScalingMetrics) {
      const totalConsumers = syncHandlers.length + asyncHandlers.length
      this.onScalingMetrics(eventType, {
        syncDurationMs,
        asyncConsumerCount: asyncHandlers.length,
        asyncPercentage: totalConsumers > 0
          ? (asyncHandlers.length / totalConsumers) * 100
          : 0,
      })
    }
  }

  getRegisteredHandlers(): Map<EventType, StoredHandler[]> {
    return new Map(this.handlers)
  }

  // Startup check — every matrix entry must have a registered handler [AC-04, AC-05]
  validateConsumers(): { valid: boolean; missing: string[] } {
    const missing: string[] = []
    for (const [eventType, entries] of Object.entries(this.matrix)) {
      for (const entry of entries) {
        const handlers = this.handlers.get(eventType as EventType) ?? []
        const found = handlers.some(
          (h) => h.domain === entry.domain && h.mode === entry.mode,
        )
        if (!found) {
          missing.push(`${eventType}:${entry.domain}:${entry.mode}`)
        }
      }
    }
    return { valid: missing.length === 0, missing }
  }

  // [AC-46] — reject handler if mode doesn't match any matrix entry
  private validateRegistrationMode<T extends EventType>(
    registration: EventHandler<T>,
  ): void {
    const entries = this.matrix[registration.eventType] ?? []
    if (entries.length === 0) return // no matrix entries at S0 — allow registration
    const matches = entries.some(
      (e) =>
        e.domain === registration.domain && e.mode === registration.mode,
    )
    if (!matches) {
      throw new Error(
        `Mode mismatch: ${registration.domain}:${registration.eventType} ` +
        `registered as "${registration.mode}" but matrix has no matching entry`,
      )
    }
  }

  private async logConsumerError(
    eventType: EventType,
    handler: StoredHandler,
    payload: unknown,
    err: unknown,
  ): Promise<void> {
    const error: EventConsumerError = {
      eventType,
      consumerDomain: handler.domain,
      consumerId: `${handler.domain}:${eventType}:handler`,
      payload,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? "") : "",
      timestamp: new Date().toISOString(),
      mode: handler.mode,
    }
    await this.logError(error)
  }
}
