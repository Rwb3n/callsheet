// Service abstraction layer — SI §10, S0 §11

import { InMemoryEmailService, ResendEmailService } from "@/lib/email/transport"
import { InMemoryObjectStorageService } from "@/lib/storage/r2"
import { InMemoryPaymentService, InMemoryCompaniesHouseService } from "./mocks"
import type { Services } from "./types"
import type { AppServices } from "@/server/root"
import { getDb } from "@/db"
import { getEventBus } from "@/lib/events/singleton"
import { createSchedulerDb, createDecisionLogDb, createNotificationDb, createFlowDb } from "@/db/adapters"
import { processListingImage } from "@/lib/image-processing/variants"
import { waitUntil } from "@vercel/functions"

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

// Full AppServices for createAppRouter — CH-CS-014 W1 AC-01
// Lazy: each field constructed once on first call, reused thereafter.
let _appServices: AppServices | null = null

export function createProductionAppServices(): AppServices {
  if (_appServices) return _appServices

  const db = getDb()
  const services = createProductionServices()
  const bus = getEventBus({
    payment: services.payment,
    emailService: services.email,
    waitUntilFn: (p: Promise<void>) => { waitUntil(p) },
  })

  // Vercel waitUntil keeps async consumers alive after response send.
  // Falls back to fire-and-forget outside Vercel (local dev, tests).
  const waitUntilFn = (p: Promise<void>) => { waitUntil(p) }

  _appServices = {
    db,
    bus,
    waitUntilFn,
    schedulerDb: createSchedulerDb(db),
    decisionLogDb: createDecisionLogDb(db),
    notificationDb: createNotificationDb(db),
    emailService: services.email,
    companiesHouse: services.companiesHouse,
    payment: services.payment,
    storage: services.storage,
    flowDb: createFlowDb(db),
    processImage: processListingImage,
  }
  return _appServices
}

// Reset for tests — not for production use
export function _resetAppServicesSingleton(): void {
  _appServices = null
}

export { InMemoryPaymentService, InMemoryCompaniesHouseService } from "./mocks"
export type { Services, PaymentService, CompaniesHouseService, PaddleSubscription, SubscriptionTier } from "./types"
