// Admin events — S7 §7, wired to admin.events.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminEventsPage() {
  const result = trpc.admin.events.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Event Consumer Errors</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const data = result.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Event Consumer Errors</h1>
        {data && data.totalUnresolved > 0 && (
          <Badge variant="destructive">{data.totalUnresolved} unresolved</Badge>
        )}
      </div>
      {(!data || data.errors.length === 0) && <p className="text-muted-foreground">No errors</p>}
      {data?.errors.map((g) => (
        <Card key={g.consumerId} className="transition-shadow hover:shadow-md">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />
              <code className="text-sm font-medium">{g.consumerId}</code>
              <Badge variant="destructive" className="text-[10px]">{g.errorCount} error{g.errorCount !== 1 ? "s" : ""}</Badge>
            </div>
            {g.latestError && (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">{g.latestError.eventType}</code>
                  <span className="text-xs text-muted-foreground">{g.latestError.mode}</span>
                </div>
                <p className="mt-1 text-sm text-destructive font-mono truncate">{g.latestError.error}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(g.latestError.timestamp)}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
