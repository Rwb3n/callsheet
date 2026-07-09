// GDPR erasure flow — S10 §1, SI §3, SI §13.1
// 6-step orchestrated sequence. Steps 1-3, 5-6 implemented here.
// Step 4 (processErasure) is a placeholder — implemented in CS-WORK-084.

import { eq, and, inArray } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { FlowStepDefinition } from "./types"
import type { FlowDb } from "./engine"
import { executeOrchestratedFlow } from "./engine"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { ObjectStorageService } from "@/lib/storage/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import {
  getClaimIdsForAccount,
  processErasureTransaction,
  processErasureR2Cleanup,
  scheduleQualityRecalculations,
} from "@/domains/data-and-listings/erasure/process-erasure"
import { complianceRegister } from "@/db/schema/operations"
import { supportTickets } from "@/db/schema/operations"
import { listings } from "@/db/schema/data-and-listings"
import { closeDSARCase } from "@/domains/operations/compliance/queries"

// --- ErasureContext (spec §1.2) ---

export type ErasureContext = {
  // Identifiers (set at flow initiation)
  accountId: string
  dsarCaseId: string

  // Step 1: Identity verification
  identityVerifiedAt?: string

  // Step 2: Data extraction
  dataExtracted?: boolean

  // Step 3: Ticket closure
  ticketsClosed?: number

  // Step 4: processErasure results (populated by CS-WORK-084)
  dbTransactionCompleted?: boolean
  listingIdsDeleted: string[]
  listingIdsAnonymised: string[]
  freelancerListingsDeleted: number
  companyListingsAnonymised: number
  r2CleanupCompleted?: boolean
  r2ObjectsDeleted?: number
  qualityRecalcScheduled?: number
  claimIdsForR2Cleanup?: string[]

  // Step 5: DSAR case closure
  dsarCaseClosed?: boolean
  auditRecordCreated?: boolean

  // Step 6: Event emission
  erasureCompletedEmitted?: boolean
}

// --- Deps for step executors ---

export type ErasureFlowDeps = {
  db: Db
  flowDb: FlowDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
  storage: ObjectStorageService
}

// --- Step definitions (spec §1.3) ---

export function buildErasureSteps(
  deps: ErasureFlowDeps,
): FlowStepDefinition<ErasureContext>[] {
  return [
    {
      name: "verify_identity",
      domain: "operations",
      skippable: false, // Legal requirement — SI §3.5 step 1
      async execute(ctx) {
        // Read DSAR case from compliance_register, validate identity verification
        const [dsarCase] = await deps.db
          .select({
            id: complianceRegister.id,
            status: complianceRegister.status,
          })
          .from(complianceRegister)
          .where(
            and(
              eq(complianceRegister.id, ctx.dsarCaseId),
              eq(complianceRegister.type, "dsar"),
            ),
          )

        if (!dsarCase) {
          throw new Error(`DSAR case not found: ${ctx.dsarCaseId}`)
        }

        // Status must be past "open" (identity_verification stage) — Ops §3.3
        if (dsarCase.status === "open") {
          throw new Error(
            "Identity verification not yet complete. Complete identity check via compliance UI before retrying.",
          )
        }

        ctx.identityVerifiedAt = new Date().toISOString()
      },
    },
    {
      name: "extract_account_data",
      domain: "operations",
      skippable: true, // Data loss for audit trail — admin accepts accountability
      async execute(ctx) {
        // Extract personal data into compliance_register details JSONB
        const ownedListings = await deps.db
          .select({ id: listings.id, name: listings.name })
          .from(listings)
          .where(eq(listings.accountId, ctx.accountId))

        await deps.db
          .update(complianceRegister)
          .set({
            details: {
              extractedAt: new Date().toISOString(),
              accountId: ctx.accountId,
              listingCount: ownedListings.length,
              listingIds: ownedListings.map((l) => l.id),
            },
          })
          .where(eq(complianceRegister.id, ctx.dsarCaseId))

        ctx.dataExtracted = true
      },
    },
    {
      name: "close_active_tickets",
      domain: "operations",
      skippable: true, // Tickets remain open — Ops cleans up manually
      async execute(ctx) {
        // Close open support tickets for all listings owned by the account
        const ownedListings = await deps.db
          .select({ id: listings.id })
          .from(listings)
          .where(eq(listings.accountId, ctx.accountId))

        const listingIds = ownedListings.map((l) => l.id)

        let closedCount = 0
        if (listingIds.length > 0) {
          // Close tickets referencing the account or its listings
          const openTickets = await deps.db
            .select({ id: supportTickets.id })
            .from(supportTickets)
            .where(
              and(
                inArray(supportTickets.status, ["open", "assigned"]),
                inArray(supportTickets.listingId, listingIds),
              ),
            )

          for (const ticket of openTickets) {
            await deps.db
              .update(supportTickets)
              .set({ status: "closed", closedAt: new Date() })
              .where(eq(supportTickets.id, ticket.id))
            closedCount++
          }
        }

        // Also close tickets directly referencing the account (no listing)
        const accountTickets = await deps.db
          .select({ id: supportTickets.id })
          .from(supportTickets)
          .where(
            and(
              eq(supportTickets.accountId, ctx.accountId),
              inArray(supportTickets.status, ["open", "assigned"]),
            ),
          )

        for (const ticket of accountTickets) {
          await deps.db
            .update(supportTickets)
            .set({ status: "closed", closedAt: new Date() })
            .where(eq(supportTickets.id, ticket.id))
          closedCount++
        }

        ctx.ticketsClosed = closedCount
      },
    },
    {
      name: "process_erasure",
      domain: "data-and-listings",
      skippable: false, // The entire point of the flow — SI §3.5 step 4
      async execute(ctx) {
        // D2 sub-step pattern: DB transaction + R2 cleanup + quality recalc.
        // If DB succeeds but R2 fails, context tracks partial completion.
        // On retry, DB sub-step is skipped; only R2 retries. (AC-20)

        if (!ctx.dbTransactionCompleted) {
          // AC-22: capture claim IDs BEFORE the transaction deletes snapshots
          ctx.claimIdsForR2Cleanup = await getClaimIdsForAccount(
            deps.db,
            ctx.accountId,
          )

          // AC-18: single PostgreSQL transaction for all DB mutations
          const dbResult = await processErasureTransaction(
            deps.db,
            ctx.accountId,
          )
          ctx.dbTransactionCompleted = true
          ctx.listingIdsDeleted = dbResult.listingIdsDeleted
          ctx.listingIdsAnonymised = dbResult.listingIdsAnonymised
          ctx.freelancerListingsDeleted = dbResult.freelancerListingsDeleted
          ctx.companyListingsAnonymised = dbResult.companyListingsAnonymised
        }

        // AC-19: R2 cleanup (post-transaction, idempotent)
        const r2Result = await processErasureR2Cleanup(
          deps.storage,
          ctx.listingIdsDeleted,
          ctx.claimIdsForR2Cleanup ?? [],
        )
        ctx.r2CleanupCompleted = true
        ctx.r2ObjectsDeleted = r2Result.objectsDeleted

        // AC-21: schedule quality recalculation for anonymised company listings
        const recalcCount = await scheduleQualityRecalculations(
          deps.schedulerDb,
          ctx.listingIdsAnonymised,
        )
        ctx.qualityRecalcScheduled = recalcCount
      },
    },
    {
      name: "close_dsar_case",
      domain: "operations",
      skippable: false, // Compliance audit record legally required — XI-11
      async execute(ctx) {
        // Direct call to closeDSARCase — NOT via event bus [AC-5, XI-11]
        await closeDSARCase(deps.db, {
          dsarCaseId: ctx.dsarCaseId,
          accountId: ctx.accountId,
          auditData: {
            listingIdsDeleted: ctx.listingIdsDeleted,
            listingIdsAnonymised: ctx.listingIdsAnonymised,
            freelancerListingsDeleted: ctx.freelancerListingsDeleted,
            companyListingsAnonymised: ctx.companyListingsAnonymised,
            accountHash: hashAccountId(ctx.accountId),
          },
        })

        ctx.dsarCaseClosed = true
        ctx.auditRecordCreated = true
      },
    },
    {
      name: "emit_erasure_completed",
      domain: "data-and-listings",
      skippable: true, // Legally compliant after step 5. Operationally inconsistent if skipped.
      async execute(ctx) {
        await deps.bus.emit(
          "erasure_completed",
          {
            _brand: "ErasureCompletedEvent" as const,
            accountHash: hashAccountId(ctx.accountId),
            senderAccountId: ctx.accountId,
            listingIdsAnonymised: ctx.listingIdsAnonymised,
            listingIdsDeleted: ctx.listingIdsDeleted,
            freelancerListingsDeleted: ctx.freelancerListingsDeleted,
            timestamp: new Date().toISOString(),
          },
          deps.waitUntilFn,
        )

        ctx.erasureCompletedEmitted = true
      },
    },
  ]
}

// --- Flow initiation (spec §1.5) ---

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export async function initiateErasureFlow(
  deps: ErasureFlowDeps,
  dsarCaseId: string,
  accountId: string,
) {
  const now = new Date()
  const deadline = new Date(now.getTime() + THIRTY_DAYS_MS)

  const initialContext: ErasureContext = {
    accountId,
    dsarCaseId,
    listingIdsDeleted: [],
    listingIdsAnonymised: [],
    freelancerListingsDeleted: 0,
    companyListingsAnonymised: 0,
  }

  const steps = buildErasureSteps(deps)

  const result = await executeOrchestratedFlow(deps.flowDb, {
    flowType: "erasure",
    triggeredBy: accountId,
    steps,
    initialContext,
    deadline,
  })

  // Schedule deadline proximity alerts [AC-8, SI §3.4]
  await scheduleDeferredAction(deps.schedulerDb, {
    action: "auto_escalation_check",
    params: { flowId: result.flowId, flowType: "erasure" },
    executeAt: new Date(deadline.getTime() - SEVEN_DAYS_MS),
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "erasure_flow.deadline_7d",
  })

  await scheduleDeferredAction(deps.schedulerDb, {
    action: "auto_escalation_check",
    params: { flowId: result.flowId, flowType: "erasure" },
    executeAt: new Date(deadline.getTime() - THREE_DAYS_MS),
    retryPolicy: "retry_3",
    onFailure: "alert_principal",
    createdBy: "erasure_flow.deadline_3d",
  })

  return result
}

// --- Utility ---

function hashAccountId(accountId: string): string {
  // Simple deterministic hash for anonymised audit records.
  // Not cryptographic — used only for correlation in compliance logs.
  let hash = 0
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `acct_${Math.abs(hash).toString(36)}`
}
