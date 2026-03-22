// Listing detail — S5 §3, §4, CS-WORK-044 AC-6, AC-12, AC-14

"use client"

import { use } from "react"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function ListingDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params)
  const result = trpc.dashboard.getListingDashboard.useQuery({ listingId })

  if (result.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  if (result.error) {
    return <p className="text-destructive">Failed to load listing: {result.error.message}</p>
  }

  const { listing, analytics, quality, profileStrength, featureAccess } = result.data!

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{listing.name}</h1>
        <Badge variant="outline" className="capitalize">{listing.subscriptionTier}</Badge>
        {listing.verificationTier !== "unclaimed" && (
          <Badge variant="secondary" className="capitalize">
            {listing.verificationTier.replace("_", " ")}
          </Badge>
        )}
      </div>

      {/* Engagement counters */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Profile Views</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{analytics.totalProfileViews}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Search Appearances</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{analytics.totalSearchAppearances}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Enquiries</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{analytics.totalEnquiriesReceived}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Quality Score</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{quality.composite}</p></CardContent>
        </Card>
      </div>

      {/* Profile strength */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile Strength</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${profileStrength}%` }}
              />
            </div>
            <span className="text-sm font-medium">{profileStrength}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Feature access summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Feature Access</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(featureAccess).map(([feature, value]) => (
              <Badge
                key={feature}
                variant={value === true || (typeof value === "string" && value !== "none") || (typeof value === "number" && value > 0) ? "default" : "outline"}
                className="text-[10px]"
              >
                {feature.replace(/([A-Z])/g, " $1").trim()}
                {typeof value === "number" && `: ${value}`}
                {typeof value === "string" && value !== "none" && `: ${value}`}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
