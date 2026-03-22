// Cross-role nudge — S6 §8, CS-WORK-056 AC-45/46/47
// Pure function. No I/O. Called on buyer dashboard page load.

export const CATEGORY_CONCENTRATION_THRESHOLD = 5
export const ENGAGEMENT_THRESHOLD_SEARCHES = 20
export const ACCOUNT_AGE_DAYS = 14
export const RECENT_WINDOW_DAYS = 30

export type CrossRoleNudge = {
  type: "category_concentration" | "engagement_threshold"
  message: string
  action: { label: string; target: string }
}

export type SearchHistoryEntry = {
  createdAt: string
  filters: { serviceAreas?: string[] } | null
}

export function evaluateCrossRoleNudge(
  searchHistory: SearchHistoryEntry[],
  accountListingCount: number,
  accountCreatedAt: string,
): CrossRoleNudge | null {
  if (accountListingCount > 0) return null

  // Trigger 1: category concentration — 5+ in same service area within 30 days
  const thirtyDaysAgo = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recentSearches = searchHistory.filter(
    (s) => new Date(s.createdAt).getTime() > thirtyDaysAgo,
  )

  const serviceAreaCounts = new Map<string, number>()
  for (const entry of recentSearches) {
    const area = entry.filters?.serviceAreas?.[0]
    if (area) {
      serviceAreaCounts.set(area, (serviceAreaCounts.get(area) ?? 0) + 1)
    }
  }

  let topArea: { slug: string; count: number } | null = null
  for (const [slug, count] of serviceAreaCounts) {
    if (!topArea || count > topArea.count) {
      topArea = { slug, count }
    }
  }

  if (topArea && topArea.count >= CATEGORY_CONCENTRATION_THRESHOLD) {
    return {
      type: "category_concentration",
      message: `You've searched for ${topArea.slug} ${topArea.count} times recently. Do you offer this service?`,
      action: { label: "Create your listing", target: "/dashboard/listings/create" },
    }
  }

  // Trigger 2: engagement threshold — 20+ total, no listings, account >14 days
  const fourteenDaysAgo = Date.now() - ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000
  const accountOldEnough = new Date(accountCreatedAt).getTime() < fourteenDaysAgo

  if (searchHistory.length >= ENGAGEMENT_THRESHOLD_SEARCHES && accountOldEnough) {
    return {
      type: "engagement_threshold",
      message: "You've been actively searching CALLSHEET. Are you also a provider?",
      action: { label: "Create your listing", target: "/dashboard/listings/create" },
    }
  }

  return null
}
