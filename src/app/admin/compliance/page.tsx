// Admin compliance — S7 §4, wired to admin.compliance.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  overdue: "bg-red-500",
}

export default function AdminCompliancePage() {
  const result = trpc.admin.compliance.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Compliance Register</h1>
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const entries = result.data?.entries ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Compliance Register</h1>
      {entries.length === 0 && <p className="text-muted-foreground">No compliance entries</p>}
      {entries.map((e) => (
        <Card key={e.id} className="transition-shadow hover:shadow-md">
          <CardContent className="flex items-start gap-4 py-4">
            <div className="mt-1.5 shrink-0">
              <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[e.status] ?? "bg-gray-400"}`} title={e.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px] uppercase">{e.type}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                {e.accountEmail && <span>{e.accountEmail}</span>}
                {e.daysRemaining != null && (
                  <span className={e.daysRemaining < 7 ? "text-red-500 font-medium" : ""}>
                    {e.daysRemaining} days remaining
                  </span>
                )}
                {e.receivedAt && <span>Received {formatDate(e.receivedAt)}</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
