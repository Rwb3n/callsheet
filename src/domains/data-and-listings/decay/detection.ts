// Decay detection logic — S9 §2, AC-22 through AC-36
// Pure functions with injectable dependencies. No DB imports.

import type { LivenessServices } from "./liveness-services"
import type { DecaySignalDetectedEvent } from "@/lib/events/types"

// --- Types ---

export type DecaySignalType =
  | "website_dead"
  | "email_bounced"
  | "ch_not_active"
  | "stale_listing"
  | "social_dead"
  | "postcode_invalid"
  | "domain_expired"

export type DecaySignalSeverity = "critical" | "high" | "medium" | "low"

export type EnrichmentCheckType = "website" | "email" | "ch" | "social" | "postcode" | "imdb"

export type CadenceTier = "paid" | "claimed" | "unclaimed"

export type DecaySignal = {
  signalType: DecaySignalType
  severity: DecaySignalSeverity
  checkDetails: Record<string, unknown>
}

export type DecayResponseDecision = {
  action: "warn_immediately" | "schedule_warning" | "log_only" | "suppress"
  notificationSent: boolean
  supportTicketCreated: boolean
  searchRankingDownweight: boolean
  reason: string
}

export type EnrichmentCadenceMetrics = {
  falsePositiveRate: number
  signalDetectionRate: number
  averageCheckLatency: number
  costPerCheckBatch: number
}

export type EnrichmentCadenceDecision = {
  action: "increase_frequency" | "decrease_frequency" | "maintain" | "escalate_to_principal"
  reason: string
  tier: CadenceTier
  metrics: EnrichmentCadenceMetrics
}

type CadenceEntry = {
  livenessDays: number
  fullCycleDays: number
}

type CadenceMap = Record<EnrichmentCheckType, CadenceEntry | null>

// --- Constants ---

const DAY_MS = 24 * 60 * 60 * 1000

export const CADENCE_MAP: Record<CadenceTier, CadenceMap> = {
  paid: {
    website: { livenessDays: 7, fullCycleDays: 90 },
    email: { livenessDays: 7, fullCycleDays: 90 },
    ch: { livenessDays: 90, fullCycleDays: 90 },
    social: { livenessDays: 7, fullCycleDays: 90 },
    postcode: { livenessDays: 365, fullCycleDays: 365 },
    imdb: { livenessDays: 30, fullCycleDays: 90 },
  },
  claimed: {
    website: { livenessDays: 14, fullCycleDays: 180 },
    email: { livenessDays: 14, fullCycleDays: 180 },
    ch: { livenessDays: 180, fullCycleDays: 180 },
    social: { livenessDays: 14, fullCycleDays: 180 },
    postcode: { livenessDays: 365, fullCycleDays: 365 },
    imdb: { livenessDays: 90, fullCycleDays: 180 },
  },
  unclaimed: {
    website: { livenessDays: 30, fullCycleDays: 365 },
    email: { livenessDays: 30, fullCycleDays: 365 },
    ch: { livenessDays: 365, fullCycleDays: 365 },
    social: null,
    postcode: null,
    imdb: null,
  },
}

const FULL_CYCLE_DURATION_MS: Record<CadenceTier, number> = {
  paid: 90 * DAY_MS,
  claimed: 180 * DAY_MS,
  unclaimed: 365 * DAY_MS,
}

// Cost threshold for escalation to principal (monthly GBP)
const COST_ESCALATION_THRESHOLD = 50

// --- Detection functions ---

// AC-22: website liveness check
export async function detectDecayWebsite(
  websiteUrl: string | null,
  services: LivenessServices,
  hasEmailBounce: boolean,
): Promise<DecaySignal | null> {
  if (!websiteUrl) return null

  const result = await services.website.checkUrl(websiteUrl)

  if ("error" in result) {
    const severity = hasEmailBounce ? "critical" : "high"
    return {
      signalType: result.error === "DNS_RESOLUTION_FAILED" ? "domain_expired" : "website_dead",
      severity,
      checkDetails: { url: websiteUrl, error: result.error },
    }
  }

  if (result.status >= 400) {
    const severity = hasEmailBounce ? "critical" : "high"
    return {
      signalType: "website_dead",
      severity,
      checkDetails: { url: websiteUrl, httpStatus: result.status },
    }
  }

  return null
}

// AC-23: email liveness check
export async function detectDecayEmail(
  contactEmail: string | null,
  services: LivenessServices,
  hasWebsiteDead: boolean,
): Promise<DecaySignal | null> {
  if (!contactEmail) return null

  const domain = contactEmail.split("@")[1]
  if (!domain) return null

  const mxResult = await services.email.checkMx(domain)
  if (mxResult.records.length === 0) {
    const severity = hasWebsiteDead ? "critical" : "high"
    return {
      signalType: "email_bounced",
      severity,
      checkDetails: { email: contactEmail, reason: "no_mx_records" },
    }
  }

  const probeResult = await services.email.probeMailbox(contactEmail, mxResult.records[0])
  if (probeResult.status === "invalid") {
    const severity = hasWebsiteDead ? "critical" : "high"
    return {
      signalType: "email_bounced",
      severity,
      checkDetails: { email: contactEmail, reason: "mailbox_invalid", smtpCode: probeResult.code },
    }
  }

  return null
}

// AC-24: Companies House liveness check
export async function detectDecayCh(
  chNumber: string | null,
  services: LivenessServices,
): Promise<DecaySignal | null> {
  if (!chNumber) return null

  const result = await services.companiesHouse.getCompany(chNumber)

  if (result.status !== "active") {
    return {
      signalType: "ch_not_active",
      severity: "high",
      checkDetails: { chNumber, companyStatus: result.status, companyName: result.name },
    }
  }

  return null
}

// AC-25: social profile liveness check
export async function detectDecaySocial(
  socialProfiles: Array<{ url: string; platform: string }>,
  services: LivenessServices,
): Promise<DecaySignal | null> {
  if (socialProfiles.length === 0) return null

  const deadProfiles: Array<{ url: string; platform: string; httpStatus: number }> = []

  for (const profile of socialProfiles) {
    const result = await services.social.checkUrl(profile.url)
    if (result.status === 404) {
      deadProfiles.push({ url: profile.url, platform: profile.platform, httpStatus: result.status })
    }
  }

  // Only flag when ALL profiles are dead
  if (deadProfiles.length === socialProfiles.length) {
    return {
      signalType: "social_dead",
      severity: "medium",
      checkDetails: { deadProfiles },
    }
  }

  return null
}

// AC-26: postcode liveness check — corroborates with other signals
export async function detectDecayPostcode(
  postcode: string | null,
  websiteUrl: string | null,
  contactEmail: string | null,
  services: LivenessServices,
): Promise<DecaySignal | null> {
  if (!postcode) return null

  const result = await services.postcode.validate(postcode)

  if (result.status === "terminated") {
    return {
      signalType: "postcode_invalid",
      severity: "medium",
      checkDetails: { postcode, postcodeStatus: result.status, hasWebsite: !!websiteUrl, hasEmail: !!contactEmail },
    }
  }

  if (result.status === "invalid") {
    return {
      signalType: "postcode_invalid",
      severity: "low",
      checkDetails: { postcode, postcodeStatus: result.status },
    }
  }

  return null
}

// --- Severity escalation ---

// AC-27: correlated signals escalate severity
export function computeSeverityEscalation(
  signalType: DecaySignalType,
  hasActiveUnresolved: boolean,
): DecaySignalSeverity {
  if (!hasActiveUnresolved) {
    if (signalType === "website_dead" || signalType === "email_bounced" || signalType === "domain_expired") return "high"
    if (signalType === "ch_not_active") return "high"
    return "medium"
  }

  // website_dead + email_bounced correlation → critical
  if (signalType === "website_dead" || signalType === "email_bounced" || signalType === "domain_expired") {
    return "critical"
  }

  return "high"
}

// --- Decay response evaluation ---

type ExistingSignal = {
  id: string
  signalType: string
  resolvedAt: Date | null
  checkDetails: Record<string, unknown> | null
}

type DecayResponseDeps = {
  updateSignal: (id: string, checkDetails: Record<string, unknown>) => Promise<void>
  insertSignal: (signal: { listingId: string; signalType: string; severity: string; checkDetails: Record<string, unknown> }) => Promise<string>
  logDecision: (params: {
    domain: string
    decisionType: string
    inputs: Record<string, unknown>
    output: Record<string, unknown>
    listingId: string
  }) => Promise<void>
  emitEvent: (event: DecaySignalDetectedEvent) => Promise<void>
}

// AC-28, AC-29, AC-33, AC-34
export async function evaluateDecayResponse(params: {
  listingId: string
  signal: DecaySignal
  existingSignals: ExistingSignal[]
  hasActiveSupportTicket: { ticketId: string; category: string; openedAt: Date } | null
  deps: DecayResponseDeps
}): Promise<DecayResponseDecision> {
  const { listingId, signal, existingSignals, hasActiveSupportTicket, deps } = params

  // AC-28: duplicate suppression — update existing rather than inserting
  const unresolvedSameType = existingSignals.find(
    (s) => s.signalType === signal.signalType && s.resolvedAt === null,
  )
  if (unresolvedSameType) {
    await deps.updateSignal(unresolvedSameType.id, signal.checkDetails)
    await deps.logDecision({
      domain: "data-and-listings",
      decisionType: "decay_response_evaluation",
      inputs: { listingId, signalType: signal.signalType, action: "duplicate_update", existingSignalId: unresolvedSameType.id },
      output: { action: "duplicate_update", reason: "unresolved_signal_of_same_type_exists" },
      listingId,
    })
    return {
      action: "suppress",
      notificationSent: false,
      supportTicketCreated: false,
      searchRankingDownweight: false,
      reason: "unresolved_signal_of_same_type_exists",
    }
  }

  // AC-29: active support ticket suppression
  if (hasActiveSupportTicket) {
    await deps.insertSignal({
      listingId,
      signalType: signal.signalType,
      severity: signal.severity,
      checkDetails: signal.checkDetails,
    })
    await deps.logDecision({
      domain: "data-and-listings",
      decisionType: "decay_response_evaluation",
      inputs: { listingId, signalType: signal.signalType, ticketId: hasActiveSupportTicket.ticketId },
      output: { action: "suppress", reason: "active_support_ticket" },
      listingId,
    })
    return {
      action: "suppress",
      notificationSent: false,
      supportTicketCreated: false,
      searchRankingDownweight: false,
      reason: "active_support_ticket",
    }
  }

  // Insert the new signal
  await deps.insertSignal({
    listingId,
    signalType: signal.signalType,
    severity: signal.severity,
    checkDetails: signal.checkDetails,
  })

  // AC-33: emit decay_signal_detected event
  const eventPayload: DecaySignalDetectedEvent = {
    _brand: "DecaySignalDetectedEvent" as const,
    listingId,
    signal: { type: signal.signalType, severity: signal.severity },
  }
  await deps.emitEvent(eventPayload)

  // AC-34: log decision for every invocation
  const action = severityToAction(signal.severity)
  await deps.logDecision({
    domain: "data-and-listings",
    decisionType: "decay_response_evaluation",
    inputs: { listingId, signalType: signal.signalType, severity: signal.severity },
    output: { action, notificationSent: action === "warn_immediately", searchRankingDownweight: signal.severity === "critical" },
    listingId,
  })

  return {
    action,
    notificationSent: action === "warn_immediately",
    supportTicketCreated: false,
    searchRankingDownweight: signal.severity === "critical",
    reason: `severity_${signal.severity}`,
  }
}

function severityToAction(severity: DecaySignalSeverity): DecayResponseDecision["action"] {
  switch (severity) {
    case "critical":
      return "warn_immediately"
    case "high":
      return "schedule_warning"
    case "medium":
    case "low":
      return "log_only"
  }
}

// --- Cadence functions ---

// AC-30
export function getCadenceMap(tier: CadenceTier): CadenceMap {
  return CADENCE_MAP[tier]
}

export function getFullCycleDuration(tier: CadenceTier): number {
  return FULL_CYCLE_DURATION_MS[tier]
}

export function getApplicableCheckTypes(tier: CadenceTier): EnrichmentCheckType[] {
  const map = CADENCE_MAP[tier]
  return (Object.keys(map) as EnrichmentCheckType[]).filter((k) => map[k] !== null)
}

// --- Cadence adjustment ---

// AC-36: pure decision function for enrichment cadence tuning
export function evaluateEnrichmentCadenceAdjustment(params: {
  tier: CadenceTier
  metrics: EnrichmentCadenceMetrics
  logDecision: (params: {
    domain: string
    decisionType: string
    inputs: Record<string, unknown>
    output: Record<string, unknown>
  }) => void
}): EnrichmentCadenceDecision {
  const { tier, metrics, logDecision: log } = params

  if (metrics.falsePositiveRate > 0.30) {
    const decision: EnrichmentCadenceDecision = {
      action: "decrease_frequency",
      reason: `false positive rate ${(metrics.falsePositiveRate * 100).toFixed(1)}% exceeds 30% threshold`,
      tier,
      metrics,
    }
    log({
      domain: "data-and-listings",
      decisionType: "enrichment_cadence_adjustment",
      inputs: { tier, ...metrics },
      output: { action: decision.action, reason: decision.reason },
    })
    return decision
  }

  if (metrics.signalDetectionRate > 0.15) {
    const decision: EnrichmentCadenceDecision = {
      action: "increase_frequency",
      reason: `signal detection rate ${(metrics.signalDetectionRate * 100).toFixed(1)}% exceeds 15% threshold`,
      tier,
      metrics,
    }
    log({
      domain: "data-and-listings",
      decisionType: "enrichment_cadence_adjustment",
      inputs: { tier, ...metrics },
      output: { action: decision.action, reason: decision.reason },
    })
    return decision
  }

  if (metrics.costPerCheckBatch > COST_ESCALATION_THRESHOLD) {
    const decision: EnrichmentCadenceDecision = {
      action: "escalate_to_principal",
      reason: `cost per batch £${metrics.costPerCheckBatch.toFixed(2)} exceeds £${COST_ESCALATION_THRESHOLD} threshold`,
      tier,
      metrics,
    }
    log({
      domain: "data-and-listings",
      decisionType: "enrichment_cadence_adjustment",
      inputs: { tier, ...metrics },
      output: { action: decision.action, reason: decision.reason },
    })
    return decision
  }

  const decision: EnrichmentCadenceDecision = {
    action: "maintain",
    reason: "all metrics within tolerance",
    tier,
    metrics,
  }
  log({
    domain: "data-and-listings",
    decisionType: "enrichment_cadence_adjustment",
    inputs: { tier, ...metrics },
    output: { action: decision.action, reason: decision.reason },
  })
  return decision
}
