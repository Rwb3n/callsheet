// Source inference for profile_viewed event — S6 §2.10, AC-19
// Maps referer header to source category. Pure function, no side effects.

export type ProfileViewSource = "search" | "direct" | "shortlist"

export function inferSource(referer: string | null | undefined): ProfileViewSource {
  if (!referer) return "direct"
  if (referer.includes("/search")) return "search"
  if (referer.includes("/dashboard/shortlists")) return "shortlist"
  return "direct"
}
