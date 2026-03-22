// Sponsored placement selection — S8 §4, CR §4.4
// Selects 0–3 paid listings for sponsored section in search results.
// Pipeline: candidate pool → quality floor → slot count → fairness cap → rotation → impression recording.

import { eq, and, sql, gte, lte, inArray } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import { logDecision } from "@/lib/decisions/logger"
import { listings, qualityScores, listingTaxonomyTags } from "@/db/schema/data-and-listings"
import { sponsoredImpressions } from "@/db/schema/commercial"

// --- Types ---

export type SponsoredListingResult = {
  listingId: string
  position: number
  isSponsored: true
}

export type SponsoredPlacementInput = {
  sectorId?: number
  serviceAreaIds?: number[]
  locationSlug?: string
}

type Candidate = {
  listingId: string
  composite: number
}

// --- Slot count (AC-32) ---

export function computeSlotCount(qualifiedCount: number): number {
  if (qualifiedCount < 3) return 0
  if (qualifiedCount <= 5) return 1
  if (qualifiedCount <= 10) return 2
  return 3
}

// --- Deterministic daily rotation (AC-33) ---
// Non-cryptographic hash: same listingId + same UTC date → same offset.

export function dailyRotationOffset(listingId: string, utcDateStr: string): number {
  let hash = 0
  const input = `${listingId}:${utcDateStr}`
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// --- Main selection function ---

export async function selectSponsoredListings(
  db: Db,
  decisionLogDb: DecisionLogDb,
  input: SponsoredPlacementInput,
): Promise<SponsoredListingResult[]> {
  // 1. Candidate pool: Premium/Partner + active + claimed (accountId not null) + taxonomy overlap
  const candidates = await getCandidatePool(db, input)

  // 2. Quality floor: composite >= 50 (AC-31)
  const qualified = candidates.filter((c) => c.composite >= 50)

  // 3. Slot count (AC-32)
  const slotCount = computeSlotCount(qualified.length)
  if (slotCount === 0) {
    await logPlacementDecision(decisionLogDb, {
      candidateCount: candidates.length,
      qualifiedCount: qualified.length,
      fairnessCappedCount: 0,
      selectedListingIds: [],
      slotCount: 0,
    })
    return []
  }

  // 4. Fairness cap: exclude listings > 3x mean impressions in 30-day window (AC-34)
  // Also probabilistic cleanup of >90-day rows (AC-36)
  const serviceAreaIds = input.serviceAreaIds ?? []
  const afterFairness = await applyFairnessCap(db, qualified, serviceAreaIds)
  const fairnessCappedCount = qualified.length - afterFairness.length

  // 5. Deterministic rotation (AC-33)
  const today = new Date().toISOString().slice(0, 10)
  const rotated = afterFairness
    .map((c) => ({ ...c, offset: dailyRotationOffset(c.listingId, today) }))
    .sort((a, b) => a.offset - b.offset)

  const selected = rotated.slice(0, slotCount)

  // 6. Record impressions (AC-35)
  if (selected.length > 0 && serviceAreaIds.length > 0) {
    await recordImpressions(db, selected.map((s) => s.listingId), serviceAreaIds)
  }

  // 7. Log decision (AC-38)
  await logPlacementDecision(decisionLogDb, {
    candidateCount: candidates.length,
    qualifiedCount: qualified.length,
    fairnessCappedCount,
    selectedListingIds: selected.map((s) => s.listingId),
    slotCount,
  })

  return selected.map((s, i) => ({
    listingId: s.listingId,
    position: i,
    isSponsored: true as const,
  }))
}

// --- Candidate pool query (AC-30) ---

async function getCandidatePool(
  db: Db,
  input: SponsoredPlacementInput,
): Promise<Candidate[]> {
  const conditions = [
    inArray(listings.subscriptionTier, ["premium", "partner"]),
    eq(listings.lifecycleStatus, "active"),
    sql`${listings.accountId} IS NOT NULL`,
  ]

  // Build base query with quality join
  let query = db
    .select({
      listingId: listings.id,
      composite: qualityScores.composite,
    })
    .from(listings)
    .innerJoin(qualityScores, eq(qualityScores.listingId, listings.id))

  // Taxonomy overlap filter: if serviceAreaIds provided, filter by those
  if (input.serviceAreaIds && input.serviceAreaIds.length > 0) {
    query = query.innerJoin(
      listingTaxonomyTags,
      eq(listingTaxonomyTags.listingId, listings.id),
    ) as typeof query
    conditions.push(
      inArray(listingTaxonomyTags.serviceAreaId, input.serviceAreaIds),
    )
  } else if (input.sectorId != null) {
    query = query.innerJoin(
      listingTaxonomyTags,
      eq(listingTaxonomyTags.listingId, listings.id),
    ) as typeof query
    conditions.push(eq(listingTaxonomyTags.sectorId, input.sectorId))
  }

  const rows = await query.where(and(...conditions))

  // Deduplicate — a listing may match multiple taxonomy tags
  const seen = new Set<string>()
  const result: Candidate[] = []
  for (const row of rows) {
    if (!seen.has(row.listingId)) {
      seen.add(row.listingId)
      result.push({ listingId: row.listingId, composite: row.composite })
    }
  }
  return result
}

// --- Fairness cap (AC-34, AC-36) ---

export async function applyFairnessCap(
  db: Db,
  qualified: Candidate[],
  serviceAreaIds: number[],
): Promise<Candidate[]> {
  if (qualified.length === 0 || serviceAreaIds.length === 0) return qualified

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Probabilistic cleanup: 5% chance per invocation (AC-36)
  if (Math.random() < 0.05) {
    await cleanupOldImpressions(db)
  }

  // Count impressions per listing in 30-day window for relevant service areas
  const impressionCounts = await db
    .select({
      listingId: sponsoredImpressions.listingId,
      count: sql<number>`count(*)::int`,
    })
    .from(sponsoredImpressions)
    .where(
      and(
        inArray(sponsoredImpressions.serviceAreaId, serviceAreaIds),
        gte(sponsoredImpressions.impressionDate, thirtyDaysAgo),
      ),
    )
    .groupBy(sponsoredImpressions.listingId)

  if (impressionCounts.length === 0) return qualified

  const countMap = new Map(impressionCounts.map((r) => [r.listingId, r.count]))
  const totalImpressions = impressionCounts.reduce((sum, r) => sum + r.count, 0)
  const meanImpressions = totalImpressions / impressionCounts.length

  // Exclude listings exceeding 3x mean
  return qualified.filter((c) => {
    const count = countMap.get(c.listingId) ?? 0
    return count <= meanImpressions * 3
  })
}

// --- Impression recording (AC-35) ---

export async function recordImpressions(
  db: Db,
  listingIds: string[],
  serviceAreaIds: number[],
): Promise<void> {
  const now = new Date()
  const rows = listingIds.flatMap((listingId) =>
    serviceAreaIds.map((serviceAreaId) => ({
      listingId,
      serviceAreaId,
      impressionDate: now,
    })),
  )
  if (rows.length > 0) {
    await db.insert(sponsoredImpressions).values(rows)
  }
}

// --- Cleanup (AC-36) ---

export async function cleanupOldImpressions(db: Db): Promise<void> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  await db
    .delete(sponsoredImpressions)
    .where(lte(sponsoredImpressions.impressionDate, ninetyDaysAgo))
}

// --- Decision logging (AC-38) ---

type PlacementDecisionOutput = {
  candidateCount: number
  qualifiedCount: number
  fairnessCappedCount: number
  selectedListingIds: string[]
  slotCount: number
}

async function logPlacementDecision(
  decisionLogDb: DecisionLogDb,
  output: PlacementDecisionOutput,
): Promise<void> {
  await logDecision(decisionLogDb, {
    domain: "commercial",
    decisionType: "sponsored_placement_selection",
    inputs: {},
    output: output as unknown as Record<string, unknown>,
  })
}
