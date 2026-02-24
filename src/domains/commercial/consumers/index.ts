// CR consumer registration — wires subscription event handlers into the bus

import type { InProcessEventBus } from "@/lib/events/bus"
import type { SchedulerDb } from "@/lib/scheduler/api"
import type { DecisionLogDb } from "@/lib/decisions/logger"
import {
  subscriptionTierChangedRevenueMetricsHandler,
  subscriptionEndedChurnAndWinbackHandler,
} from "./subscription"

export function registerCommercialConsumers(
  bus: InProcessEventBus,
  deps: { schedulerDb: SchedulerDb; decisionLogDb: DecisionLogDb },
) {
  bus.on(subscriptionTierChangedRevenueMetricsHandler(deps))
  bus.on(subscriptionEndedChurnAndWinbackHandler(deps))
}
