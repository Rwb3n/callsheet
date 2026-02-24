// Email transport tests — AC-26 through AC-29

import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryEmailService } from "../transport"
import { registerTemplate, clearTemplates } from "../templates"
import type { EmailPreferences } from "../types"

describe("Email Transport", () => {
  beforeEach(() => {
    clearTemplates()
    registerTemplate("email_verification", (data) => ({
      subject: "Verify your email",
      html: `<a href="${data.verificationUrl}">Verify</a>`,
    }))
    registerTemplate("new_enquiry", (data) => ({
      subject: `New enquiry from ${data.senderName}`,
      html: `<p>${data.message}</p>`,
    }))
    registerTemplate("conversion_analytics_teaser", (data) => ({
      subject: "Your analytics",
      html: `<p>Views: ${data.views}</p>`,
    }))
  })

  // AC-26: send() delivers via Resend (mock records call)
  it("records send call and returns sent status", async () => {
    const service = new InMemoryEmailService()
    const result = await service.send({
      to: "test@example.com",
      template: "email_verification",
      data: { verificationUrl: "https://example.com/verify" },
      category: "transactional",
    })

    expect(result.status).toBe("sent")
    expect(result.messageId).toBe("test-msg-id")
    expect(service.getCalls()).toHaveLength(1)
    expect(service.wasCalledWith("email_verification")).toBe(true)
  })

  // AC-27: Unsubscribed category → suppressed, no send
  it("suppresses email when account has unsubscribed from category", async () => {
    const prefs = new Map<string, EmailPreferences>([
      ["account-1", {
        enquiry_notification: false,
        listing_status: true,
        profile_nudge: true,
        conversion_marketing: true,
      }],
    ])
    const service = new InMemoryEmailService(prefs)

    const result = await service.send({
      to: "provider@example.com",
      template: "new_enquiry",
      data: { senderName: "Alice", message: "Hello" },
      category: "enquiry_notification",
      accountId: "account-1",
    })

    expect(result.status).toBe("suppressed")
    expect(result.messageId).toBeNull()
  })

  // AC-27 second path: conversion_marketing unsubscribed
  it("suppresses conversion marketing when account has unsubscribed", async () => {
    const prefs = new Map<string, EmailPreferences>([
      ["account-2", {
        enquiry_notification: true,
        listing_status: true,
        profile_nudge: true,
        conversion_marketing: false,
      }],
    ])
    const service = new InMemoryEmailService(prefs)

    const result = await service.send({
      to: "provider@example.com",
      template: "conversion_analytics_teaser",
      data: { views: 42 },
      category: "conversion_marketing",
      accountId: "account-2",
    })

    expect(result.status).toBe("suppressed")
  })

  // AC-28: Transactional bypasses preference check
  it("sends transactional email regardless of preferences", async () => {
    const prefs = new Map<string, EmailPreferences>([
      ["account-3", {
        enquiry_notification: false,
        listing_status: false,
        profile_nudge: false,
        conversion_marketing: false,
      }],
    ])
    const service = new InMemoryEmailService(prefs)

    const result = await service.send({
      to: "user@example.com",
      template: "email_verification",
      data: { verificationUrl: "https://example.com/verify" },
      category: "transactional",
      accountId: "account-3",
    })

    expect(result.status).toBe("sent")
    expect(result.messageId).toBe("test-msg-id")
  })

  // AC-29: Unregistered template throws
  it("throws on unregistered template", async () => {
    const service = new InMemoryEmailService()
    clearTemplates()

    await expect(
      service.send({
        to: "test@example.com",
        template: "email_verification",
        data: {},
        category: "transactional",
      }),
    ).rejects.toThrow("Unregistered email template: email_verification")
  })

  // Supporting: sends subscribable email when account IS subscribed
  it("sends email when account is subscribed to the category", async () => {
    const prefs = new Map<string, EmailPreferences>([
      ["account-4", {
        enquiry_notification: true,
        listing_status: true,
        profile_nudge: true,
        conversion_marketing: true,
      }],
    ])
    const service = new InMemoryEmailService(prefs)

    const result = await service.send({
      to: "provider@example.com",
      template: "new_enquiry",
      data: { senderName: "Bob", message: "Hi" },
      category: "enquiry_notification",
      accountId: "account-4",
    })

    expect(result.status).toBe("sent")
  })

  // Supporting: sends when no accountId provided (anonymous / system)
  it("sends when no accountId provided for subscribable category", async () => {
    const service = new InMemoryEmailService()

    const result = await service.send({
      to: "user@example.com",
      template: "new_enquiry",
      data: { senderName: "System", message: "Test" },
      category: "enquiry_notification",
    })

    expect(result.status).toBe("sent")
  })
})
