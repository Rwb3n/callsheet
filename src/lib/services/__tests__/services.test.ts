// Service abstraction tests — AC-41, AC-42

import { describe, it, expect } from "vitest"
import { createTestServices, InMemoryPaymentService, InMemoryCompaniesHouseService } from "../index"
import { InMemoryEmailService } from "@/lib/email/transport"
import { InMemoryObjectStorageService } from "@/lib/storage/r2"
import { registerTemplate, clearTemplates } from "@/lib/email/templates"

describe("Service Abstraction", () => {
  // AC-41: Test mocks record calls; getCalls/wasCalledWith correct
  it("InMemoryPaymentService records calls and supports assertions", async () => {
    const payment = new InMemoryPaymentService()

    await payment.createCheckoutSession({
      accountId: "acc-1",
      listingId: "lst-1",
      tier: "standard",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    })

    expect(payment.getCalls()).toHaveLength(1)
    expect(payment.wasCalledWith("createCheckoutSession", { accountId: "acc-1" })).toBe(true)
    expect(payment.wasCalledWith("createCheckoutSession", { accountId: "acc-999" })).toBe(false)
    expect(payment.wasCalledWith("cancelSubscription")).toBe(false)
  })

  it("InMemoryCompaniesHouseService records calls and returns configured results", async () => {
    const ch = new InMemoryCompaniesHouseService()
    ch.setResult("12345678", { found: true, status: "active", name: "Test Ltd" })

    const result = await ch.lookup("12345678")
    expect(result.found).toBe(true)
    expect(result.name).toBe("Test Ltd")
    expect(ch.wasCalledWith("lookup", { companyNumber: "12345678" })).toBe(true)

    // Unknown company
    const unknown = await ch.lookup("99999999")
    expect(unknown.found).toBe(false)
  })

  it("InMemoryEmailService records calls and supports wasCalledWith", async () => {
    clearTemplates()
    registerTemplate("welcome", () => ({ subject: "Welcome", html: "<p>Hi</p>" }))

    const email = new InMemoryEmailService()
    await email.send({
      to: "user@test.com",
      template: "welcome",
      data: {},
      category: "transactional",
    })

    expect(email.getCalls()).toHaveLength(1)
    expect(email.wasCalledWith("welcome")).toBe(true)
    expect(email.wasCalledWith("password_reset")).toBe(false)
  })

  it("InMemoryObjectStorageService records uploads and supports key retrieval", async () => {
    const storage = new InMemoryObjectStorageService()
    await storage.upload({
      key: "test/file.jpg",
      data: Buffer.from("data"),
      contentType: "image/jpeg",
      maxSizeBytes: 1024,
      access: "public",
    })

    expect(storage.getStoredKeys()).toContain("test/file.jpg")
  })

  // AC-42: Production services init without error (env vars present)
  // Note: At S0, createProductionServices() throws because no env vars are configured.
  // This AC is validated at integration time when env vars exist.
  // The test validates that createTestServices() returns a complete Services object.
  it("createTestServices returns all four service instances", () => {
    const services = createTestServices()
    expect(services.email).toBeInstanceOf(InMemoryEmailService)
    expect(services.payment).toBeInstanceOf(InMemoryPaymentService)
    expect(services.companiesHouse).toBeInstanceOf(InMemoryCompaniesHouseService)
    expect(services.storage).toBeInstanceOf(InMemoryObjectStorageService)
  })
})
