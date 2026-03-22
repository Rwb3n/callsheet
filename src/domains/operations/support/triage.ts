// Support triage pure functions — S7 §2.2–§2.5, CS-WORK-058
// classifyTicket, computePriority, elevatePriority, computeSlaDeadline, kbDeflection

export type TicketCategory =
  | "billing_support"
  | "profile_support"
  | "claim_dispute"
  | "feature_gating_confusion"
  | "account_access"
  | "data_request"
  | "refund_request"
  | "other"

export type TicketPriority = "critical" | "high" | "normal" | "low"

export type ChurnRiskLevel = "at_risk" | "high_risk"

// --- AC-2.1: classifyTicket — keyword matching against subject + body ---

type ClassifyInput = { subject: string; body: string }

const CATEGORY_PATTERNS: Array<[TicketCategory, string[]]> = [
  ["data_request", ["dsar", "data request", "erasure", "delete my data", "gdpr"]],
  ["claim_dispute", ["claim", "dispute", "already own", "my company"]],
  ["refund_request", ["refund", "money back", "cancel and refund"]],
  ["billing_support", ["invoice", "billing", "payment", "charge", "subscription"]],
  ["account_access", ["login", "password", "access", "locked out", "can't sign in"]],
  ["feature_gating_confusion", ["can't see who", "upgrade", "tier", "feature", "gated", "locked"]],
  ["profile_support", ["profile", "listing", "edit", "update", "photo", "description"]],
]

export function classifyTicket(input: ClassifyInput): TicketCategory {
  const combined = `${input.subject} ${input.body}`.toLowerCase()

  for (const [category, keywords] of CATEGORY_PATTERNS) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return category
    }
  }

  return "other"
}

// --- AC-2.2: base priority by category ---

const BASE_PRIORITY: Record<TicketCategory, TicketPriority> = {
  data_request: "high",
  claim_dispute: "high",
  refund_request: "high",
  billing_support: "normal",
  account_access: "normal",
  feature_gating_confusion: "low",
  profile_support: "low",
  other: "normal",
}

// --- AC-2.3: priority elevation ---

const ELEVATION_MAP: Record<TicketPriority, TicketPriority> = {
  low: "normal",
  normal: "high",
  high: "critical",
  critical: "critical",
}

export function elevatePriority(current: TicketPriority): TicketPriority {
  return ELEVATION_MAP[current]
}

export function computePriority(
  category: TicketCategory,
  churnRiskLevel: ChurnRiskLevel | null,
): { priority: TicketPriority; elevated: boolean } {
  const base = BASE_PRIORITY[category]

  if (churnRiskLevel === "high_risk") {
    const elevated = elevatePriority(base)
    return { priority: elevated, elevated: elevated !== base }
  }

  return { priority: base, elevated: false }
}

// --- AC-2.4: SLA deadline computation ---

const SLA_HOURS: Record<TicketPriority, number> = {
  critical: 4,
  high: 24,
  normal: 72,
  low: 168, // 7 days
}

export function computeSlaDeadline(priority: TicketPriority, now?: Date): Date {
  const base = now ?? new Date()
  return new Date(base.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000)
}

export function getSlaHours(priority: TicketPriority): number {
  return SLA_HOURS[priority]
}

// --- AC-2.8: KB deflection ---

const FAQ_PATTERNS: Partial<Record<TicketCategory, string>> = {
  account_access: "/help/account-access",
  billing_support: "/help/billing-faq",
  feature_gating_confusion: "/help/tier-comparison",
  profile_support: "/help/editing-your-listing",
  refund_request: "/help/refund-policy",
}

export function checkKbDeflection(
  category: TicketCategory,
): { matched: boolean; articleUrl?: string } {
  const articleUrl = FAQ_PATTERNS[category]
  if (articleUrl) return { matched: true, articleUrl }
  return { matched: false }
}
