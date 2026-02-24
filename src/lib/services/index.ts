// Service abstraction layer — SI §10, S0 §11

import { InMemoryEmailService, ResendEmailService } from "@/lib/email/transport"
import { InMemoryObjectStorageService } from "@/lib/storage/r2"
import { InMemoryPaymentService, InMemoryCompaniesHouseService } from "./mocks"
import type { Services } from "./types"

export function createTestServices(): Services {
  return {
    email: new InMemoryEmailService(),
    payment: new InMemoryPaymentService(),
    companiesHouse: new InMemoryCompaniesHouseService(),
    storage: new InMemoryObjectStorageService(),
  }
}

// Production services — uses real clients where env vars exist, in-memory fallbacks otherwise.
// Real Resend/Paddle/R2 clients wired progressively as env vars are populated.
export function createProductionServices(): Services {
  const email = process.env.RESEND_API_KEY
    ? new ResendEmailService({
        apiKey: process.env.RESEND_API_KEY,
        fromAddress: process.env.RESEND_FROM_ADDRESS ?? "noreply@callsheet.co.uk",
        getPreferences: async () => null,
      })
    : new InMemoryEmailService()

  return {
    email,
    payment: new InMemoryPaymentService(),
    companiesHouse: new InMemoryCompaniesHouseService(),
    storage: new InMemoryObjectStorageService(),
  }
}

export { InMemoryPaymentService, InMemoryCompaniesHouseService } from "./mocks"
export type { Services, PaymentService, CompaniesHouseService, PaddleSubscription, SubscriptionTier } from "./types"
