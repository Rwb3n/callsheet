// Phase 4: Archive flagged records — S2 §6.1
// Flagged records are not committed — they were filtered out in phases 1-2 + integrity.
// This phase logs the archive count for the pipeline result.

import type { FlaggedRecord } from "./types"

export type Phase4Result = { archived: number }

export function phase4ArchiveFlagged(flagged: FlaggedRecord[]): Phase4Result {
  return { archived: flagged.length }
}
