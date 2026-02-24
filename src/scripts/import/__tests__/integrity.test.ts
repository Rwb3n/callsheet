// Unit tests: Batch integrity — AC-24

import { describe, it, expect } from "vitest"
import {
  clusterByCHNumber,
  selectMostComplete,
  mergeClusters,
} from "../integrity"
import type { CleanedRecord } from "../types"

function makeRecord(overrides: Partial<CleanedRecord> = {}): CleanedRecord {
  return {
    sourceId: "test-1",
    name: "Test Company",
    entityType: "company",
    services: [],
    flags: [],
    ...overrides,
  }
}

describe("clusterByCHNumber", () => {
  it("clusters records with the same CH number", () => {
    const records = [
      makeRecord({ sourceId: "1", companiesHouseNumber: "12345678" }),
      makeRecord({ sourceId: "2", companiesHouseNumber: "12345678" }),
      makeRecord({ sourceId: "3", companiesHouseNumber: "99999999" }),
    ]
    const clusters = clusterByCHNumber(records)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toHaveLength(2)
    expect(clusters[0].map((r) => r.sourceId).sort()).toEqual(["1", "2"])
  })

  it("ignores records without CH number", () => {
    const records = [
      makeRecord({ sourceId: "1" }),
      makeRecord({ sourceId: "2" }),
    ]
    const clusters = clusterByCHNumber(records)
    expect(clusters).toHaveLength(0)
  })

  it("treats CH numbers case-insensitively", () => {
    const records = [
      makeRecord({ sourceId: "1", companiesHouseNumber: "AB123456" }),
      makeRecord({ sourceId: "2", companiesHouseNumber: "ab123456" }),
    ]
    const clusters = clusterByCHNumber(records)
    expect(clusters).toHaveLength(1)
  })
})

describe("selectMostComplete", () => {
  it("selects the record with the most non-null fields", () => {
    const sparse = makeRecord({ sourceId: "sparse", name: "Sparse" })
    const complete = makeRecord({
      sourceId: "complete",
      name: "Complete",
      contactEmail: "a@b.com",
      contactPhone: "+447700900000",
      websiteUrl: "https://example.com",
      basePostcode: "SW1A 1AA",
      baseRegion: "London",
      bio: "A company",
      companiesHouseNumber: "12345678",
      services: ["camera", "lighting"],
    })
    expect(selectMostComplete([sparse, complete]).sourceId).toBe("complete")
  })

  it("returns first record when all equal", () => {
    const a = makeRecord({ sourceId: "a" })
    const b = makeRecord({ sourceId: "b" })
    expect(selectMostComplete([a, b]).sourceId).toBe("a")
  })
})

describe("mergeClusters", () => {
  it("merges overlapping name and CH clusters", () => {
    const r1 = makeRecord({ sourceId: "1" })
    const r2 = makeRecord({ sourceId: "2" })
    const r3 = makeRecord({ sourceId: "3" })

    // Name cluster: 1, 2. CH cluster: 2, 3. Should merge into one cluster: 1, 2, 3.
    const nameClusters = [[r1, r2]]
    const chClusters = [[r2, r3]]
    const merged = mergeClusters(nameClusters, chClusters)

    expect(merged).toHaveLength(1)
    expect(merged[0]).toHaveLength(3)
  })

  it("keeps non-overlapping clusters separate", () => {
    const r1 = makeRecord({ sourceId: "1" })
    const r2 = makeRecord({ sourceId: "2" })
    const r3 = makeRecord({ sourceId: "3" })
    const r4 = makeRecord({ sourceId: "4" })

    const nameClusters = [[r1, r2]]
    const chClusters = [[r3, r4]]
    const merged = mergeClusters(nameClusters, chClusters)

    expect(merged).toHaveLength(2)
  })

  it("returns empty when no clusters", () => {
    expect(mergeClusters([], [])).toHaveLength(0)
  })
})
