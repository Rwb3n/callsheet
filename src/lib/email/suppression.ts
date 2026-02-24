// System-level email suppression — Communications Phase 1
// Two-level model: account-level (account_profiles.suppressedAt) + email-level (suppressed_emails table).
// Blocks ALL categories including transactional. Checked before preference checks.

import { eq } from "drizzle-orm"
import type { Db } from "@/db/types"
import { accountProfiles } from "@/db/schema/accounts"
import { suppressedEmails } from "@/db/schema/correspondence"

export type SuppressionResult = {
  suppressed: boolean
  reason?: string
}

export interface SuppressionChecker {
  checkSuppression(accountId: string | undefined, email: string): Promise<SuppressionResult>
}

export class DbSuppressionChecker implements SuppressionChecker {
  constructor(private db: Db) {}

  async checkSuppression(accountId: string | undefined, email: string): Promise<SuppressionResult> {
    // Check account-level suppression if accountId present
    if (accountId) {
      const [profile] = await this.db
        .select({ suppressedAt: accountProfiles.suppressedAt, suppressionReason: accountProfiles.suppressionReason })
        .from(accountProfiles)
        .where(eq(accountProfiles.accountId, accountId))
        .limit(1)

      if (profile?.suppressedAt) {
        return { suppressed: true, reason: profile.suppressionReason ?? "account_suppressed" }
      }
    }

    // Check email-level suppression (always — handles non-account addresses)
    const normalised = email.toLowerCase().trim()
    const [emailRow] = await this.db
      .select({ reason: suppressedEmails.reason })
      .from(suppressedEmails)
      .where(eq(suppressedEmails.email, normalised))
      .limit(1)

    if (emailRow) {
      return { suppressed: true, reason: emailRow.reason }
    }

    return { suppressed: false }
  }
}

// Test implementation — in-memory suppression list
export class InMemorySuppressionChecker implements SuppressionChecker {
  private suppressedAccounts = new Map<string, string>()
  private suppressedAddresses = new Map<string, string>()

  suppressAccount(accountId: string, reason: string): void {
    this.suppressedAccounts.set(accountId, reason)
  }

  suppressEmail(email: string, reason: string): void {
    this.suppressedAddresses.set(email.toLowerCase().trim(), reason)
  }

  async checkSuppression(accountId: string | undefined, email: string): Promise<SuppressionResult> {
    if (accountId) {
      const reason = this.suppressedAccounts.get(accountId)
      if (reason) return { suppressed: true, reason }
    }

    const emailReason = this.suppressedAddresses.get(email.toLowerCase().trim())
    if (emailReason) return { suppressed: true, reason: emailReason }

    return { suppressed: false }
  }
}
