// Homepage — CS-WORK-114
// Hero section, value proposition, CTAs, search entry point, pricing preview.

import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Callsheet — UK Production Services Directory",
  description:
    "Find and connect with verified broadcast, film and TV production service providers across the UK. Free search, quality-ranked results.",
}

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Find the right crew.
            <br />
            <span className="text-primary">Every time.</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
            The UK's quality-ranked directory of broadcast, film and TV production services.
            Search verified providers by specialism, region and availability.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/search">Search providers</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/signup">List your services</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value proposition */}
      <section className="border-t bg-muted/30 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            Why production teams choose Callsheet
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <ValueCard
              title="Quality ranked"
              description="Listings are ranked by data completeness, verification status and engagement — not by who pays the most. Quality is earned, visibility is bought."
            />
            <ValueCard
              title="Verified providers"
              description="Companies House verification, 4-tier trust system from unclaimed to premium verified. Know who you're hiring before you pick up the phone."
            />
            <ValueCard
              title="Built for broadcast"
              description="Three-level taxonomy of 7 sectors, 64 service areas and 269 specialisations. From camera operators to post-production, every specialism has a home."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            How it works
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <StepCard
              step="1"
              title="Search"
              description="Browse by specialism, region or keyword. Full-text search with synonym expansion and fuzzy matching."
            />
            <StepCard
              step="2"
              title="Compare"
              description="View quality scores, verification badges, capabilities and contact details. Shortlist your top picks."
            />
            <StepCard
              step="3"
              title="Connect"
              description="Send enquiries directly to providers. Track conversations, manage shortlists, get matched."
            />
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="border-t bg-muted/30 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Free to search. Affordable to list.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every listing is discoverable for free. Paid plans start at
            <span className="font-semibold text-foreground"> £199/year </span>
            and unlock analytics, ranking boosts and premium features.
          </p>
          <div className="mt-8">
            <Button variant="outline" asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to get discovered?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join the UK's production services directory. Claim your listing or create a new one in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/search">Browse providers</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function ValueCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {step}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
