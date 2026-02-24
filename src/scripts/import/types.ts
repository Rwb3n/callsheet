// Import pipeline types — S2 §6.6, §6.7

export type ImportRecord = {
  sourceId: string
  name: string
  entityType: "freelancer" | "company"
  companiesHouseNumber?: string
  contactEmail?: string
  contactPhone?: string
  websiteUrl?: string
  basePostcode?: string
  baseRegion?: string
  bio?: string
  services: string[]
}

export type CleanedRecord = ImportRecord & {
  flags: CleanFlag[]
}

export type CleanFlag = {
  field: string
  reason: string
  originalValue: string
}

export type FlaggedRecord = CleanedRecord & {
  flagReason: "invalid_data" | "dissolved_company" | "duplicate"
  mergeCandidate?: string
}

export type Phase1Result = {
  cleaned: CleanedRecord[]
  flagged: FlaggedRecord[]
  stats: { total: number; cleaned: number; flagged: number }
}

export type Phase2Result = {
  verified: CleanedRecord[]
  dissolved: FlaggedRecord[]
  stats: { total: number; verified: number; dissolved: number; skipped: number }
}

export type BatchIntegrityResult = {
  committed: CleanedRecord[]
  flagged: FlaggedRecord[]
  stats: { total: number; committed: number; duplicates: number }
}

export type PipelineResult = {
  phase1: Phase1Result
  phase2: Phase2Result
  integrity: BatchIntegrityResult
  phase4: { archived: number }
  committed: number
}
