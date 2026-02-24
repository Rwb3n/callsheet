import type { TierPricing } from "@/domains/commercial/subscription/pricing"
import type { LAUNCH_DISCOUNT } from "@/domains/commercial/subscription/pricing"
import type { TierLimits } from "@/domains/commercial/tier-limits"
import type { BillingCadence } from "./billing-toggle"

type Props = {
  tierPricing: TierPricing
  limits: TierLimits
  cadence: BillingCadence
  launchDiscount: typeof LAUNCH_DISCOUNT | null
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  premium: "Premium",
  partner: "Partner",
}

function formatPrice(price: number): string {
  if (price === 0) return "£0"
  return `£${price}`
}

function buildFeatureList(limits: TierLimits): string[] {
  const features: string[] = []
  features.push(`${limits.maxMedia} media items`)
  features.push(limits.maxCredits === "unlimited" ? "Unlimited credits" : `${limits.maxCredits} credits`)
  if (limits.customTags) features.push("Custom tags")
  if (limits.trendAnalytics !== "none") features.push(`${limits.trendAnalytics} trend analytics`)
  if (limits.topSearchTerms) features.push("Top search terms")
  if (limits.rankingBoost > 0) features.push(`+${limits.rankingBoost} ranking boost`)
  if (limits.viewerDemographics) features.push("Viewer demographics")
  if (limits.competitorBenchmarking) features.push("Competitor benchmarking")
  if (limits.sponsoredPlacement) features.push("Sponsored placement")
  if (limits.enquiryResponseInsights) features.push("Enquiry response insights")
  if (limits.prioritySupport) features.push("Priority support")
  if (limits.buyerVisibleEngagementStats) features.push("Engagement stats visible to buyers")
  return features
}

export function TierCard({ tierPricing, limits, cadence, launchDiscount }: Props) {
  const price = cadence === "annual" ? tierPricing.annualPrice : tierPricing.monthlyPrice
  const displayPrice = launchDiscount ? launchDiscount.discountedAnnualPrice : price
  const period = cadence === "annual" ? "/year" : "/month"
  const isFree = tierPricing.tier === "free"
  const features = buildFeatureList(limits)

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        launchDiscount ? "border-amber-400 ring-2 ring-amber-400" : "border-gray-200"
      }`}
    >
      {launchDiscount && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-gray-900 whitespace-nowrap">
          {launchDiscount.displayBadge}
        </div>
      )}

      <h3 className="text-lg font-semibold text-gray-900">
        {TIER_LABELS[tierPricing.tier] ?? tierPricing.tier}
      </h3>
      <p className="mt-1 text-sm text-gray-500">{tierPricing.targetPersona}</p>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-bold text-gray-900">
          {formatPrice(displayPrice)}
        </span>
        {!isFree && <span className="text-sm text-gray-500">{period}</span>}
        {isFree && <span className="text-sm text-gray-500">forever</span>}
      </div>

      {launchDiscount && (
        <p className="mt-1 text-sm text-gray-500 line-through">
          {formatPrice(launchDiscount.fullPrice)}/year
        </p>
      )}

      <ul className="mt-6 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-0.5 text-gray-400" aria-hidden="true">&#x2713;</span>
            {f}
          </li>
        ))}
      </ul>

      <a
        href={isFree ? "/signup" : `/signup?redirect=/pricing&tier=${tierPricing.tier}`}
        className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
          isFree
            ? "bg-gray-100 text-gray-900 hover:bg-gray-200"
            : "bg-gray-900 text-white hover:bg-gray-800"
        }`}
      >
        {isFree ? "Sign Up Free" : "Get Started"}
      </a>
    </div>
  )
}
