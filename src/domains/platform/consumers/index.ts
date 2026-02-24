// PP consumer registration — wires subscription event handlers into the bus

import type { InProcessEventBus } from "@/lib/events/bus"
import type { NotificationDb } from "@/lib/notifications"
import {
  subscriptionTierChangedFeatureAccessHandler,
  subscriptionTierChangedProviderNotificationHandler,
  subscriptionEndedDowngradeFeatureAccessHandler,
  subscriptionEndedResubscribeCTAHandler,
} from "./subscription"

export function registerPlatformConsumers(
  bus: InProcessEventBus,
  deps: { notificationDb: NotificationDb },
) {
  bus.on(subscriptionTierChangedFeatureAccessHandler(deps))
  bus.on(subscriptionTierChangedProviderNotificationHandler(deps))
  bus.on(subscriptionEndedDowngradeFeatureAccessHandler(deps))
  bus.on(subscriptionEndedResubscribeCTAHandler(deps))
}
