// Scheduler public API — S0 §3.3
// scheduleDeferredAction(), cancelDeferredAction()

import type {
  DeferredActionType,
  ScheduleActionParams,
  CancelActionParams,
  DeferredActionRow,
  RecurringActionConfig,
} from "./types"

// DB adapter — injected for testability. Production wires Drizzle queries.
export interface SchedulerDb {
  insert(row: Omit<DeferredActionRow, "id" | "createdAt" | "completedAt" | "lastError" | "cancelledAt" | "cancelledBy">): Promise<string>
  cancelMatching<T extends DeferredActionType>(
    action: T,
    filterParams: Record<string, unknown>,
    cancelledBy: string,
    cancelledAt: Date,
  ): Promise<number>
  findPending(action: string): Promise<DeferredActionRow | null>
}

export async function scheduleDeferredAction<T extends DeferredActionType>(
  db: SchedulerDb,
  params: ScheduleActionParams<T>,
): Promise<string> {
  return db.insert({
    action: params.action,
    params: params.params as Record<string, unknown>,
    executeAt: params.executeAt,
    retryPolicy: params.retryPolicy,
    onFailure: params.onFailure,
    createdBy: params.createdBy,
    status: "pending",
    attempts: 0,
  })
}

export async function cancelDeferredAction<T extends DeferredActionType>(
  db: SchedulerDb,
  params: CancelActionParams<T>,
): Promise<number> {
  return db.cancelMatching(
    params.action,
    params.filterParams as Record<string, unknown>,
    params.cancelledBy,
    new Date(),
  )
}

// Seed recurring actions on startup if no pending instance exists [S0 §3.2, AC-48]
export async function seedRecurringActions(
  db: SchedulerDb,
  configs: RecurringActionConfig[],
  now?: Date,
): Promise<string[]> {
  const seeded: string[] = []
  const baseTime = now ?? new Date()

  for (const config of configs) {
    const existing = await db.findPending(config.action)
    if (existing) continue

    const id = await scheduleDeferredAction(db, {
      action: config.action,
      params: {} as Record<string, never>,
      executeAt: new Date(baseTime.getTime() + config.intervalMs),
      retryPolicy: config.retryPolicy,
      onFailure: config.onFailure,
      createdBy: config.createdBy,
    })
    seeded.push(id)
  }

  return seeded
}
