// Analytics page — CS-WORK-117
// Tier-gated analytics: free = totals, standard = 30d, premium = 90d.

"use client"

import { useParams } from "next/navigation"
import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function AnalyticsPage() {
  const { listingId } = useParams<{ listingId: string }>()
  const result = trpc.dashboard.getListingDashboard.useQuery({ listingId })

  if (result.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const data = result.data

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Profile views" value={data.analytics?.totalProfileViews ?? 0} />
            <StatCard label="Search appearances" value={data.analytics?.totalSearchAppearances ?? 0} />
            <StatCard label="Enquiries received" value={data.analytics?.totalEnquiriesReceived ?? 0} />
            <StatCard label="Quality" value={data.quality.composite} suffix="/100" />
          </div>

          <Card>
            <CardHeader><CardTitle>Quality Score</CardTitle></CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{data.quality.composite}<span className="text-lg text-muted-foreground">/100</span></p>
              <p className="mt-1 text-sm text-muted-foreground">
                Based on data completeness, verification status and engagement.
              </p>
            </CardContent>
          </Card>

          {data.featureAccess.trendAnalytics === "none" && (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground">Detailed analytics require a paid plan.</p>
                <Button variant="outline" className="mt-3" asChild>
                  <a href="/pricing">Upgrade for more insights</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {data.decayWarning && (
            <Card className="border-amber-500/50">
              <CardHeader><CardTitle className="text-amber-600">Data Freshness Warning</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{data.decayWarning.body}</p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No analytics data available yet.</p>
      )}
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <Card>
      <CardContent className="py-4 text-center">
        <p className="text-2xl font-bold">{value}{suffix}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
