// Analytics pipeline JSONB data shapes — S9 §3
// Authoritative types for perception_aggregates JSONB data column.

// --- §3.1 Search Terms ---

export type SearchTermEntry = {
  term: string
  count: number
  lastSeen: string // ISO8601
}

export type UnmatchedTerm = {
  term: string
  frequency: number
  potentialSector?: string
  potentialServiceArea?: string
}

export type SearchTermsData = {
  terms: SearchTermEntry[]
  zeroResultTerms: string[]
  taxonomyGaps: UnmatchedTerm[]
}

// --- §3.3 Viewer Demographics ---

export type DemographicBucket<T extends string> = {
  type: T
  count: number
  pct: number
}

export type SectorBucket = {
  sector: string
  count: number
  pct: number
}

export type RegionBucket = {
  region: string
  count: number
  pct: number
}

export type ViewerDemographicsData = {
  entityTypes: DemographicBucket<string>[]
  sectors: SectorBucket[]
  regions: RegionBucket[]
  totalUniqueViewers: number
}

// --- §3.4 Competitor Benchmarking ---

export type CompetitorBenchmark = {
  medianViews: number | null
  medianEnquiries: number | null
  medianQualityScore: number | null
  sampleSize: number
  taxonomyOverlapCount: number
  insufficientData: boolean
}

// --- §3.5 Enquiry Response Insights ---

export type EnquiryResponseInsights = {
  responseRate: number
  medianResponseTimeHours: number | null
  conversionEstimate: number
  totalEnquiries: number
  respondedEnquiries: number
}

// --- §3.6 Taxonomy Suggestions ---

export type TaxonomySuggestion = {
  serviceArea: string
  frequency: number
  source: "data_driven"
}

// --- Spec Constants ---

export const ANALYTICS_CONSTANTS = {
  COMPETITOR_BENCHMARK_TTL_DAYS: 7,
  COMPETITOR_MIN_OVERLAP_SERVICE_AREAS: 2,
  COMPETITOR_MIN_SAMPLE_SIZE: 3,
  TAXONOMY_GAP_MIN_FREQUENCY: 3,
  TAXONOMY_SUGGESTIONS_MIN_LISTINGS: 10,
  TAXONOMY_SUGGESTIONS_LIMIT: 10,
  FAST_RESPONSE_THRESHOLD_MINUTES: 1440, // 24 hours
} as const

// --- Helpers ---

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// --- Period helpers (weekly: Mon 00:00 UTC – Sun 23:59 UTC) ---

export function getWeeklyPeriod(date: Date = new Date()): { start: string; end: string } {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday))
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6))
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

export function getDailyPeriod(date: Date = new Date()): { start: string; end: string } {
  const iso = date.toISOString().slice(0, 10)
  return { start: iso, end: iso }
}
