// search_history_cleanup handler — S6 §5.2, AC-37
// Self-perpetuating daily cleanup: deletes rows older than 365 days, reschedules.

import { lt } from "drizzle-orm"
import { searchHistory } from "@/db/schema/accounts"
import type { Db } from "@/db/types"
import type { ActionHandlerRegistry, SchedulerDb } from "@/lib/scheduler"
import { scheduleDeferredAction } from "@/lib/scheduler"

export const SEARCH_HISTORY_RETENTION_DAYS = 365
const RESCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function registerSearchHistoryCleanupHandler(
  registry: ActionHandlerRegistry,
  deps: { db: Db; schedulerDb: SchedulerDb },
): void {
  registry.register("search_history_cleanup", async () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - SEARCH_HISTORY_RETENTION_DAYS)

    await deps.db.delete(searchHistory)
      .where(lt(searchHistory.createdAt, cutoff))

    // Self-perpetuating: schedule next execution [S0 §3.3]
    await scheduleDeferredAction(deps.schedulerDb, {
      action: "search_history_cleanup",
      params: {} as Record<string, never>,
      executeAt: new Date(Date.now() + RESCHEDULE_INTERVAL_MS),
      retryPolicy: "retry_3",
      onFailure: "log",
      createdBy: "platform",
    })
  })
}
