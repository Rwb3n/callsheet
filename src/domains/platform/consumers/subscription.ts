// PP subscription event consumers — PP §2, S4 §10
// subscription_tier_changed: feature access update + provider notification
// subscription_ended: downgrade feature access + re-subscribe CTA (skip if origin === "closure") [AC-42]

import { createNotification, type NotificationDb } from "@/lib/notifications"
import type { EventHandler } from "@/lib/events/types"

type PlatformConsumerDeps = {
  notificationDb: NotificationDb
}

export function subscriptionTierChangedFeatureAccessHandler(
  _deps: PlatformConsumerDeps,
): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "platform",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (_payload) => {
      // Feature gate recalculation is driven by listing.subscriptionTier (updated by D&L consumer).
      // PP consumer is a placeholder for dashboard cache invalidation (S5).
    },
  }
}

export function subscriptionTierChangedProviderNotificationHandler(
  deps: PlatformConsumerDeps,
): EventHandler<"subscription_tier_changed"> {
  return {
    domain: "platform",
    eventType: "subscription_tier_changed",
    mode: "async",
    handler: async (payload) => {
      await createNotification(deps.notificationDb, {
        accountId: payload.listingId, // S5 resolves accountId from listing lookup
        type: "subscription_confirmed",
        title: "Subscription updated",
        body: `Your subscription has changed from ${payload.previousTier} to ${payload.newTier}.`,
        link: "/dashboard/subscription",
      })
    },
  }
}

export function subscriptionEndedDowngradeFeatureAccessHandler(
  _deps: PlatformConsumerDeps,
): EventHandler<"subscription_ended"> {
  return {
    domain: "platform",
    eventType: "subscription_ended",
    mode: "async",
    handler: async (_payload) => {
      // Feature access downgrade to free tier.
      // Actual feature gates read listing.subscriptionTier (already set to "free" by finaliseSubscriptionEnd).
      // PP consumer is a placeholder for dashboard cache invalidation (S5).
    },
  }
}

export function subscriptionEndedResubscribeCTAHandler(
  deps: PlatformConsumerDeps,
): EventHandler<"subscription_ended"> {
  return {
    domain: "platform",
    eventType: "subscription_ended",
    mode: "async",
    handler: async (payload) => {
      // Skip re-subscribe CTA when account is being closed [AC-42]
      if (payload.origin === "closure") return

      await createNotification(deps.notificationDb, {
        accountId: payload.accountId,
        type: "subscription_ending",
        title: "Your subscription has ended",
        body: `Your ${payload.previousTier} subscription has ended. Upgrade to regain premium features.`,
        link: "/pricing",
      })
    },
  }
}
