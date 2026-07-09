// Quality methodology — S5 §4.1, CS-WORK-044 AC-15
// Static SSG page explaining quality scoring methodology.

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quality Score Methodology",
  description: "How CALLSHEET calculates quality scores for production service listings.",
}

export default function QualityMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Quality Score Methodology</h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">How Quality Scores Work</h2>
        <p className="leading-7 text-muted-foreground">
          Every listing on CALLSHEET receives a quality score from 0 to 100.
          This score reflects how complete, accurate, and up-to-date your listing
          is. Higher quality scores improve your search ranking and visibility.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">Five Dimensions</h2>

        <div className="space-y-6">
          <DimensionCard
            name="Completeness"
            range="0–25"
            description="Measures how many profile fields are filled in: headline, bio, contact details, portfolio images, credits, and taxonomy tags."
          />
          <DimensionCard
            name="Freshness"
            range="0–25"
            description="Measures how recently your listing was updated. Listings that haven't been edited in over 6 months receive a decay penalty."
          />
          <DimensionCard
            name="Accuracy"
            range="0–20"
            description="Measures data consistency: valid contact details, matching Companies House records, and no conflicting information."
          />
          <DimensionCard
            name="Richness"
            range="0–15"
            description="Measures depth of content: portfolio images, credits with details, social profile links, and accreditations."
          />
          <DimensionCard
            name="Verification"
            range="0–15"
            description="Measures trust signals: verification tier, number of verification methods completed, and client-confirmed credits."
          />
        </div>
      </section>

      <section className="mt-10 space-y-4 rounded-lg border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold">Improving Your Score</h2>
        <p className="leading-7 text-muted-foreground">
          Your dashboard shows the top 3 actions that would most improve your
          quality score, with direct links to the relevant profile editor
          sections.
        </p>
      </section>
    </main>
  )
}

function DimensionCard({ name, range, description }: { name: string; range: string; description: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{name}</h3>
        <span className="text-sm text-muted-foreground">{range}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
