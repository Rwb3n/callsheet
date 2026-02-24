// LoggingEmailService decorator — Communications Phase 1
// Wraps any EmailService. Adds: system suppression check, correspondence log row on every send.
// Production: new LoggingEmailService(new ResendEmailService(...), writer, checker)
// Tests: new LoggingEmailService(new InMemoryEmailService(...), testWriter, testChecker)

import { randomUUID } from "crypto"
import { renderTemplate } from "./templates"
import { computeMergeFieldsHash } from "./correspondence"
import type { CorrespondenceWriter } from "./correspondence"
import type { SuppressionChecker } from "./suppression"
import type { EmailSendParams, EmailSendResult, EmailService } from "./types"

export class LoggingEmailService implements EmailService {
  constructor(
    private inner: EmailService,
    private correspondenceWriter: CorrespondenceWriter,
    private suppressionChecker: SuppressionChecker,
  ) {}

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const threadId = params.threadId ?? randomUUID()

    // System suppression check — blocks ALL categories including transactional (DD-5)
    const suppression = await this.suppressionChecker.checkSuppression(params.accountId, params.to)
    if (suppression.suppressed) {
      // Render template to capture subject even for suppressed sends (DD-5)
      const { subject } = renderTemplate(params.template, params.data)

      await this.correspondenceWriter.writeRow({
        threadId,
        direction: "outbound",
        status: "suppressed",
        accountId: params.accountId ?? null,
        listingId: params.listingId ?? null,
        externalEmail: params.to,
        templateId: params.template,
        category: params.category,
        subject,
        providerMessageId: null,
        mergeFieldsHash: computeMergeFieldsHash(params.data),
      })

      return { messageId: null, status: "suppressed", threadId }
    }

    // Delegate to inner service (handles preference checks, template rendering, sending)
    const result = await this.inner.send({ ...params, threadId })

    // Log correspondence row with result
    await this.correspondenceWriter.writeRow({
      threadId,
      direction: "outbound",
      status: result.status === "sent" ? "sent" : result.status === "suppressed" ? "suppressed" : "failed",
      accountId: params.accountId ?? null,
      listingId: params.listingId ?? null,
      externalEmail: params.to,
      templateId: params.template,
      category: params.category,
      subject: this.getSubject(params),
      providerMessageId: result.messageId,
      mergeFieldsHash: computeMergeFieldsHash(params.data),
    })

    return { ...result, threadId }
  }

  private getSubject(params: EmailSendParams): string {
    try {
      const { subject } = renderTemplate(params.template, params.data)
      return subject
    } catch {
      // Template may already have been rendered by inner service
      return params.template
    }
  }
}
