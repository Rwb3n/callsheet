import type { Metadata } from "next"
import { PricingSection } from "@/components/pricing/billing-toggle"

export const metadata: Metadata = {
  title: "Pricing — Callsheet",
  description: "Subscription plans for UK broadcast, film and TV production service providers.",
}

export default function PricingPage() {
  return (
    <main className="min-h-screen px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Plans &amp; Pricing
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Every listing is discoverable for free. Paid plans unlock analytics, ranking boosts, and premium features.
        </p>
      </div>

      <PricingSection />

      <p className="mt-10 text-center text-xs text-gray-400">
        All prices exclude VAT. VAT will be added at checkout where applicable.
      </p>
    </main>
  )
}
