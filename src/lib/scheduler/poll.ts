// Poll and execute deferred actions — S0 §3.2, SI §2.3

import type {
  DeferredActionRow,
  AlertPrincipalFn,
} from "./types"
import type { ActionHandlerRegistry } from "./registry"

export const SCHEDULER_POLL_INTERVAL_MS = 60_000
export const RETRY_3_MAX_ATTEMPTS = 3

// Exponential backoff: 2^attempt * 60s → 120s, 240s, 480s [S0-4]
function retryDelayMs(attempt: number): number {
  return Math.pow(2, attempt) * 60_000
}

// DB adapter for poll operations
export interface PollDb {
  findDueActions(now: Date): Promise<DeferredActionRow[]>
  setExecuting(id: string): Promise<void>
  setCompleted(id: string, completedAt: Date): Promise<void>
  setFailed(id: string, error: string, attempts: number): Promise<void>
  setExhausted(id: string, error: string, attempts: number): Promise<void>
  reschedule(id: string, executeAt: Date, attempts: number): Promise<void>
}

export interface PollOptions {
  registry: ActionHandlerRegistry
  db: PollDb
  alertPrincipal: AlertPrincipalFn
  now?: () => Date
}

export async function pollAndExecute(options: PollOptions): Promise<void> {
  const { registry, db, alertPrincipal } = options
  const now = options.now?.() ?? new Date()

  const actions = await db.findDueActions(now)

  for (const action of actions) {
    if (action.status === "cancelled") continue // [AC-11]

    const handler = registry.get(action.action)
    if (!handler) {
      await db.setFailed(action.id, `No handler registered for: ${action.action}`, action.attempts + 1)
      continue
    }

    await db.setExecuting(action.id)

    try {
      await (handler as (params: Record<string, unknown>) => Promise<void>)(action.params)
      await db.setCompleted(action.id, now)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const nextAttempt = action.attempts + 1

      if (action.retryPolicy === "once") {
        // [AC-09] once: exhaust immediately
        await db.setExhausted(action.id, errorMsg, nextAttempt)
        if (action.onFailure === "alert_principal") {
          await alertPrincipal(action.action, action.id, errorMsg)
        }
      } else if (action.retryPolicy === "retry_3") {
        if (nextAttempt >= RETRY_3_MAX_ATTEMPTS) {
          // [AC-08] exhausted after 3 attempts
          await db.setExhausted(action.id, errorMsg, nextAttempt)
          if (action.onFailure === "alert_principal") {
            await alertPrincipal(action.action, action.id, errorMsg)
          }
        } else {
          // Reschedule with backoff
          const delay = retryDelayMs(nextAttempt)
          const nextExecuteAt = new Date(now.getTime() + delay)
          await db.reschedule(action.id, nextExecuteAt, nextAttempt)
        }
      }
    }
  }
}
