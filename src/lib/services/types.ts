// Service abstraction types — SI §10

import type { EmailService } from "@/lib/email/types"
import type { ObjectStorageService } from "@/lib/storage/types"
import type { SubscriptionTier } from "@/lib/events/types"

export type { SubscriptionTier }

export interface PaymentService {
  createCheckoutSession(params: {
    accountId: string
    listingId: string
    tier: SubscriptionTier
    successUrl: string
    cancelUrl: string
    billingCadence?: "annual" | "monthly"
    couponCode?: string
    paddleCustomerId?: string
    existingSubscriptionId?: string
  }): Promise<{ checkoutUrl: string }>

  cancelSubscription(params: {
    paddleSubscriptionId: string
    reason: string
    effectiveFrom: "immediately" | "end_of_period"
  }): Promise<{ status: "cancelled" | "scheduled" }>

  listSubscriptions(params: {
    paddleCustomerId: string
  }): Promise<PaddleSubscription[]>

  listAllActiveSubscriptions(): Promise<PaddleSubscription[]>

  getCustomerPortalUrl(params: {
    paddleCustomerId: string
  }): Promise<string>

  refundTransaction(params: {
    subscriptionId: string
    reason: string
  }): Promise<{ status: "refunded" | "not_eligible" }>
}

export type PaddleSubscription = {
  id: string
  status: "active" | "past_due" | "cancelled" | "paused"
  tier: SubscriptionTier
  currentPeriodEnd: string
}

export interface CompaniesHouseService {
  lookup(companyNumber: string): Promise<{
    found: boolean
    status?: "active" | "dissolved" | "liquidation" | "receivership" | "administration" | "voluntary-arrangement" | "converted-closed" | "insolvency-proceedings"
    name?: string
    registeredAddress?: string
  }>
}

export type Services = {
  email: EmailService
  payment: PaymentService
  companiesHouse: CompaniesHouseService
  storage: ObjectStorageService
}
