// Admin billing — S7 §5, wired to admin.billing.getStatus + admin.billing.listHolds

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminBillingPage() {
  const status = trpc.admin.billing.getStatus.useQuery()
  const holds = trpc.admin.billing.listHolds.useQuery({})

  if (status.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const s = status.data
  const holdList = holds.data?.holds ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>

      {s && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={s.status === "healthy" ? "secondary" : "destructive"} className="capitalize">{s.status}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Holds</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{s.activeHolds}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Last Run</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{s.lastRunAt ? formatDate(s.lastRunAt) : "Never"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <h2 className="text-lg font-semibold">Billing Holds</h2>
      {holdList.length === 0 && <p className="text-muted-foreground">No active holds</p>}
      {holdList.map((h) => (
        <Card key={h.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">{h.listingName ?? "Unknown listing"}</p>
              <p className="text-sm text-muted-foreground">{h.reason}</p>
            </div>
            <Badge variant={h.remainingHours < 12 ? "destructive" : "outline"} className="text-[10px]">
              {Math.round(h.remainingHours)}h remaining
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
