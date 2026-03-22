// createProductionAppServices — CH-CS-014 W1 AC-01

import { describe, it, expect, afterEach } from "vitest"
import { createProductionAppServices, _resetAppServicesSingleton } from "../index"
import { _resetEventBusSingleton } from "@/lib/events/singleton"

afterEach(() => {
  _resetAppServicesSingleton()
  _resetEventBusSingleton()
})

describe("createProductionAppServices", () => {
  it("returns a valid AppServices object with all 11 required fields (AC-01)", () => {
    const services = createProductionAppServices()

    expect(services.db).toBeDefined()
    expect(services.bus).toBeDefined()
    expect(services.waitUntilFn).toBeTypeOf("function")
    expect(services.schedulerDb).toBeDefined()
    expect(services.decisionLogDb).toBeDefined()
    expect(services.notificationDb).toBeDefined()
    expect(services.emailService).toBeDefined()
    expect(services.companiesHouse).toBeDefined()
    expect(services.payment).toBeDefined()
    expect(services.storage).toBeDefined()
    expect(services.flowDb).toBeDefined()
  })

  it("returns the same instance on repeated calls", () => {
    const first = createProductionAppServices()
    const second = createProductionAppServices()
    expect(first).toBe(second)
  })

  it("processImage is wired to production image processor", () => {
    const services = createProductionAppServices()
    expect(services.processImage).toBeTypeOf("function")
  })
})
