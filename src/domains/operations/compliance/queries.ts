// Compliance query interfaces — Ops §3.2 (checkComplianceHold), Ops §3.3 (getDSARStatus), Ops §3.6 (closeDSARCase)
// CS-WORK-060 AC-5.1, AC-5.2, AC-5.8, AC-5.9
// CS-WORK-083 AC-9, AC-10 (closeDSARCase)

import { eq, and, inArray, sql, gt, lt, isNotNull } from "drizzle-orm"
import { complianceRegister } from "@/db/schema/operations"
import type { Db } from "@/db/types"

// --- checkComplianceHold (Ops §3.2) ---

export type ComplianceHoldResult = {
  holdExists: boolean
  reason?: string
  holdType?: "open_dsar" | "pending_complaint" | "active_investigation"
}

// AC-5.8: only dsar, complaint, investigation with status = 'open' create holds
// AC-5.9: billing holds NOT checked here — separate query, separate purpose
const HOLD_CREATING_TYPES = ["dsar", "complaint", "investigation"] as const
const HOLD_TYPE_MAP: Record<string, ComplianceHoldResult["holdType"]> = {
  dsar: "open_dsar",
  complaint: "pending_complaint",
  investigation: "active_investigation",
}
// Priority order: dsar > investigation > complaint
const TYPE_PRIORITY: Record<string, number> = { dsar: 0, investigation: 1, complaint: 2 }

export async function checkComplianceHold(
  db: Db,
  accountId: string,
): Promise<ComplianceHoldResult> {
  const holdEntries = await db
    .select({
      id: complianceRegister.id,
      type: complianceRegister.type,
      receivedAt: complianceRegister.receivedAt,
      deadline: complianceRegister.deadline,
    })
    .from(complianceRegister)
    .where(
      and(
        eq(complianceRegister.accountId, accountId),
        inArray(complianceRegister.type, [...HOLD_CREATING_TYPES]),
        eq(complianceRegister.status, "open"),
      ),
    )

  if (holdEntries.length === 0) {
    return { holdExists: false }
  }

  // Return highest-priority blocking entry
  holdEntries.sort((a, b) => (TYPE_PRIORITY[a.type] ?? 99) - (TYPE_PRIORITY[b.type] ?? 99))
  const entry = holdEntries[0]

  return {
    holdExists: true,
    reason: `Active ${entry.type} (received ${entry.receivedAt?.toISOString() ?? "unknown"})`,
    holdType: HOLD_TYPE_MAP[entry.type],
  }
}

// --- getDSARStatus (Ops §3.3) ---

export type DSARDashboardView = {
  openDSARs: {
    id: string
    receivedAt: string
    daysRemaining: number
    status: "identity_verification" | "data_compilation" | "principal_review"
    accountId: string | null
  }[]
  recentErasures: { id: string; completedAt: string }[]
  complianceCalendarStatus: string
  upcomingDeadlines: { obligation: string; dueDate: string }[]
}

// Map compliance_register status to DSAR lifecycle stage (Ops §3.3 OPS-ST-9)
function mapToDSARLifecycleStatus(
  status: string,
): "identity_verification" | "data_compilation" | "principal_review" {
  if (status === "open") return "identity_verification"
  if (status === "in_progress") return "data_compilation"
  return "principal_review"
}

export async function getDSARStatus(db: Db): Promise<DSARDashboardView> {
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // 3 parallel queries
  const [openDSARs, recentErasures, upcomingDeadlines] = await Promise.all([
    db
      .select({
        id: complianceRegister.id,
        receivedAt: complianceRegister.receivedAt,
        deadline: complianceRegister.deadline,
        status: complianceRegister.status,
        accountId: complianceRegister.accountId,
      })
      .from(complianceRegister)
      .where(
        and(
          eq(complianceRegister.type, "dsar"),
          inArray(complianceRegister.status, ["open", "in_progress"]),
        ),
      ),

    db
      .select({
        id: complianceRegister.id,
        completedAt: complianceRegister.completedAt,
      })
      .from(complianceRegister)
      .where(
        and(
          eq(complianceRegister.type, "erasure"),
          isNotNull(complianceRegister.completedAt),
          gt(complianceRegister.completedAt, ninetyDaysAgo),
        ),
      ),

    db
      .select({
        type: complianceRegister.type,
        deadline: complianceRegister.deadline,
      })
      .from(complianceRegister)
      .where(
        and(
          inArray(complianceRegister.status, ["open", "in_progress"]),
          isNotNull(complianceRegister.deadline),
          gt(complianceRegister.deadline, now),
          lt(complianceRegister.deadline, thirtyDaysAhead),
        ),
      )
      .orderBy(complianceRegister.deadline),
  ])

  return {
    openDSARs: openDSARs.map((d) => ({
      id: d.id,
      receivedAt: d.receivedAt?.toISOString() ?? now.toISOString(),
      daysRemaining: d.deadline
        ? Math.max(0, Math.ceil((d.deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        : 0,
      status: mapToDSARLifecycleStatus(d.status),
      accountId: d.accountId,
    })),
    recentErasures: recentErasures
      .filter((e) => e.completedAt !== null)
      .map((e) => ({
        id: e.id,
        completedAt: e.completedAt!.toISOString(),
      })),
    complianceCalendarStatus: upcomingDeadlines.length > 0 ? "action_needed" : "clear",
    upcomingDeadlines: upcomingDeadlines
      .filter((d) => d.deadline !== null)
      .map((d) => ({
        obligation: d.type,
        dueDate: d.deadline!.toISOString(),
      })),
  }
}

// --- closeDSARCase (Ops §3.6) ---
// Mutation. Called by erasure flow step 5 — NOT via event bus [XI-11].
// Updates DSAR case status → completed. Inserts erasure_audit compliance record.
// Clearing the hold is automatic: checkComplianceHold queries for status: "open".

export type CloseDSARCaseParams = {
  dsarCaseId: string
  accountId: string
  auditData: {
    listingIdsDeleted: string[]
    listingIdsAnonymised: string[]
    freelancerListingsDeleted: number
    companyListingsAnonymised: number
    accountHash: string
  }
}

export async function closeDSARCase(
  db: Db,
  params: CloseDSARCaseParams,
): Promise<{ completed: boolean }> {
  const now = new Date()

  // Close the DSAR case
  await db
    .update(complianceRegister)
    .set({ status: "completed", completedAt: now })
    .where(eq(complianceRegister.id, params.dsarCaseId))

  // Insert erasure audit record
  await db.insert(complianceRegister).values({
    type: "erasure_audit",
    accountId: params.accountId,
    status: "completed",
    completedAt: now,
    details: {
      dsarCaseId: params.dsarCaseId,
      accountHash: params.auditData.accountHash,
      listingIdsDeleted: params.auditData.listingIdsDeleted,
      listingIdsAnonymised: params.auditData.listingIdsAnonymised,
      freelancerListingsDeleted: params.auditData.freelancerListingsDeleted,
      companyListingsAnonymised: params.auditData.companyListingsAnonymised,
      completedAt: now.toISOString(),
    },
  })

  return { completed: true }
}
