// Action handler registry — S0 §3.1
// Typed registration, type-erased internal map (branded type pattern from CS-WORK-001)

import type {
  DeferredActionType,
  DeferredActionParamsMap,
  ActionHandler,
  StoredActionHandler,
} from "./types"

export class ActionHandlerRegistry {
  private handlers = new Map<DeferredActionType, StoredActionHandler>()

  register<T extends DeferredActionType>(
    action: T,
    handler: ActionHandler<T>,
  ): void {
    if (this.handlers.has(action)) {
      throw new Error(`Handler already registered for action: ${action}`)
    }
    // Cast via unknown — branded params make direct cast impossible
    this.handlers.set(action, handler as unknown as StoredActionHandler)
  }

  get(action: string): StoredActionHandler | undefined {
    return this.handlers.get(action as DeferredActionType)
  }

  has(action: string): boolean {
    return this.handlers.has(action as DeferredActionType)
  }
}
