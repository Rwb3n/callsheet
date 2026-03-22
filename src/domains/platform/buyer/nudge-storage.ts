// Cross-role nudge localStorage helpers — S6 §8.4, CS-WORK-056 AC-48
// Client-side only. 90-day dismissal persistence.

export const NUDGE_STORAGE_KEY = "callsheet:crossRoleNudgeDismissedAt"
export const NUDGE_DISMISS_PERSIST_DAYS = 90

export function shouldShowNudge(): boolean {
  if (typeof window === "undefined") return false
  const dismissed = localStorage.getItem(NUDGE_STORAGE_KEY)
  if (!dismissed) return true
  const dismissedAt = new Date(dismissed)
  if (isNaN(dismissedAt.getTime())) return true
  const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= NUDGE_DISMISS_PERSIST_DAYS
}

export function dismissNudge(): void {
  localStorage.setItem(NUDGE_STORAGE_KEY, new Date().toISOString())
}
