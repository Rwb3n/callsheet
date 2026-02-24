// Feature gate enforcement — S4 §4.2
// S5/S6 apply these to dashboard routes and template-level access checks.

import { TRPCError } from "@trpc/server"
import type { SubscriptionTier } from "@/lib/events/types"
import type { TierLimits } from "@/domains/commercial/tier-limits"
import { computeFeatureAccess } from "@/domains/commercial/subscription/feature-access"

export function enforceFeatureGate(
  tier: SubscriptionTier,
  feature: keyof TierLimits,
): void {
  const access = computeFeatureAccess(tier)
  const value = access[feature]

  if (value === false || value === "none" || value === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${feature} requires a paid subscription`,
    })
  }
}

export function checkFeatureAccess(
  tier: SubscriptionTier,
  feature: keyof TierLimits,
): boolean {
  const access = computeFeatureAccess(tier)
  const value = access[feature]
  return value !== false && value !== "none" && value !== 0
}
