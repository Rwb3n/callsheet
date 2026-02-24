// AC-42 smoke test — CS-WORK-034 AC-06
// Loads .env.local and calls createProductionServices() — asserts no throw.
// Vitest test, not Playwright. Validates the factory is callable with env vars present.

import { describe, it, expect, beforeAll } from "vitest"
import { config } from "dotenv"
import { resolve } from "path"

beforeAll(() => {
  config({ path: resolve(process.cwd(), ".env.local") })
})

describe("Production services smoke test", () => {
  it("createProductionServices() does not throw with .env.local vars (AC-42)", async () => {
    // Dynamic import after dotenv loads — env vars must be available at construction time
    const { createProductionServices } = await import("../index")

    expect(() => createProductionServices()).not.toThrow()
  })

  it("returns a Services object with all four fields", async () => {
    const { createProductionServices } = await import("../index")

    const services = createProductionServices()
    expect(services.email).toBeDefined()
    expect(services.payment).toBeDefined()
    expect(services.companiesHouse).toBeDefined()
    expect(services.storage).toBeDefined()
  })
})
