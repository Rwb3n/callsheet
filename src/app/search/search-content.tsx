// Search page client content — CH-CS-014 W6 AC-20 through AC-25
// Client component handling search state, autocomplete, facets, and result display.

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type Filters = {
  sectors?: string[]
  serviceAreas?: string[]
  location?: string
  verificationTiers?: string[]
}

export function SearchPageContent() {
  const [query, setQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [filters, setFilters] = useState<Filters>({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // AC-20: search query
  const searchResult = trpc.search.query.useQuery(
    { query: submittedQuery || undefined, filters },
    { enabled: true, placeholderData: (prev) => prev },
  )

  // AC-25: autocomplete with debounce
  const [debouncedPrefix, setDebouncedPrefix] = useState("")
  useEffect(() => {
    if (query.length < 2) { setDebouncedPrefix(""); return }
    const timer = setTimeout(() => setDebouncedPrefix(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const suggestions = trpc.search.suggest.useQuery(
    { prefix: debouncedPrefix },
    { enabled: debouncedPrefix.length >= 2 },
  )

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    setSubmittedQuery(query)
    setShowSuggestions(false)
  }, [query])

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setQuery(suggestion)
    setSubmittedQuery(suggestion)
    setShowSuggestions(false)
  }, [])

  const toggleFilter = useCallback((dimension: keyof Filters, value: string) => {
    setFilters((prev) => {
      if (dimension === "location") {
        return { ...prev, location: prev.location === value ? undefined : value }
      }
      const current = (prev[dimension] as string[] | undefined) ?? []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [dimension]: next.length > 0 ? next : undefined }
    })
  }, [])

  const data = searchResult.data

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* AC-21: Facet sidebar */}
      <aside className="w-full shrink-0 lg:w-56">
        {searchResult.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : data?.facets ? (
          <div className="space-y-6">
            <FacetGroup
              title="Sector"
              items={data.facets.sectors.map((f) => ({ value: f.slug, label: f.label, count: f.count }))}
              selected={filters.sectors ?? []}
              onToggle={(v) => toggleFilter("sectors", v)}
            />
            <FacetGroup
              title="Service Area"
              items={data.facets.serviceAreas.slice(0, 10).map((f) => ({ value: f.slug, label: f.label, count: f.count }))}
              selected={filters.serviceAreas ?? []}
              onToggle={(v) => toggleFilter("serviceAreas", v)}
            />
            <FacetGroup
              title="Location"
              items={data.facets.locations.slice(0, 10).map((f) => ({ value: f.slug, label: f.label, count: f.count }))}
              selected={filters.location ? [filters.location] : []}
              onToggle={(v) => toggleFilter("location", v)}
            />
            <FacetGroup
              title="Verification"
              items={data.facets.verificationTiers.map((f) => ({
                value: f.tier,
                label: f.tier.replace("_", " "),
                count: f.count,
              }))}
              selected={filters.verificationTiers ?? []}
              onToggle={(v) => toggleFilter("verificationTiers", v)}
            />
          </div>
        ) : null}
      </aside>

      {/* Main content */}
      <div className="flex-1">
        {/* Search input with AC-25 autocomplete */}
        <form onSubmit={handleSubmit} className="relative mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                type="search"
                placeholder="Search providers, services, specialisations..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
                onFocus={() => { if (query.length >= 2) setShowSuggestions(true) }}
                onBlur={() => { setTimeout(() => setShowSuggestions(false), 200) }}
                className="w-full"
              />
              {showSuggestions && suggestions.data && suggestions.data.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {suggestions.data.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={() => handleSuggestionClick(s)}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="submit">Search</Button>
          </div>
        </form>

        {/* Result count */}
        {data && (
          <p className="mb-4 text-sm text-muted-foreground">
            {data.totalCount} result{data.totalCount !== 1 ? "s" : ""}
          </p>
        )}

        {/* AC-23: Sponsored results */}
        {data?.sponsoredResults && data.sponsoredResults.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sponsored
            </h2>
            <div className="grid gap-3">
              {data.sponsoredResults.map((r) => (
                <ListingCard key={r.slug} listing={r} sponsored />
              ))}
            </div>
          </section>
        )}

        {/* AC-20: Search results */}
        {searchResult.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : data?.results && data.results.length > 0 ? (
          <div className="grid gap-3">
            {data.results.map((r) => (
              <ListingCard key={r.slug} listing={r} />
            ))}
          </div>
        ) : data?.totalCount === 0 ? (
          /* AC-24: Zero-result state */
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium">No results found</p>
              {data.zeroResultSuggestions && data.zeroResultSuggestions.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-muted-foreground">Try these instead:</p>
                  <ul className="space-y-1">
                    {data.zeroResultSuggestions.map((s) => (
                      <li key={s} className="text-sm text-primary">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.suggestedFilters && data.suggestedFilters.length > 0 && (
                <div className="mt-4">
                  <ul className="space-y-1">
                    {data.suggestedFilters.map((s) => (
                      <li key={s} className="text-sm text-muted-foreground">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

// AC-22: Result card with listing summary
function ListingCard({
  listing,
  sponsored,
}: {
  listing: {
    slug: string
    name: string
    headline: string | null
    entityType: string
    baseRegion: string | null
    verificationTier: string
    qualityScore: number
    taxonomyTags: string[]
    headshotUrl: string | null
    logoUrl: string | null
  }
  sponsored?: boolean
}) {
  return (
    <Link href={`/providers/${listing.slug}`} className="block">
      <Card className={`transition-shadow hover:shadow-md ${sponsored ? "border-primary/20 bg-primary/5" : ""}`}>
        <CardContent className="flex items-start gap-4 py-4">
          {/* Avatar */}
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
            {(listing.logoUrl || listing.headshotUrl) ? (
              <img
                src={listing.logoUrl ?? listing.headshotUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                {listing.name[0]}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{listing.name}</span>
              {listing.verificationTier !== "unclaimed" && (
                <Badge variant="secondary" className="text-[10px]">
                  {listing.verificationTier.replace("_", " ")}
                </Badge>
              )}
              {sponsored && (
                <Badge variant="outline" className="text-[10px]">Sponsored</Badge>
              )}
            </div>

            {listing.headline && (
              <p className="mt-0.5 text-sm text-muted-foreground truncate">{listing.headline}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="capitalize">{listing.entityType.replace("_", " ")}</span>
              {listing.baseRegion && <span>{listing.baseRegion}</span>}
              <span>Quality: {listing.qualityScore}</span>
            </div>

            {listing.taxonomyTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {listing.taxonomyTags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                    {tag}
                  </Badge>
                ))}
                {listing.taxonomyTags.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{listing.taxonomyTags.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function FacetGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string
  items: { value: string; label: string; count: number }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (items.length === 0) return null

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.value}>
            <button
              type="button"
              onClick={() => onToggle(item.value)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                selected.includes(item.value)
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <span className="capitalize truncate">{item.label}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
