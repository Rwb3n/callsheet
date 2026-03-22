// Narrows a Drizzle join string to SubscriptionTier with a runtime guard.
// Eliminates `as SubscriptionTier` casts across routers.

import type { SubscriptionTier } from "@/lib/events/types"

const VALID: Set<string> = new Set(["free", "standard", "premium", "partner"])

export function asSubscriptionTier(value: string | null | undefined): SubscriptionTier {
  if (!value || !VALID.has(value)) {
    return "free"
  }
  return value as SubscriptionTier
}
