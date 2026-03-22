// Event bus singleton — CH-CS-014 W1 AC-02
// Mirrors auth-instance.ts pattern: lazy init, same instance on repeated calls.

import { InProcessEventBus } from "./bus"
import { createLogEventConsumerError } from "./errors"
import { getDb } from "@/db"
import { registerDataAndListingsConsumers } from "@/domains/data-and-listings/consumers"
import { registerPlatformConsumers } from "@/domains/platform/consumers"
import { registerCommercialConsumers } from "@/domains/commercial/consumers"
import { registerOperationsConsumers } from "@/domains/operations/consumers"
import { registerIntelligenceConsumers } from "@/domains/intelligence/consumers"
import { pendingCancellationCreatedHandler } from "@/domains/operations/paddle/consumers"
import { createSchedulerDb, createDecisionLogDb, createNotificationDb } from "@/db/adapters"
import type { PaymentService } from "@/lib/services/types"
import type { EmailService } from "@/lib/email/types"
import type { WaitUntilFn } from "./waitUntil"

const ADMIN_ACCOUNT_ID = process.env.ADMIN_ACCOUNT_ID ?? "admin"

let _bus: InProcessEventBus | null = null

export function getEventBus(overrides?: {
  payment?: PaymentService
  emailService?: EmailService
  waitUntilFn?: WaitUntilFn
}): InProcessEventBus {
  if (_bus) return _bus

  const db = getDb()
  const logError = createLogEventConsumerError(db)
  const bus = new InProcessEventBus({ logError })

  const schedulerDb = createSchedulerDb(db)
  const decisionLogDb = createDecisionLogDb(db)
  const notificationDb = createNotificationDb(db)

  registerDataAndListingsConsumers(bus, { db, schedulerDb })
  registerPlatformConsumers(bus, { notificationDb })

  const waitUntil = overrides?.waitUntilFn ?? ((p: Promise<unknown>) => { p.catch(() => {}) })

  // CR S8 consumers — all 8 handlers (some need emailService)
  if (overrides?.emailService) {
    registerCommercialConsumers(bus, {
      db,
      schedulerDb,
      decisionLogDb,
      notificationDb,
      emailService: overrides.emailService,
      bus,
      waitUntilFn: waitUntil,
    })
  }

  // Ops S7 consumers — all 11 new handlers
  if (overrides?.emailService) {
    const waitUntil = overrides.waitUntilFn ?? ((p: Promise<unknown>) => { p.catch(() => {}) })
    registerOperationsConsumers(bus, {
      db,
      decisionLogDb,
      schedulerDb,
      emailService: overrides.emailService,
      notificationDb,
      adminAccountId: ADMIN_ACCOUNT_ID,
      emit: async (eventType, payload) => {
        await bus.emit(eventType, payload, waitUntil)
      },
    })
  }

  // Intelligence S9 consumers — 15 handlers (10 D&L + 5 CR/Ops)
  registerIntelligenceConsumers(bus, {
    db,
    schedulerDb,
    waitUntilFn: waitUntil,
  })

  // Ops S4 consumer — pending_cancellation_created needs PaymentService
  if (overrides?.payment) {
    bus.on(pendingCancellationCreatedHandler({ db, payment: overrides.payment }))
  }

  _bus = bus
  return bus
}

// Reset for tests — not exported from barrel
export function _resetEventBusSingleton(): void {
  _bus = null
}
