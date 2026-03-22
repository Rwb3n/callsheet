// taxonomy_review_preparation deferred action handler — S9 §4.1
// Quarterly ceremony: analyses taxonomy coverage, identifies underused specialisations,
// evaluates zero-result queries as taxonomy gap signals.

import { eq, sql, desc } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { ActionHandlerRegistry } from "@/lib/scheduler"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { logDecision } from "@/lib/decisions/logger"
import {
  listingTaxonomyTags,
  taxonomySpecialisations,
  zeroResultQueries,
} from "@/db/schema/data-and-listings"
import {
  checkCeremonyIdempotency,
  logCeremonyRun,
  evaluateCeremonyOutcome,
  scheduleCeremonyNextRun,
  getNextRunDate,
  computeInputsHash,
  currentQuarter,
  startOfQuarter,
} from "@/domains/intelligence/ceremony/infrastructure"

const TAXONOMY_PROMOTION_MIN_FREQUENCY = 20
const TAXONOMY_SIMILARITY_THRESHOLD = 0.8

export type TaxonomyReviewPreparationDeps = {
  db: Db
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
}

export function registerTaxonomyReviewPreparationHandler(
  registry: ActionHandlerRegistry,
  deps: TaxonomyReviewPreparationDeps,
): void {
  registry.register("taxonomy_review_preparation", async (_params) => {
    const ceremonyType = "taxonomy_review" as const
    const hash = computeInputsHash({ quarter: currentQuarter() })
    const nextRunAt = getNextRunDate(ceremonyType)

    // 1. Idempotency guard
    const idempotency = await checkCeremonyIdempotency(deps.db, ceremonyType, hash)
    if (idempotency.skip) {
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 2. Prerequisite: at least one taxonomy tag must exist
    const [tagCountRow] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingTaxonomyTags)

    if (tagCountRow.count === 0) {
      // Pattern #15: insufficient_data early return
      await logCeremonyRun(deps.db, {
        ceremonyType,
        status: "completed",
        inputsHash: hash,
        outputs: { status: "insufficient_data", reason: "no taxonomy data" },
        decisionsLogged: 0,
        nextScheduledAt: nextRunAt,
      })
      await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
      return
    }

    // 3. Analyse taxonomy coverage
    // 3a. Count total tags and distinct specialisations used
    const [totalTags] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingTaxonomyTags)

    const [usedSpecialisations] = await deps.db
      .select({ count: sql<number>`count(DISTINCT ${listingTaxonomyTags.specialisationId})::int` })
      .from(listingTaxonomyTags)
      .where(sql`${listingTaxonomyTags.specialisationId} IS NOT NULL`)

    const [totalSpecialisations] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(taxonomySpecialisations)

    const coverageRate = totalSpecialisations.count > 0
      ? usedSpecialisations.count / totalSpecialisations.count
      : 0

    // 3b. Find zero-result queries from current quarter as taxonomy gap signals
    const quarterStart = startOfQuarter(new Date())
    const zeroResultRows = await deps.db
      .select({
        query: zeroResultQueries.query,
        count: sql<number>`count(*)::int`,
      })
      .from(zeroResultQueries)
      .where(sql`${zeroResultQueries.createdAt} >= ${quarterStart}`)
      .groupBy(zeroResultQueries.query)
      .orderBy(desc(sql`count(*)::int`))
      .limit(50)

    // 3c. Load all specialisation names for similarity matching
    const allSpecialisations = await deps.db
      .select({ name: taxonomySpecialisations.name })
      .from(taxonomySpecialisations)

    const specialisationNames = allSpecialisations.map((s) => s.name)

    // 3d. Identify zero-result queries that are promotable taxonomy candidates
    const promotableTags: Array<{
      tag: string
      frequency: number
      closestMatch: string | null
      similarity: number
    }> = []

    for (const row of zeroResultRows) {
      if (row.count < TAXONOMY_PROMOTION_MIN_FREQUENCY) continue

      const match = findClosestTaxonomyNode(row.query, specialisationNames)
      promotableTags.push({
        tag: row.query,
        frequency: row.count,
        closestMatch: match.name,
        similarity: match.similarity,
      })
    }

    // 4. Evaluate promotable tags
    let decisionsLogged = 0

    for (const tag of promotableTags) {
      if (tag.closestMatch && tag.similarity > TAXONOMY_SIMILARITY_THRESHOLD) {
        await evaluateCeremonyOutcome(deps.decisionLogDb, {
          ceremonyType,
          recommendation: {
            action: `promote_tag:${tag.tag}`,
            hasFinancialImpact: false,
            hasUserVisibleChange: true,
            precedentExists: false,
          },
        })
        decisionsLogged += 1

        await logDecision(deps.decisionLogDb, {
          domain: "data-and-listings",
          decisionType: "taxonomy_promotion_evaluation",
          inputs: {
            tag: tag.tag,
            frequency: tag.frequency,
            closestMatch: tag.closestMatch,
            similarity: tag.similarity,
          },
          output: {
            recommendation: "promote",
            suggestedParent: tag.closestMatch,
          },
        })
        decisionsLogged += 1
      }
    }

    // 5. Build report
    const report = {
      promotableTags,
      totalFreeTextTags: zeroResultRows.length,
      totalTaxonomyTags: totalTags.count,
      usedSpecialisations: usedSpecialisations.count,
      totalSpecialisations: totalSpecialisations.count,
      coverageRate,
    }

    // 6. Log ceremony run and schedule next
    await logCeremonyRun(deps.db, {
      ceremonyType,
      status: "completed",
      inputsHash: hash,
      outputs: report,
      decisionsLogged,
      nextScheduledAt: nextRunAt,
    })
    await scheduleCeremonyNextRun(deps.schedulerDb, ceremonyType, nextRunAt)
  })
}

// --- Similarity helper ---

interface TaxonomyMatch {
  name: string | null
  similarity: number
}

/**
 * Find the closest taxonomy specialisation name to a given tag.
 * Uses a simple approach: lowercase containment check + character overlap ratio.
 */
export function findClosestTaxonomyNode(
  tag: string,
  specialisationNames: string[],
): TaxonomyMatch {
  if (specialisationNames.length === 0) {
    return { name: null, similarity: 0 }
  }

  const normTag = tag.toLowerCase().trim()
  let bestMatch: TaxonomyMatch = { name: null, similarity: 0 }

  for (const name of specialisationNames) {
    const normName = name.toLowerCase().trim()

    // Exact match
    if (normTag === normName) {
      return { name, similarity: 1.0 }
    }

    // Containment: one contains the other
    if (normTag.includes(normName) || normName.includes(normTag)) {
      const shorter = Math.min(normTag.length, normName.length)
      const longer = Math.max(normTag.length, normName.length)
      const sim = longer > 0 ? shorter / longer : 0
      if (sim > bestMatch.similarity) {
        bestMatch = { name, similarity: sim }
      }
      continue
    }

    // Character overlap ratio (bigram similarity)
    const sim = bigramSimilarity(normTag, normName)
    if (sim > bestMatch.similarity) {
      bestMatch = { name, similarity: sim }
    }
  }

  return bestMatch
}

/** Compute bigram (character pair) similarity between two strings. */
function bigramSimilarity(a: string, b: string): number {
  const bigramsA = toBigrams(a)
  const bigramsB = toBigrams(b)

  if (bigramsA.size === 0 && bigramsB.size === 0) return 1
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0

  let intersection = 0
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}

function toBigrams(s: string): Set<string> {
  const bigrams = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.slice(i, i + 2))
  }
  return bigrams
}
