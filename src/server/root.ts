// Root router — merges all domain routers into a single appRouter.
// Exports AppRouter type for tRPC client inference.

import { router } from "@/server/trpc"
import type { Db } from "@/db/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import type { NotificationDb } from "@/lib/notifications"
import type { EmailService } from "@/lib/email/types"
import type { CompaniesHouseService, PaymentService } from "@/lib/services/types"
import type { ObjectStorageService } from "@/lib/storage/types"
import type { ImageProcessor } from "@/lib/image-processing/variants"

import { createListingRouter } from "@/server/routers/listing"
import { createListingCreationRouter } from "@/server/routers/listing-creation"
import { createTaxonomyRouter } from "@/server/routers/taxonomy"
import { createClaimRouter } from "@/server/routers/claim"
import { createSubscriptionRouter } from "@/server/routers/subscription"
import { createMediaRouter } from "@/server/routers/media"
import { createVerificationRouter } from "@/server/routers/verification"
import { createProfileStrengthRouter } from "@/server/routers/profile-strength"
import { createOnboardingRouter } from "@/server/routers/onboarding"
import { createProfileRouter } from "@/server/routers/profile"
import { createEngagementRouter } from "@/server/routers/engagement"
import { createDashboardRouter } from "@/server/routers/dashboard"

// --- Shared services injected at app startup ---

export type AppServices = {
  db: Db
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
  decisionLogDb: DecisionLogDb
  notificationDb: NotificationDb
  emailService: EmailService
  companiesHouse: CompaniesHouseService
  payment: PaymentService
  storage: ObjectStorageService
  processImage?: ImageProcessor
}

// --- Root router ---

export function createAppRouter(services: AppServices) {
  return router({
    listing: createListingRouter({
      db: services.db,
      bus: services.bus,
      waitUntilFn: services.waitUntilFn,
      companiesHouse: services.companiesHouse,
    }),
    listingCreation: createListingCreationRouter({
      db: services.db,
      bus: services.bus,
      waitUntilFn: services.waitUntilFn,
      companiesHouse: services.companiesHouse,
      emailService: services.emailService,
      schedulerDb: services.schedulerDb,
    }),
    taxonomy: createTaxonomyRouter({ db: services.db }),
    claim: createClaimRouter({
      db: services.db,
      schedulerDb: services.schedulerDb,
      decisionLogDb: services.decisionLogDb,
      companiesHouse: services.companiesHouse,
      eventBus: services.bus,
      waitUntilFn: services.waitUntilFn,
      emailService: services.emailService,
      notificationDb: services.notificationDb,
    }),
    subscription: createSubscriptionRouter({
      db: services.db,
      payment: services.payment,
    }),
    media: createMediaRouter({
      db: services.db,
      storage: services.storage,
      processImage: services.processImage,
    }),
    verification: createVerificationRouter({
      db: services.db,
      decisionLogDb: services.decisionLogDb,
      companiesHouse: services.companiesHouse,
      eventBus: services.bus,
      waitUntilFn: services.waitUntilFn,
    }),
    profileStrength: createProfileStrengthRouter({ db: services.db }),
    onboarding: createOnboardingRouter({ db: services.db }),
    profile: createProfileRouter({ db: services.db }),
    engagement: createEngagementRouter({ db: services.db }),
    dashboard: createDashboardRouter({
      db: services.db,
      notificationDb: services.notificationDb,
    }),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>
