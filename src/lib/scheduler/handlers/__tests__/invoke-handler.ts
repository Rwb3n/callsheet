// Shared test helper — extracts the registry.get() + type-cast boilerplate.

import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { DeferredActionType, DeferredActionParamsMap } from "@/lib/scheduler/types"

export function invokeHandler<T extends DeferredActionType>(
  registry: ActionHandlerRegistry,
  action: T,
  params: DeferredActionParamsMap[T],
): Promise<void> {
  const handler = registry.get(action)
  if (!handler) throw new Error(`No handler registered for action: ${action}`)
  return (handler as unknown as (p: DeferredActionParamsMap[T]) => Promise<void>)(params)
}
