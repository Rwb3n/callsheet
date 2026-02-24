// Feature access computation — CR §4.2, S4 §4.1
// Pure function. No I/O. Platform imports via P4.

import type { SubscriptionTier } from "@/lib/events/types"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import type { TierLimits } from "@/domains/commercial/tier-limits"

export type FeatureAccess = TierLimits & {
  directContactVisible: true
  organicSearchVisible: true
  enquiriesEnabled: true
  basicAnalytics: true
}

export function computeFeatureAccess(tier: SubscriptionTier): FeatureAccess {
  return {
    ...TIER_LIMITS[tier],
    directContactVisible: true,
    organicSearchVisible: true,
    enquiriesEnabled: true,
    basicAnalytics: true,
  }
}
