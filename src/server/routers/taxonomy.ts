// Taxonomy routes — S1 §4.4, AC-22
// Read-only, public. Fuzzy search via pg_trgm similarity.

import { z } from "zod"
import { eq, sql, asc } from "drizzle-orm"
import { router, publicProcedure } from "@/server/trpc"
import type { Db } from "@/db/types"
import { rawQuery } from "@/db/raw-query"
import {
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
} from "@/db/schema/data-and-listings"

export type TaxonomyRouterDeps = { db: Db }

export function createTaxonomyRouter(deps: TaxonomyRouterDeps) {
  return router({
    getSectors: publicProcedure.query(async () => {
      return deps.db
        .select({
          id: taxonomySectors.id,
          name: taxonomySectors.name,
          slug: taxonomySectors.slug,
          sortOrder: taxonomySectors.sortOrder,
          serviceAreaCount: sql<number>`(
            SELECT count(*)::int FROM taxonomy_service_areas
            WHERE taxonomy_service_areas.sector_id = ${taxonomySectors.id}
          )`,
        })
        .from(taxonomySectors)
        .orderBy(asc(taxonomySectors.sortOrder))
    }),

    getServiceAreas: publicProcedure
      .input(z.object({ sectorSlug: z.string() }))
      .query(async ({ input }) => {
        const [sector] = await deps.db
          .select()
          .from(taxonomySectors)
          .where(eq(taxonomySectors.slug, input.sectorSlug))
          .limit(1)
        if (!sector) return []

        return deps.db
          .select({
            id: taxonomyServiceAreas.id,
            name: taxonomyServiceAreas.name,
            slug: taxonomyServiceAreas.slug,
            sectorId: taxonomyServiceAreas.sectorId,
            sortOrder: taxonomyServiceAreas.sortOrder,
            specialisationCount: sql<number>`(
              SELECT count(*)::int FROM taxonomy_specialisations
              WHERE taxonomy_specialisations.service_area_id = ${taxonomyServiceAreas.id}
            )`,
          })
          .from(taxonomyServiceAreas)
          .where(eq(taxonomyServiceAreas.sectorId, sector.id))
          .orderBy(asc(taxonomyServiceAreas.sortOrder))
      }),

    getSpecialisations: publicProcedure
      .input(z.object({ serviceAreaId: z.number().int() }))
      .query(async ({ input }) => {
        return deps.db
          .select()
          .from(taxonomySpecialisations)
          .where(eq(taxonomySpecialisations.serviceAreaId, input.serviceAreaId))
          .orderBy(asc(taxonomySpecialisations.sortOrder))
      }),

    // AC-22: fuzzy search across all 3 taxonomy levels via pg_trgm
    search: publicProcedure
      .input(z.object({ query: z.string().min(2) }))
      .query(async ({ input }) => {
        const q = input.query
        type TaxonomySearchResult = {
          level: "sector" | "service_area" | "specialisation"
          id: number
          name: string
          slug: string
          relevance: number
        }
        return rawQuery<TaxonomySearchResult>(deps.db, sql`
          SELECT 'sector' AS level, id, name, slug, similarity(name, ${q}) AS relevance
          FROM taxonomy_sectors
          WHERE similarity(name, ${q}) > 0.2
          UNION ALL
          SELECT 'service_area' AS level, id, name, slug, similarity(name, ${q}) AS relevance
          FROM taxonomy_service_areas
          WHERE similarity(name, ${q}) > 0.2
          UNION ALL
          SELECT 'specialisation' AS level, id, name, slug, similarity(name, ${q}) AS relevance
          FROM taxonomy_specialisations
          WHERE similarity(name, ${q}) > 0.2
          ORDER BY relevance DESC
          LIMIT 50
        `)
      }),
  })
}
