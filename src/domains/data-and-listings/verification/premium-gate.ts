// Premium Verified subscription gate — S4 §9, resolves S3-1
// S3's evaluateVerificationUpgrade calls this before enhanced credential checks.

import type { SubscriptionTier } from "@/lib/events/types"

export function isPremiumVerificationEligible(tier: SubscriptionTier): boolean {
  return tier !== "free"
}
