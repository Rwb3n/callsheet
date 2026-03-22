// Listing profile page — S6 §2, CS-WORK-051 AC-11 through AC-19
// CH-CS-014 W7 AC-26 through AC-29 — styled layout
// SSG+ISR with 15-minute revalidation. On-demand revalidation via event consumers.
// profile_viewed emitted server-side, NOT during build-time static generation.

import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { getDb } from "@/db"
import { listings } from "@/db/schema/data-and-listings"
import { inferSource } from "@/domains/platform/buyer/infer-source"
import { resolveProfileCTA } from "@/domains/platform/buyer/resolve-profile-cta"
import { generateJsonLd } from "@/domains/platform/buyer/generate-json-ld"
import {
  resolveContactDisplay,
  shouldShowEngagementStats,
  resolveUpgradeCTA,
  getProfileMediaLimits,
} from "@/domains/platform/buyer/profile-display"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getProfileData, type ListingProfileResult } from "./data"

// ISR revalidation: 15 minutes [SI §7.1]
export const revalidate = 900

// AC-11: static generation for all active listings
export async function generateStaticParams() {
  const db = getDb()
  const slugs = await db
    .select({ slug: listings.slug })
    .from(listings)
    .where(eq(listings.lifecycleStatus, "active"))
  return slugs.map((s) => ({ slug: s.slug }))
}

// AC-17: SEO meta tags
export async function generateMetadata(
  props: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await props.params
  const profile = await getProfileData(slug)
  if (!profile) return { title: "Not Found" }

  const title = profile.listing.headline
    ? `${profile.listing.name} \u2014 ${profile.listing.headline} | CALLSHEET`
    : `${profile.listing.name} | CALLSHEET`
  const description = profile.listing.bio?.slice(0, 160) ?? ""
  const canonical = `https://callsheet.co.uk/providers/${profile.listing.slug}`
  const ogImage = profile.listing.logoUrl ?? profile.listing.headshotUrl ?? undefined

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: profile.listing.headline
        ? `${profile.listing.name} \u2014 ${profile.listing.headline}`
        : profile.listing.name,
      description: profile.listing.bio?.slice(0, 200) ?? "",
      url: canonical,
      type: "profile",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: { card: "summary_large_image" },
  }
}

// AC-27: tier-specific verification badge
function VerificationBadge({ tier }: { tier: string }) {
  if (tier === "unclaimed") return null

  const config = {
    claimed: { label: "Claimed", icon: "\u2713", variant: "secondary" as const },
    verified: { label: "Verified", icon: "\uD83D\uDEE1\uFE0F", variant: "default" as const },
    premium_verified: { label: "Premium Verified", icon: "\u2B50", variant: "default" as const },
  }[tier]

  if (!config) return null

  return (
    <Badge variant={config.variant} className="gap-1">
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </Badge>
  )
}

export default async function ListingProfilePage(
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params
  const profile = await getProfileData(slug)

  // AC-12: 404 for non-existent, archived, suspended, erased
  if (!profile || profile.listing.lifecycleStatus !== "active") {
    notFound()
  }

  // AC-18: emit profile_viewed server-side, NOT during build [S6 §2.10]
  try {
    const headerStore = await headers()
    const referer = headerStore.get("referer")
    const source = inferSource(referer)
    const { emitProfileViewed } = await import("./emit")
    await emitProfileViewed(profile.listing.id, source, null)
  } catch {
    // Build-time generation — no emit, no headers
  }

  const cta = resolveProfileCTA(
    {
      id: profile.listing.id,
      claimStatus: profile.listing.claimStatus as "unclaimed" | "pending_review" | "claimed" | "disputed",
      contactEmail: profile.listing.contactEmail,
      contactPhone: profile.listing.contactPhone,
      websiteUrl: profile.listing.websiteUrl,
    },
    null,
  )

  const jsonLd = generateJsonLd({
    slug: profile.listing.slug,
    name: profile.listing.name,
    entityType: profile.listing.entityType,
    headline: profile.listing.headline,
    bio: profile.listing.bio,
    logoUrl: profile.listing.logoUrl,
    headshotUrl: profile.listing.headshotUrl,
    websiteUrl: profile.listing.websiteUrl,
    contactPhone: profile.listing.contactPhone,
    baseRegion: profile.listing.baseRegion,
    foundedYear: profile.listing.foundedYear,
    socialProfiles: profile.socialProfiles,
    taxonomyTags: profile.tags.map((t) => t.name),
  })

  const showQuality = profile.verification &&
    (profile.verification.tier === "verified" || profile.verification.tier === "premium_verified")

  return (
    <main className="mx-auto max-w-4xl px-page py-8">
      {/* AC-17: JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* AC-26: Identity section */}
      <section className="mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar/logo */}
          {(profile.listing.logoUrl || profile.listing.headshotUrl) && (
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              <img
                src={profile.listing.logoUrl ?? profile.listing.headshotUrl ?? ""}
                alt={profile.listing.name}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{profile.listing.name}</h1>
              {/* AC-27: verification badge */}
              {profile.verification && (
                <VerificationBadge tier={profile.verification.tier} />
              )}
            </div>

            {profile.listing.headline && (
              <p className="mt-1 text-lg text-muted-foreground">{profile.listing.headline}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {profile.listing.entityType && (
                <span className="capitalize">{profile.listing.entityType.replace("_", " ")}</span>
              )}
              {profile.listing.baseRegion && (
                <span>{profile.listing.baseRegion}</span>
              )}
              {showQuality && profile.qualityScore && (
                <span data-testid="quality-score" className="font-medium text-foreground">
                  Quality: {profile.qualityScore.composite}/100
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content column */}
        <div className="flex flex-col gap-8">
          {/* Bio */}
          {profile.listing.bio && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">About</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {profile.listing.bio}
              </p>
            </section>
          )}

          {/* Taxonomy tags */}
          {profile.tags.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Services</h2>
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((t) => (
                  <Badge key={t.id} variant="secondary">{t.name}</Badge>
                ))}
              </div>
            </section>
          )}

          {/* Credits */}
          {profile.credits.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Credits</h2>
              <div className="divide-y divide-border">
                {profile.credits.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{c.projectName}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.roleProvided}{c.year ? ` \u2014 ${c.year}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AC-28: Media gallery — responsive grid with lazy loading */}
          {profile.media.length > 0 && (
            <section data-testid="media-gallery">
              <h2 className="mb-3 text-lg font-semibold">Portfolio</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {profile.media.map((m) => (
                  <div key={m.id} className="overflow-hidden rounded-lg bg-muted">
                    <img
                      src={m.url}
                      alt={m.caption ?? ""}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar column */}
        <div className="flex flex-col gap-6">
          {/* AC-29: CTA card */}
          <Card data-testid="profile-cta">
            <CardContent className="pt-6">
              {cta.type === "enquire" && (
                <Button asChild className="w-full">
                  <Link href={`/providers/${profile.listing.slug}/enquiry`}>
                    {cta.label}
                  </Link>
                </Button>
              )}
              {cta.type === "contact" && (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{cta.label}</p>
                  {profile.listing.contactEmail && (
                    <a href={`mailto:${profile.listing.contactEmail}`} className="block text-primary hover:underline">
                      {profile.listing.contactEmail}
                    </a>
                  )}
                  {profile.listing.contactPhone && (
                    <a href={`tel:${profile.listing.contactPhone}`} className="block text-primary hover:underline">
                      {profile.listing.contactPhone}
                    </a>
                  )}
                  {profile.listing.websiteUrl && (
                    <a href={profile.listing.websiteUrl} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline">
                      Website
                    </a>
                  )}
                </div>
              )}
              {(cta.type === "claim" || cta.type === "claim_targeted") && (
                <Button asChild variant="outline" className="w-full">
                  <Link href={cta.target}>{cta.label}</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quality score detail */}
          {showQuality && profile.qualityScore && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quality Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{profile.qualityScore.composite}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Link href="/quality-methodology" className="mt-2 block text-xs text-muted-foreground hover:text-primary">
                  How is this calculated?
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Social profiles */}
          {profile.socialProfiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Links</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {profile.socialProfiles.map((s) => (
                    <li key={s.platform}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm capitalize text-primary hover:underline"
                      >
                        {s.platform}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Accreditations */}
          {profile.accreditations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Accreditations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {profile.accreditations.map((a) => (
                    <Badge key={a.id} variant="outline">{a.body}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
