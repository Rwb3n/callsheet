// Enquiry routing — S6 §3.4, AC-20 through AC-27
// Four-branch decision tree based on listing claim status.

import { eq } from "drizzle-orm"
import { listings, pendingEnquiries } from "@/db/schema/data-and-listings"
import { enquiryRecords } from "@/db/schema/accounts"
import { user } from "@/db/schema/auth"
import type { Db } from "@/db/types"
import type { EmailService } from "@/lib/email/types"
import type { InProcessEventBus } from "@/lib/events/bus"
import type { WaitUntilFn } from "@/lib/events/waitUntil"
import type { SchedulerDb } from "@/lib/scheduler/api"
import { scheduleDeferredAction } from "@/lib/scheduler/api"

const ENQUIRY_RESPONSE_REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000

type EnquiryInput = {
  listingId: string
  senderName: string
  senderCompany?: string | null
  projectType?: string | null
  message: string
  budget?: string | null
  timeline?: string | null
}

type ResolvedSender = {
  senderAccountId: string | null
  senderEmail: string
}

export type EnquiryRoutingDeps = {
  db: Db
  emailService: EmailService
  bus: InProcessEventBus
  waitUntilFn: WaitUntilFn
  schedulerDb: SchedulerDb
}

// Branch C — no enquiry record, no event
export type NoEmailResult = {
  code: "NO_EMAIL"
  contactMethods: { phone: string | null; website: string | null }
}

// Branches A, B, D — enquiry created
export type EnquiryCreatedResult = {
  code: "CREATED"
  enquiryId: string
}

export type RouteEnquiryResult = NoEmailResult | EnquiryCreatedResult

export async function routeEnquiry(
  input: EnquiryInput,
  sender: ResolvedSender,
  deps: EnquiryRoutingDeps,
): Promise<RouteEnquiryResult> {
  const [listing] = await deps.db
    .select({
      id: listings.id,
      name: listings.name,
      claimStatus: listings.claimStatus,
      lifecycleStatus: listings.lifecycleStatus,
      accountId: listings.accountId,
      contactEmail: listings.contactEmail,
      contactPhone: listings.contactPhone,
      websiteUrl: listings.websiteUrl,
    })
    .from(listings)
    .where(eq(listings.id, input.listingId))
    .limit(1)

  // AC-27: inactive listing → NOT_FOUND (handled by caller as TRPCError)
  if (!listing || listing.lifecycleStatus !== "active") {
    return null as never // caller checks before calling routeEnquiry
  }

  const claimStatus = listing.claimStatus

  // Branch A: claimed listings (verified/premium_verified are verification tiers, not claim statuses)
  if (claimStatus === "claimed") {
    return branchA(input, sender, listing, deps)
  }

  if (claimStatus === "unclaimed" || claimStatus === "pending_review") {
    if (listing.contactEmail) {
      return branchB(input, sender, listing, deps)
    }
    // Branch C: no email — return contact fallback
    return {
      code: "NO_EMAIL",
      contactMethods: {
        phone: listing.contactPhone,
        website: listing.websiteUrl,
      },
    }
  }

  if (claimStatus === "disputed") {
    return branchD(input, sender, listing, deps)
  }

  // Exhaustive — should never reach here
  return null as never
}

// Branch A: Direct delivery to claimed listing
async function branchA(
  input: EnquiryInput,
  sender: ResolvedSender,
  listing: ListingRow,
  deps: EnquiryRoutingDeps,
): Promise<EnquiryCreatedResult> {
  const enquiryId = await insertEnquiry(input, sender, deps.db)

  // Send new_enquiry email to provider's account email
  if (listing.accountId) {
    const accountEmail = await resolveAccountEmail(deps.db, listing.accountId)
    if (accountEmail) {
      await deps.emailService.send({
        to: accountEmail,
        template: "new_enquiry",
        data: {
          listingName: listing.name,
          senderName: input.senderName,
          messagePreview: input.message.slice(0, 200),
        },
        category: "enquiry_notification",
        accountId: listing.accountId,
        listingId: listing.id,
      })
    }
  }

  // Schedule enquiry_response_reminder at 7 days [S5 §5.3]
  await scheduleDeferredAction(deps.schedulerDb, {
    action: "enquiry_response_reminder",
    params: { enquiryId, listingId: input.listingId },
    executeAt: new Date(Date.now() + ENQUIRY_RESPONSE_REMINDER_DELAY_MS),
    retryPolicy: "once",
    onFailure: "log",
    createdBy: "enquiry.submit",
  })

  // AC-24: emit enquiry_submitted — no PII [PP-ST-12]
  await emitEnquirySubmitted(deps, enquiryId, input.listingId)

  return { code: "CREATED", enquiryId }
}

// Branch B: Forward to unclaimed listing with contact email
async function branchB(
  input: EnquiryInput,
  sender: ResolvedSender,
  listing: ListingRow,
  deps: EnquiryRoutingDeps,
): Promise<EnquiryCreatedResult> {
  const enquiryId = await insertEnquiry(input, sender, deps.db)

  // Send enquiry_forwarded email with claim CTA
  await deps.emailService.send({
    to: listing.contactEmail!,
    template: "enquiry_forwarded",
    data: {
      enquiryCount: 1,
      listingName: listing.name,
      senderName: input.senderName,
      messagePreview: input.message.slice(0, 200),
    },
    category: "transactional",
    listingId: listing.id,
  })

  // Queue in pending_enquiries with 90-day TTL
  await deps.db.insert(pendingEnquiries).values({
    listingId: listing.id,
    enquiryId,
    forwardedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  })

  await emitEnquirySubmitted(deps, enquiryId, input.listingId)

  return { code: "CREATED", enquiryId }
}

// Branch D: Silent queue for disputed listing
async function branchD(
  input: EnquiryInput,
  sender: ResolvedSender,
  listing: ListingRow,
  deps: EnquiryRoutingDeps,
): Promise<EnquiryCreatedResult> {
  const enquiryId = await insertEnquiry(input, sender, deps.db)

  // Queue in pending_enquiries — no email sent, no forwardedAt [S6-ST-12]
  await deps.db.insert(pendingEnquiries).values({
    listingId: listing.id,
    enquiryId,
    forwardedAt: null,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  })

  await emitEnquirySubmitted(deps, enquiryId, input.listingId)

  return { code: "CREATED", enquiryId }
}

// --- Helpers ---

type ListingRow = {
  id: string
  name: string
  claimStatus: string
  lifecycleStatus: string
  accountId: string | null
  contactEmail: string | null
  contactPhone: string | null
  websiteUrl: string | null
}

async function insertEnquiry(
  input: EnquiryInput,
  sender: ResolvedSender,
  db: Db,
): Promise<string> {
  const [row] = await db
    .insert(enquiryRecords)
    .values({
      senderAccountId: sender.senderAccountId,
      senderEmail: sender.senderEmail,
      listingId: input.listingId,
      subject: input.senderName,
      body: input.message,
      status: "unread",
    })
    .returning({ id: enquiryRecords.id })
  return row.id
}

async function resolveAccountEmail(db: Db, accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1)
  return row?.email ?? null
}

async function emitEnquirySubmitted(
  deps: Pick<EnquiryRoutingDeps, "bus" | "waitUntilFn">,
  enquiryId: string,
  listingId: string,
): Promise<void> {
  await deps.bus.emit(
    "enquiry_submitted",
    {
      _brand: "EnquirySubmittedEvent" as const,
      enquiryId,
      listingId,
      timestamp: new Date().toISOString(),
    },
    deps.waitUntilFn,
  )
}
