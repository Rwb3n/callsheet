// Taxonomy seed — S1 §8, AC-07, AC-08
// Inserts 7 sectors, ~64 service areas, ~269 specialisations.
// Idempotent: ON CONFLICT DO NOTHING on all inserts.
// Run: npx tsx src/db/seed/taxonomy.ts

import { drizzle } from "drizzle-orm/node-postgres"
import { sql } from "drizzle-orm"
import pg from "pg"
import {
  taxonomySectors,
  taxonomyServiceAreas,
  taxonomySpecialisations,
} from "../schema/data-and-listings"
import taxonomyData from "./taxonomy-data.json"

type SeedSpec = {
  name: string
  slug: string
  sortOrder: number
  specialisations: { name: string; slug: string; sortOrder: number }[]
}

type SeedSector = {
  name: string
  slug: string
  sortOrder: number
  serviceAreas: SeedSpec[]
}

type DrizzleDb = ReturnType<typeof drizzle>

type SeedResult = {
  sectors: number
  serviceAreas: number
  specialisations: number
}

/** Insert all taxonomy data. Idempotent — ON CONFLICT DO NOTHING. */
export async function seedTaxonomy(db: DrizzleDb): Promise<SeedResult> {
  const sectors = taxonomyData as SeedSector[]
  let sectorCount = 0
  let serviceAreaCount = 0
  let specCount = 0

  for (const sector of sectors) {
    const [row] = await db
      .insert(taxonomySectors)
      .values({ name: sector.name, slug: sector.slug, sortOrder: sector.sortOrder })
      .onConflictDoNothing({ target: taxonomySectors.slug })
      .returning({ id: taxonomySectors.id })

    const sectorId = row?.id ?? (
      await db.select({ id: taxonomySectors.id })
        .from(taxonomySectors)
        .where(sql`${taxonomySectors.slug} = ${sector.slug}`)
        .then(r => r[0].id)
    )
    sectorCount++

    for (const sa of sector.serviceAreas) {
      const [saRow] = await db
        .insert(taxonomyServiceAreas)
        .values({ sectorId, name: sa.name, slug: sa.slug, sortOrder: sa.sortOrder })
        .onConflictDoNothing()
        .returning({ id: taxonomyServiceAreas.id })

      const saId = saRow?.id ?? (
        await db.select({ id: taxonomyServiceAreas.id })
          .from(taxonomyServiceAreas)
          .where(sql`${taxonomyServiceAreas.sectorId} = ${sectorId} AND ${taxonomyServiceAreas.slug} = ${sa.slug}`)
          .then(r => r[0].id)
      )
      serviceAreaCount++

      for (const spec of sa.specialisations) {
        await db
          .insert(taxonomySpecialisations)
          .values({ serviceAreaId: saId, name: spec.name, slug: spec.slug, sortOrder: spec.sortOrder })
          .onConflictDoNothing()
        specCount++
      }
    }
  }

  return { sectors: sectorCount, serviceAreas: serviceAreaCount, specialisations: specCount }
}

// CLI entrypoint — only runs when executed directly
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const db = drizzle({ client: pool })

  const result = await seedTaxonomy(db)
  console.log(`Seeded: ${result.sectors} sectors, ${result.serviceAreas} service areas, ${result.specialisations} specialisations`)
  await pool.end()
}

// Detect CLI execution (not import)
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("seed/taxonomy.ts")
  || process.argv[1]?.replace(/\\/g, "/").endsWith("seed/taxonomy.js")
if (isMain) {
  main().catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
}
