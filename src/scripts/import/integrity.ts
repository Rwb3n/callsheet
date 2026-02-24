// Batch import integrity — S2 §6.4, AC-24
// Sorted-neighbour dedup (window 10, similarity >0.9) + CH number clustering.
// Uses pg_trgm similarity() for name comparison — requires database connection.

import { sql } from "drizzle-orm"
import type { Db } from "@/db/types"
import { rawQuery } from "@/db/raw-query"
import type { CleanedRecord, FlaggedRecord, BatchIntegrityResult } from "./types"

const WINDOW_SIZE = 10
const SIMILARITY_THRESHOLD = 0.9

export async function nameSimilarity(db: Db, a: string, b: string): Promise<number> {
  const rows = await rawQuery<{ similarity: number }>(
    db,
    sql`SELECT similarity(${a}, ${b})::real as similarity`,
  )
  return Number(rows[0]?.similarity ?? 0)
}

export async function clusterByNameSimilarity(
  sortedRecords: CleanedRecord[],
  db: Db,
  threshold = SIMILARITY_THRESHOLD,
  windowSize = WINDOW_SIZE,
): Promise<CleanedRecord[][]> {
  // Union-Find for merging clusters
  const parent = new Map<string, string>()

  function find(id: string): string {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression
    let curr = id
    while (curr !== root) {
      const next = parent.get(curr)!
      parent.set(curr, root)
      curr = next
    }
    return root
  }

  function union(a: string, b: string) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const r of sortedRecords) parent.set(r.sourceId, r.sourceId)

  // Compare each record with up to windowSize neighbours
  for (let i = 0; i < sortedRecords.length; i++) {
    const limit = Math.min(i + windowSize, sortedRecords.length)
    for (let j = i + 1; j < limit; j++) {
      const sim = await nameSimilarity(db, sortedRecords[i].name, sortedRecords[j].name)
      if (sim > threshold) {
        union(sortedRecords[i].sourceId, sortedRecords[j].sourceId)
      }
    }
  }

  // Group by root
  const groups = new Map<string, CleanedRecord[]>()
  for (const r of sortedRecords) {
    const root = find(r.sourceId)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(r)
  }

  return [...groups.values()].filter((g) => g.length > 1)
}

export function clusterByCHNumber(records: CleanedRecord[]): CleanedRecord[][] {
  const groups = new Map<string, CleanedRecord[]>()
  for (const r of records) {
    if (!r.companiesHouseNumber) continue
    const key = r.companiesHouseNumber.toUpperCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

export function selectMostComplete(cluster: CleanedRecord[]): CleanedRecord {
  return cluster.reduce((best, r) => {
    const score = countNonNull(r)
    return score > countNonNull(best) ? r : best
  })
}

function countNonNull(r: CleanedRecord): number {
  let count = 0
  if (r.contactEmail) count++
  if (r.contactPhone) count++
  if (r.websiteUrl) count++
  if (r.basePostcode) count++
  if (r.baseRegion) count++
  if (r.bio) count++
  if (r.companiesHouseNumber) count++
  count += r.services.length
  return count
}

export function mergeClusters(
  nameClusters: CleanedRecord[][],
  chClusters: CleanedRecord[][],
): CleanedRecord[][] {
  // Merge overlapping clusters using union-find on sourceId
  const parent = new Map<string, string>()

  function find(id: string): string {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    let curr = id
    while (curr !== root) {
      const next = parent.get(curr)!
      parent.set(curr, root)
      curr = next
    }
    return root
  }

  function union(a: string, b: string) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  const allRecords = new Map<string, CleanedRecord>()

  for (const cluster of [...nameClusters, ...chClusters]) {
    for (const r of cluster) {
      if (!parent.has(r.sourceId)) parent.set(r.sourceId, r.sourceId)
      allRecords.set(r.sourceId, r)
    }
    // Union all records in this cluster
    for (let i = 1; i < cluster.length; i++) {
      union(cluster[0].sourceId, cluster[i].sourceId)
    }
  }

  const groups = new Map<string, CleanedRecord[]>()
  for (const [id] of allRecords) {
    const root = find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(allRecords.get(id)!)
  }

  return [...groups.values()].filter((g) => g.length > 1)
}

export async function batchImportIntegrity(
  records: CleanedRecord[],
  db: Db,
): Promise<BatchIntegrityResult> {
  const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name))

  const nameClusters = await clusterByNameSimilarity(sorted, db)
  const chClusters = clusterByCHNumber(sorted)
  const allClusters = mergeClusters(nameClusters, chClusters)

  const duplicateIds = new Set<string>()
  const flagged: FlaggedRecord[] = []

  for (const cluster of allClusters) {
    const best = selectMostComplete(cluster)
    for (const r of cluster) {
      if (r.sourceId !== best.sourceId) {
        duplicateIds.add(r.sourceId)
        flagged.push({ ...r, flagReason: "duplicate", mergeCandidate: best.sourceId })
      }
    }
  }

  const committed = sorted.filter((r) => !duplicateIds.has(r.sourceId))

  return {
    committed,
    flagged,
    stats: { total: records.length, committed: committed.length, duplicates: flagged.length },
  }
}
