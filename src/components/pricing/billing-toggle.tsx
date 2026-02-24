"use client"

import { useState } from "react"
import { PRICING, LAUNCH_DISCOUNT } from "@/domains/commercial/subscription/pricing"
import { TIER_LIMITS } from "@/domains/commercial/tier-limits"
import { TierCard } from "./tier-card"

export type BillingCadence = "annual" | "monthly"

export function PricingSection() {
  const [cadence, setCadence] = useState<BillingCadence>("annual")

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-10">
        <span
          className={`text-sm font-medium ${cadence === "annual" ? "text-gray-900" : "text-gray-500"}`}
        >
          Annual
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cadence === "monthly"}
          aria-label="Toggle billing cadence"
          onClick={() => setCadence(cadence === "annual" ? "monthly" : "annual")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            cadence === "monthly" ? "bg-gray-900" : "bg-gray-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
              cadence === "monthly" ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium ${cadence === "monthly" ? "text-gray-900" : "text-gray-500"}`}
        >
          Monthly
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
        {PRICING.map((tp) => (
          <TierCard
            key={tp.tier}
            tierPricing={tp}
            limits={TIER_LIMITS[tp.tier]}
            cadence={cadence}
            launchDiscount={
              tp.tier === LAUNCH_DISCOUNT.eligibleTier && cadence === "annual"
                ? LAUNCH_DISCOUNT
                : null
            }
          />
        ))}
      </div>
    </div>
  )
}
