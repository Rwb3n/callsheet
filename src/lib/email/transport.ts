// Resend email transport — SI §5, S0 §6
// Preference enforcement is the email service's responsibility — callers do not check.

import { randomUUID } from "crypto"
import { Resend } from "resend"
import { renderTemplate } from "./templates"
import type {
  EmailCategory,
  EmailPreferences,
  EmailSendParams,
  EmailSendResult,
  EmailService,
} from "./types"

// Categories that support unsubscribe [SI §5.3]
const SUBSCRIBABLE_CATEGORIES: EmailCategory[] = [
  "enquiry_notification",
  "listing_status",
  "profile_nudge",
  "conversion_marketing",
]

// Maps email category to preference key
const CATEGORY_TO_PREFERENCE: Record<string, keyof EmailPreferences> = {
  enquiry_notification: "enquiry_notification",
  listing_status: "listing_status",
  profile_nudge: "profile_nudge",
  conversion_marketing: "conversion_marketing",
}

export type PreferenceLookup = (accountId: string) => Promise<EmailPreferences | null>

export class ResendEmailService implements EmailService {
  private resend: Resend
  private fromAddress: string
  private getPreferences: PreferenceLookup

  constructor(params: {
    apiKey: string
    fromAddress: string
    getPreferences: PreferenceLookup
  }) {
    this.resend = new Resend(params.apiKey)
    this.fromAddress = params.fromAddress
    this.getPreferences = params.getPreferences
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const threadId = params.threadId ?? randomUUID()

    // Check unsubscribe preferences for subscribable categories
    if (SUBSCRIBABLE_CATEGORIES.includes(params.category) && params.accountId) {
      const prefs = await this.getPreferences(params.accountId)
      const prefKey = CATEGORY_TO_PREFERENCE[params.category]
      if (prefs && prefKey && !prefs[prefKey]) {
        return { messageId: null, status: "suppressed", threadId }
      }
    }

    const { subject, html } = renderTemplate(params.template, params.data)

    const result = await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject,
      html,
    })

    if (result.error) {
      return { messageId: null, status: "failed", threadId }
    }

    return { messageId: result.data?.id ?? null, status: "sent", threadId }
  }
}

// In-memory implementation for tests [S0-10]
export class InMemoryEmailService implements EmailService {
  private calls: EmailSendParams[] = []
  private preferences: Map<string, EmailPreferences>
  private nextResponse: EmailSendResult = { messageId: "test-msg-id", status: "sent", threadId: "test-thread-id" }

  constructor(preferences?: Map<string, EmailPreferences>) {
    this.preferences = preferences ?? new Map()
  }

  setResponse(response: EmailSendResult): void {
    this.nextResponse = response
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const threadId = params.threadId ?? randomUUID()

    // Enforce preference check same as production [S0-10]
    if (SUBSCRIBABLE_CATEGORIES.includes(params.category) && params.accountId) {
      const prefs = this.preferences.get(params.accountId)
      const prefKey = CATEGORY_TO_PREFERENCE[params.category]
      if (prefs && prefKey && !prefs[prefKey]) {
        this.calls.push(params)
        return { messageId: null, status: "suppressed", threadId }
      }
    }

    // Validate template is registered (AC-29)
    renderTemplate(params.template, params.data)

    this.calls.push(params)
    return { ...this.nextResponse, threadId }
  }

  getCalls(): EmailSendParams[] {
    return [...this.calls]
  }

  wasCalledWith(template: string): boolean {
    return this.calls.some((c) => c.template === template)
  }

  clear(): void {
    this.calls = []
  }
}
