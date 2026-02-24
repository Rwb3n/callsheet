// Phase 3: Export flagged records — S2 §6.1
// Stub for S7 manual review workflow. Writes flagged records to stdout as JSON.

import type { FlaggedRecord } from "./types"

export function phase3ExportFlagged(flagged: FlaggedRecord[]): void {
  if (flagged.length === 0) return
  console.log(JSON.stringify(flagged, null, 2))
}
