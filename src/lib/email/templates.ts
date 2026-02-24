// Template registry — SI §5.2, S0 §6.2
// S0 provides registerTemplate() + renderTemplate(). Slices register templates during module init.

import type { EmailTemplateId, TemplateRenderer } from "./types"

const registry = new Map<EmailTemplateId, TemplateRenderer>()

export function registerTemplate(id: EmailTemplateId, renderer: TemplateRenderer): void {
  registry.set(id, renderer)
}

export function renderTemplate(
  id: EmailTemplateId,
  data: Record<string, unknown>,
): { subject: string; html: string } {
  const renderer = registry.get(id)
  if (!renderer) {
    throw new Error(`Unregistered email template: ${id}`)
  }
  return renderer(data)
}

export function hasTemplate(id: EmailTemplateId): boolean {
  return registry.has(id)
}

export function clearTemplates(): void {
  registry.clear()
}
