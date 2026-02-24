export { ResendEmailService, InMemoryEmailService } from "./transport"
export type { PreferenceLookup } from "./transport"
export { registerTemplate, renderTemplate, hasTemplate, clearTemplates } from "./templates"
export { LoggingEmailService } from "./logging-service"
export { DbCorrespondenceWriter, InMemoryCorrespondenceWriter, computeMergeFieldsHash } from "./correspondence"
export type { CorrespondenceWriter, CorrespondenceRow } from "./correspondence"
export { DbSuppressionChecker, InMemorySuppressionChecker } from "./suppression"
export type { SuppressionChecker, SuppressionResult } from "./suppression"
export { DEFAULT_EMAIL_PREFERENCES } from "./types"
export type {
  EmailCategory,
  EmailSendResult,
  EmailTemplateId,
  EmailPreferences,
  EmailSendParams,
  EmailService,
  TemplateRenderer,
} from "./types"
