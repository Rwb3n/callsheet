// Dashboard overview client content — CH-CS-014 W8 AC-30, AC-32, AC-33

"use client"

import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function DashboardOverviewContent() {
  const overview = trpc.dashboard.getOverview.useQuery()

  // AC-33: loading skeletons
  if (overview.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-4">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const data = overview.data

  // AC-32: empty state
  if (!data || data.cards.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <p className="text-lg font-medium">No listings yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first listing to start appearing in search results.
          </p>
          <Button asChild>
            <Link href="/dashboard/listings/new">Create Listing</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.cards.map((card) => (
        <Link key={card.listingId} href={`/dashboard/listings/${card.listingId}`}>
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{card.name}</CardTitle>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {card.subscriptionTier}
                  </Badge>
                  {card.verificationTier !== "unclaimed" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {card.verificationTier.replace("_", " ")}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Engagement totals */}
              <div className="mb-4 flex gap-6 text-sm">
                <div>
                  <p className="text-xl font-semibold">{card.profileViews}</p>
                  <p className="text-xs text-muted-foreground">Views</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{card.enquiriesReceived}</p>
                  <p className="text-xs text-muted-foreground">Enquiries</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{card.qualityComposite}</p>
                  <p className="text-xs text-muted-foreground">Quality</p>
                </div>
              </div>

              {/* Profile strength meter */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Profile strength</span>
                  <span className="font-medium">{card.profileStrength}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${card.profileStrength}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
