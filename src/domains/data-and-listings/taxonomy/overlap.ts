// computeTaxonomyOverlap — D&L §3.1, S1 §6.3
// Jaccard similarity at Service Area level.
// NFR: <50ms p95

import type { TaxonomyTag } from "../integrity/types"

export function computeTaxonomyOverlap(
  tagsA: TaxonomyTag[],
  tagsB: TaxonomyTag[],
): number {
  const key = (t: TaxonomyTag) => `${t.sectorId}:${t.serviceAreaId}`
  const setA = new Set(tagsA.map(key))
  const setB = new Set(tagsB.map(key))
  const unionSize = new Set([...setA, ...setB]).size
  if (unionSize === 0) return 0
  let intersectionSize = 0
  for (const v of setA) {
    if (setB.has(v)) intersectionSize++
  }
  return intersectionSize / unionSize
}
