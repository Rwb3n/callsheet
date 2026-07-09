// Admin scheduler queue — CS-WORK-119
// Wired to admin.scheduler.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500",
  executing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  exhausted: "bg-red-700",
  cancelled: "bg-gray-400",
}

export default function AdminSchedulerPage() {
  const result = trpc.admin.scheduler.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Scheduler Queue</h1>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const actions = result.data?.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Scheduler Queue</h1>
      {actions.length === 0 && <p className="text-muted-foreground">No scheduled actions</p>}
      {actions.map((a) => (
        <Card key={a.id} className="transition-shadow hover:shadow-md">
          <CardContent className="flex items-start gap-4 py-4">
            <div className="mt-1.5 shrink-0">
              <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[a.status] ?? "bg-gray-400"}`} title={a.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono text-sm">{a.action}</span>
                <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                <span>Created: {new Date(a.createdAt).toLocaleString()}</span>
                <span>Attempts: {a.attempts}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
