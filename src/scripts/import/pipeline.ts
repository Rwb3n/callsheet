// Import pipeline orchestrator — S2 §6.1, §6.7
// Phases 1-4 sequential. No listing_created events (AC-47). No listing_live emails (AC-26).
// Two-phase creation: listing + 1:1 companion rows per S1 §10 (AC-46).

import { sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { CompaniesHouseService } from "@/lib/services/types"
import {
  listings,
  verifications,
  qualityScores,
  qualityScoreExplanations,
  engagements,
} from "@/db/schema/data-and-listings"
import { phase1AutomatedCleaning } from "./phase-1-clean"
import { phase2CHVerification } from "./phase-2-ch-verify"
import { batchImportIntegrity } from "./integrity"
import { phase3ExportFlagged } from "./phase-3-export"
import { phase4ArchiveFlagged } from "./phase-4-removal"
import type { ImportRecord, CleanedRecord, FlaggedRecord, PipelineResult } from "./types"

function generateSlug(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${base}-${index}`
}

async function commitListings(records: CleanedRecord[], db: Db): Promise<number> {
  let committed = 0

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(listings)
        .values({
          accountId: null,
          entityType: r.entityType,
          claimStatus: "unclaimed",
          slug: generateSlug(r.name, i),
          name: r.name,
          companiesHouseNumber: r.companiesHouseNumber ?? null,
          contactEmail: r.contactEmail ?? null,
          contactPhone: r.contactPhone ?? null,
          websiteUrl: r.websiteUrl ?? null,
          basePostcode: r.basePostcode ?? null,
          baseRegion: r.baseRegion ?? null,
          bio: r.bio ?? null,
          subscriptionTier: "free",
          lifecycleStatus: "active",
          source: "4rfv_import",
        })
        .returning({ id: listings.id })

      // 1:1 companion rows — AC-46
      await tx.insert(verifications).values({ listingId: created.id })
      await tx.insert(qualityScores).values({ listingId: created.id })
      await tx.insert(qualityScoreExplanations).values({
        listingId: created.id,
        explanation: { composite: 0, dimensions: [], topImprovements: [] },
      })
      await tx.insert(engagements).values({ listingId: created.id })
    })
    committed++
  }

  return committed
}

export async function runImportPipeline(
  records: ImportRecord[],
  db: Db,
  companiesHouse: CompaniesHouseService,
): Promise<PipelineResult> {
  // Phase 1: Automated cleaning (AC-22)
  const phase1 = phase1AutomatedCleaning(records)

  // Phase 2: CH batch verification (AC-23)
  const phase2 = await phase2CHVerification(phase1.cleaned, companiesHouse)

  // Batch integrity: dedup (AC-24)
  const integrity = await batchImportIntegrity(phase2.verified, db)

  // Phase 3: Export flagged records (stub for S7)
  const allFlagged: FlaggedRecord[] = [
    ...phase1.flagged,
    ...phase2.dissolved,
    ...integrity.flagged,
  ]
  phase3ExportFlagged(allFlagged)

  // Phase 4: Archive flagged
  const phase4 = phase4ArchiveFlagged(allFlagged)

  // Commit non-flagged records (AC-25, AC-46)
  // No listing_created events emitted (AC-47)
  // No listing_live emails sent (AC-26) — pipeline bypasses event bus entirely
  const committed = await commitListings(integrity.committed, db)

  return { phase1, phase2, integrity, phase4, committed }
}
