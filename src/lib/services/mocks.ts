// Test mock implementations — SI §10, S0 §11.2
// Plain TypeScript classes. No mock framework.
// Each records calls, returns configurable responses, exposes assertion queries.

import type { PaymentService, CompaniesHouseService, PaddleSubscription } from "./types"

type Call<T = unknown> = { method: string; params: T; timestamp: number }

export class InMemoryPaymentService implements PaymentService {
  private calls: Call[] = []
  private checkoutUrl = "https://checkout.paddle.test/session-1"
  private cancelStatus: "cancelled" | "scheduled" = "cancelled"
  private subscriptions: PaddleSubscription[] = []
  private portalUrl = "https://portal.paddle.test/customer-1"
  private refundStatus: "refunded" | "not_eligible" = "refunded"

  setCheckoutUrl(url: string): void { this.checkoutUrl = url }
  setCancelStatus(status: "cancelled" | "scheduled"): void { this.cancelStatus = status }
  setSubscriptions(subs: PaddleSubscription[]): void { this.subscriptions = subs }
  setPortalUrl(url: string): void { this.portalUrl = url }
  setRefundStatus(status: "refunded" | "not_eligible"): void { this.refundStatus = status }

  async createCheckoutSession(params: Parameters<PaymentService["createCheckoutSession"]>[0]) {
    this.calls.push({ method: "createCheckoutSession", params, timestamp: Date.now() })
    return { checkoutUrl: this.checkoutUrl }
  }

  async cancelSubscription(params: Parameters<PaymentService["cancelSubscription"]>[0]) {
    this.calls.push({ method: "cancelSubscription", params, timestamp: Date.now() })
    return { status: this.cancelStatus }
  }

  async listSubscriptions(params: Parameters<PaymentService["listSubscriptions"]>[0]) {
    this.calls.push({ method: "listSubscriptions", params, timestamp: Date.now() })
    return this.subscriptions
  }

  async listAllActiveSubscriptions() {
    this.calls.push({ method: "listAllActiveSubscriptions", params: {}, timestamp: Date.now() })
    return this.subscriptions.filter((s) => s.status === "active")
  }

  async getCustomerPortalUrl(params: Parameters<PaymentService["getCustomerPortalUrl"]>[0]) {
    this.calls.push({ method: "getCustomerPortalUrl", params, timestamp: Date.now() })
    return this.portalUrl
  }

  async refundTransaction(params: Parameters<PaymentService["refundTransaction"]>[0]) {
    this.calls.push({ method: "refundTransaction", params, timestamp: Date.now() })
    return { status: this.refundStatus }
  }

  getCalls(): Call[] { return [...this.calls] }
  wasCalledWith(method: string, match?: Record<string, unknown>): boolean {
    return this.calls.some((c) => {
      if (c.method !== method) return false
      if (!match) return true
      const p = c.params as Record<string, unknown>
      return Object.entries(match).every(([k, v]) => p[k] === v)
    })
  }
  clear(): void { this.calls = [] }
}

export class InMemoryCompaniesHouseService implements CompaniesHouseService {
  private calls: Call[] = []
  private results = new Map<string, Awaited<ReturnType<CompaniesHouseService["lookup"]>>>()

  setResult(companyNumber: string, result: Awaited<ReturnType<CompaniesHouseService["lookup"]>>): void {
    this.results.set(companyNumber, result)
  }

  async lookup(companyNumber: string) {
    this.calls.push({ method: "lookup", params: { companyNumber }, timestamp: Date.now() })
    return this.results.get(companyNumber) ?? { found: false }
  }

  getCalls(): Call[] { return [...this.calls] }
  wasCalledWith(method: string, match?: Record<string, unknown>): boolean {
    return this.calls.some((c) => {
      if (c.method !== method) return false
      if (!match) return true
      const p = c.params as Record<string, unknown>
      return Object.entries(match).every(([k, v]) => p[k] === v)
    })
  }
  clear(): void { this.calls = [] }
}
