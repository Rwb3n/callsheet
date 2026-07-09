// Account closure flow — S10 §3, SI §3, SI §13.2
// 6-step orchestrated sequence. Steps 1, 2, 5, 6 implemented here.
// Steps 3-4 (data operations) are placeholders — implemented in CS-WORK-086.

import { eq, and, ne, isNotNull } from "drizzle-orm"
import type { Db } from "@/db/types"
import type { FlowStepDefinition } from "./types"
import type { FlowDb } from "./engine"
import { executeOrchestratedFlow } from "./engine"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { PaymentService } from "@/lib/services/types"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"
import type { SubscriptionTier } from "@/lib/events/types"
import { listings } from "@/db/schema/data-and-listings"
import { orchestratedFlows } from "@/db/schema/shared"
import { pendingCancellations } from "@/db/schema/operations"
import { accountProfiles, enquiryRecords, shortlists, savedSearches, searchHistory } from "@/db/schema/accounts"
import { checkComplianceHold } from "@/domains/operations/compliance/queries"

// --- ClosureContext (spec §3.1) ---

export type ClosureContext = {
  accountId: string
  listingsArchived: string[]
  subscriptionsCancelled: number
  subscriptionsFailed: string[] // paddleSubscriptionIds that failed cancel API call
  enquiriesAnonymised: number
  buyerDataDeleted: boolean
  buyerDataDeferred: boolean
  complianceHoldCheckAt?: string
  accountDeactivated: boolean
  accountClosedEmitted: boolean
}

// --- Deps for step executors ---

export type ClosureFlowDeps = {
  db: Db
  flowDb: FlowDb
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  payment: PaymentService
  schedulerDb: SchedulerDb
}

// --- Buyer data deletion (AC-34, AC-35) ---
// Exported for use by compliance_hold_recheck handler (AC-36, AC-38)

export async function executeBuyerDataDeletion(
  db: Db,
  accountId: string,
): Promise<void> {
  // Per-table deletion — failure on one table does not roll back others (AC-35).
  // Each delete is independently idempotent on retry.

  // a. Delete shortlists (cascade deletes shortlist_items via FK onDelete: "cascade")
  await db.delete(shortlists).where(eq(shortlists.accountId, accountId))

  // b. Delete saved searches
  await db.delete(savedSearches).where(eq(savedSearches.accountId, accountId))

  // c. Delete search history
  await db.delete(searchHistory).where(eq(searchHistory.accountId, accountId))
}

// --- Step definitions (spec §3.2) ---

export function buildClosureSteps(
  deps: ClosureFlowDeps,
): FlowStepDefinition<ClosureContext>[] {
  return [
    {
      name: "archive_listings",
      domain: "platform",
      skippable: false,
      async execute(ctx) {
        // Query all active listings with full fields for event emission
        const activeListings = await deps.db
          .select({
            id: listings.id,
            accountId: listings.accountId,
            subscriptionTier: listings.subscriptionTier,
            entityType: listings.entityType,
            slug: listings.slug,
            paddleSubscriptionId: listings.paddleSubscriptionId,
          })
          .from(listings)
          .where(
            and(
              eq(listings.accountId, ctx.accountId),
              eq(listings.lifecycleStatus, "active"),
            ),
          )

        for (const listing of activeListings) {
          // Archive the listing
          await deps.db
            .update(listings)
            .set({ lifecycleStatus: "archived", updatedAt: new Date() })
            .where(eq(listings.id, listing.id))

          // Emit listing_archived (sync: search index removal)
          await deps.bus.emit(
            "listing_archived",
            {
              _brand: "ListingArchivedEvent" as const,
              listingId: listing.id,
              accountId: listing.accountId,
              subscriptionTier:
                listing.subscriptionTier as SubscriptionTier,
              entityType: listing.entityType,
              slug: listing.slug,
            },
            deps.waitUntilFn,
          )

          ctx.listingsArchived.push(listing.id)
        }
      },
    },
    {
      name: "cancel_paddle_subscriptions",
      domain: "platform",
      skippable: true, // SI §3.5: Paddle webhook may handle independently
      async execute(ctx) {
        // Query listings with active Paddle subscriptions for this account
        const paidListings = await deps.db
          .select({
            id: listings.id,
            paddleSubscriptionId: listings.paddleSubscriptionId,
          })
          .from(listings)
          .where(
            and(
              eq(listings.accountId, ctx.accountId),
              isNotNull(listings.paddleSubscriptionId),
              ne(listings.subscriptionTier, "free"),
            ),
          )

        // Batch-insert pending_cancellation records before API calls.
        // Idempotent on retry via unique index on (paddleSubscriptionId, reason).
        for (const listing of paidListings) {
          await deps.db
            .insert(pendingCancellations)
            .values({
              paddleSubscriptionId: listing.paddleSubscriptionId!,
              listingId: listing.id,
              reason: "account_closed",
            })
            .onConflictDoNothing()
        }

        // Call Paddle cancel API per subscription
        for (const listing of paidListings) {
          try {
            await deps.payment.cancelSubscription({
              paddleSubscriptionId: listing.paddleSubscriptionId!,
              reason: "account_closed",
              effectiveFrom: "immediately",
            })
            ctx.subscriptionsCancelled++
          } catch {
            ctx.subscriptionsFailed.push(listing.paddleSubscriptionId!)
            throw new Error(
              `Paddle cancellation failed for subscription ${listing.paddleSubscriptionId}. ` +
                `Succeeded: ${ctx.subscriptionsCancelled}, Failed: ${ctx.subscriptionsFailed.length}. ` +
                `Failed IDs: ${ctx.subscriptionsFailed.join(", ")}`,
            )
          }
        }
      },
    },
    {
      name: "anonymise_enquiry_data",
      domain: "platform",
      skippable: true, // SI §3.5: privacy risk accepted, admin handles manually
      async execute(ctx) {
        // AC-31: anonymise sender identity on provider-visible enquiry records.
        // AC-32: preserve body (message content) — providers retain enquiry history.
        // Schema has no senderDisplayName column — null senderAccountId + senderEmail
        // removes identity. UI renders "[Account closed]" when senderAccountId is null.
        const result = await deps.db
          .update(enquiryRecords)
          .set({
            senderAccountId: null,
            senderEmail: null,
          })
          .where(eq(enquiryRecords.senderAccountId, ctx.accountId))
          .returning({ id: enquiryRecords.id })

        ctx.enquiriesAnonymised = result.length
      },
    },
    {
      name: "delete_defer_buyer_data",
      domain: "platform",
      skippable: true, // SI §3.5: data retained longer, no legal violation
      async execute(ctx) {
        // AC-33: check compliance hold before any deletion
        const holdResult = await checkComplianceHold(deps.db, ctx.accountId)
        ctx.complianceHoldCheckAt = new Date().toISOString()

        if (holdResult.holdExists) {
          // Defer deletion — schedule recheck in 7 days (AC-33)
          ctx.buyerDataDeferred = true

          // Get the current flow ID from flowDb for the deferred action params
          // The flow was created by initiateAccountClosure — find by triggeredBy + flowType
          const flowRows = await deps.db
            .select({ id: orchestratedFlows.id })
            .from(orchestratedFlows)
            .where(
              and(
                eq(orchestratedFlows.triggeredBy, ctx.accountId),
                eq(orchestratedFlows.flowType, "closure"),
              ),
            )
            .limit(1)

          const flowId = flowRows[0]?.id ?? ""

          await scheduleDeferredAction(deps.schedulerDb, {
            action: "compliance_hold_recheck",
            params: { accountId: ctx.accountId, flowId },
            executeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            retryPolicy: "retry_3",
            onFailure: "alert_principal",
            createdBy: "closure_flow.compliance_hold_recheck",
          })

          return // Step succeeds with deferred status — not a failure
        }

        // AC-34: no hold — delete buyer data
        await executeBuyerDataDeletion(deps.db, ctx.accountId)
        ctx.buyerDataDeleted = true
      },
    },
    {
      name: "deactivate_account",
      domain: "platform",
      skippable: false, // SI §3.5: account must be disabled
      async execute(ctx) {
        await deps.db
          .update(accountProfiles)
          .set({
            suppressedAt: new Date(),
            suppressionReason: "account_closed",
            updatedAt: new Date(),
          })
          .where(eq(accountProfiles.accountId, ctx.accountId))

        ctx.accountDeactivated = true
      },
    },
    {
      name: "emit_account_closed",
      domain: "platform",
      skippable: true, // SI §3.5: legally compliant but operationally inconsistent
      async execute(ctx) {
        await deps.bus.emit(
          "account_closed",
          {
            _brand: "AccountClosedEvent" as const,
            accountId: ctx.accountId,
            listingsArchived: ctx.listingsArchived,
            buyerDataDeleted: ctx.buyerDataDeleted,
            complianceHoldActive: ctx.buyerDataDeferred,
            paddleCancellationsPending: ctx.subscriptionsFailed.length > 0,
            timestamp: new Date().toISOString(),
          },
          deps.waitUntilFn,
        )

        ctx.accountClosedEmitted = true
      },
    },
  ]
}

// --- Flow initiation (spec §3.2) ---

export async function initiateAccountClosure(
  deps: ClosureFlowDeps,
  accountId: string,
) {
  const initialContext: ClosureContext = {
    accountId,
    listingsArchived: [],
    subscriptionsCancelled: 0,
    subscriptionsFailed: [],
    enquiriesAnonymised: 0,
    buyerDataDeleted: false,
    buyerDataDeferred: false,
    accountDeactivated: false,
    accountClosedEmitted: false,
  }

  const steps = buildClosureSteps(deps)

  return executeOrchestratedFlow(deps.flowDb, {
    flowType: "closure",
    triggeredBy: accountId,
    steps,
    initialContext,
    // No deadline — closure has no statutory time limit (SI §3.4)
  })
}
