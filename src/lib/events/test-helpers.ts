// Event bus test utilities — shared matrix construction for test files.

import { EVENT_CONSUMER_MATRIX } from "./types"
import type { EventType, ConsumerEntry } from "./types"

/** Empty matrix — allows unrestricted registration for bus mechanic tests. */
export const EMPTY_MATRIX = Object.fromEntries(
  Object.keys(EVENT_CONSUMER_MATRIX).map((k) => [k, [] as ConsumerEntry[]]),
) as Record<EventType, ConsumerEntry[]>

/**
 * Build a test matrix by extending the production matrix with additional entries.
 * Each override key appends entries to the existing array for that event type.
 */
export function createTestMatrix(
  overrides: Partial<Record<EventType, ConsumerEntry[]>>,
): Record<EventType, ConsumerEntry[]> {
  const base = Object.fromEntries(
    Object.entries(EVENT_CONSUMER_MATRIX).map(([k, v]) => [k, [...v]]),
  ) as Record<EventType, ConsumerEntry[]>
  for (const [eventType, entries] of Object.entries(overrides)) {
    const key = eventType as EventType
    base[key] = [...base[key], ...entries]
  }
  return base
}
