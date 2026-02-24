// Synonym expansion — S1 §3.3
// Query-time term widening against the search_synonyms table.

import { eq } from "drizzle-orm"
import { searchSynonyms } from "@/db/schema/data-and-listings"
import type { Db } from "@/db/types"

type ExpandedTerm = {
  original: string
  synonyms: Array<{ synonym: string; weight: number }>
}

/** Expand a single term against the synonyms table. */
async function expandTerm(db: Db, term: string): Promise<ExpandedTerm> {
  const rows = await db
    .select({ synonym: searchSynonyms.synonym, weight: searchSynonyms.weight })
    .from(searchSynonyms)
    .where(eq(searchSynonyms.term, term.toLowerCase()))

  return { original: term, synonyms: rows }
}

/**
 * Expand all words in a query string against synonyms.
 * Returns a tsquery-compatible string: original terms OR their synonyms.
 * Example: "gaffer lighting" with synonym gaffer→"lighting director"
 *   → "gaffer | 'lighting director' & lighting"
 */
export async function expandQuery(db: Db, query: string): Promise<string> {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""

  const expanded = await Promise.all(words.map((w) => expandTerm(db, w)))

  const parts = expanded.map((e) => {
    if (e.synonyms.length === 0) return e.original
    const synonymTerms = e.synonyms.map((s) => s.synonym)
    return [e.original, ...synonymTerms].join(" | ")
  })

  return parts.join(" & ")
}
