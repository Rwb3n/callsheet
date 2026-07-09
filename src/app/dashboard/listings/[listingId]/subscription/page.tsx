// Subscription management — CS-WORK-117
// Current tier, billing, grace period warning, upgrade CTA.

"use client"

import { useParams } from "next/navigation"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const TIER_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  free: "outline",
  standard: "secondary",
  premium: "default",
}

export default function SubscriptionPage() {
  const { listingId } = useParams<{ listingId: string }>()
  const result = trpc.subscription.getSubscriptionStatus.useQuery({ listingId })
  const analytics = trpc.dashboard.getListingDashboard.useQuery({ listingId })

  if (result.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const sub = result.data

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current Plan
            {sub && <Badge variant={TIER_COLORS[sub.tier] ?? "outline"} className="capitalize">{sub.tier}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sub ? (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Tier:</span> <span className="capitalize">{sub.tier}</span></p>
              {sub.subscriptionEndDate && (
                <p><span className="text-muted-foreground">Renews:</span> {new Date(sub.subscriptionEndDate).toLocaleDateString()}</p>
              )}
              {sub.gracePeriod && (
                <p className="font-medium text-amber-600">
                  Grace period active — renew before {sub.gracePeriod.expiresAt ? new Date(sub.gracePeriod.expiresAt).toLocaleDateString() : "expiry"} to keep your tier.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active subscription</p>
          )}
        </CardContent>
      </Card>

      {sub?.tier === "free" && (
        <Card>
          <CardHeader><CardTitle>Upgrade</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Unlock analytics, ranking boosts and premium features.
            </p>
            <Button asChild>
              <a href="/pricing">View plans</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {analytics.data?.analytics && (
        <Card>
          <CardHeader><CardTitle>Quick Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold">{analytics.data.analytics.totalProfileViews ?? 0}</p>
                <p className="text-xs text-muted-foreground">Profile views</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.data.analytics.totalSearchAppearances ?? 0}</p>
                <p className="text-xs text-muted-foreground">Search appearances</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.data.analytics.totalEnquiriesReceived ?? 0}</p>
                <p className="text-xs text-muted-foreground">Enquiries</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.data.quality.composite ?? 0}</p>
                <p className="text-xs text-muted-foreground">Quality score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
