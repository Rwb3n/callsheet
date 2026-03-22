"use client"

// Cross-role nudge banner — S6 §8.5, CS-WORK-056 AC-48
// Dismissible banner on buyer dashboard. CTA links to /dashboard/listings/create.

import { useState, useEffect } from "react"
import { evaluateCrossRoleNudge, type SearchHistoryEntry, type CrossRoleNudge } from "./cross-role-nudge"
import { shouldShowNudge, dismissNudge } from "./nudge-storage"

type NudgeBannerProps = {
  searchHistory: SearchHistoryEntry[]
  accountListingCount: number
  accountCreatedAt: string
}

export function NudgeBanner({
  searchHistory,
  accountListingCount,
  accountCreatedAt,
}: NudgeBannerProps) {
  const [nudge, setNudge] = useState<CrossRoleNudge | null>(null)

  useEffect(() => {
    if (!shouldShowNudge()) return
    const result = evaluateCrossRoleNudge(searchHistory, accountListingCount, accountCreatedAt)
    setNudge(result)
  }, [searchHistory, accountListingCount, accountCreatedAt])

  if (!nudge) return null

  return (
    <div
      role="alert"
      data-testid="nudge-banner"
      className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-blue-900">{nudge.message}</p>
        <a
          href={nudge.action.target}
          className="text-sm font-medium text-blue-700 underline hover:text-blue-800"
        >
          {nudge.action.label}
        </a>
      </div>
      <button
        type="button"
        aria-label="Dismiss nudge"
        data-testid="nudge-dismiss"
        onClick={() => { dismissNudge(); setNudge(null) }}
        className="ml-4 text-blue-400 hover:text-blue-600"
      >
        ✕
      </button>
    </div>
  )
}
