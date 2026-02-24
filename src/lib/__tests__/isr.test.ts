// ISR revalidation tests — AC-35 (SSG homepage), AC-36 (revalidateListingProfile)

import { describe, it, expect, beforeEach } from "vitest"
import { setRevalidateFn, revalidateListingProfile, revalidateSectorLanding, revalidateHomepage } from "../isr"

describe("ISR Revalidation", () => {
  let revalidatedPaths: string[]

  beforeEach(() => {
    revalidatedPaths = []
    setRevalidateFn(async (path) => {
      revalidatedPaths.push(path)
    })
  })

  // AC-36: revalidateListingProfile triggers cache invalidation
  it("revalidateListingProfile revalidates the listing path", async () => {
    await revalidateListingProfile("acme-lighting-london")
    expect(revalidatedPaths).toEqual(["/listing/acme-lighting-london"])
  })

  it("revalidateSectorLanding revalidates sector and optionally location", async () => {
    await revalidateSectorLanding("lighting", "london")
    expect(revalidatedPaths).toEqual(["/lighting/london", "/lighting"])
  })

  it("revalidateSectorLanding without location revalidates sector only", async () => {
    await revalidateSectorLanding("camera")
    expect(revalidatedPaths).toEqual(["/camera"])
  })

  // AC-35: Homepage renders via SSG — validates revalidation utility exists
  it("revalidateHomepage revalidates root path", async () => {
    await revalidateHomepage()
    expect(revalidatedPaths).toEqual(["/"])
  })
})
