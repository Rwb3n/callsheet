// Event consumer error logging — SI §1.5
// Writes to event_consumer_errors table via Drizzle

import type { Db } from "@/db/types"
import { eventConsumerErrors } from "@/db/schema/shared"
import type { EventConsumerError } from "./types"

export type LogEventConsumerErrorFn = (error: EventConsumerError) => Promise<void>

export function createLogEventConsumerError(db: Db): LogEventConsumerErrorFn {
  return async (error) => {
    await db.insert(eventConsumerErrors).values({
      eventType: error.eventType,
      consumerDomain: error.consumerDomain,
      consumerId: error.consumerId,
      payload: error.payload,
      error: error.error,
      stack: error.stack ?? null,
      mode: error.mode,
    })
  }
}

// Standalone export for backward compat — no-op without DB.
// Production code should use createLogEventConsumerError(db).
export async function logEventConsumerError(_error: EventConsumerError): Promise<void> {}
