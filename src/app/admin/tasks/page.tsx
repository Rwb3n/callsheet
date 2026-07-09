// Admin tasks — CS-WORK-118
// Task queue wired to admin.tasks.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-400",
}

const PRIORITY_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  critical: "destructive",
  high: "default",
  normal: "secondary",
  low: "outline",
}

export default function AdminTasksPage() {
  const result = trpc.admin.tasks.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const tasks = result.data?.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
      {tasks.length === 0 && <p className="text-muted-foreground">No tasks queued</p>}
      {tasks.map((t) => (
        <Card key={t.id} className="transition-shadow hover:shadow-md">
          <CardContent className="flex items-start gap-4 py-4">
            <div className="mt-1.5 shrink-0">
              <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[t.status] ?? "bg-gray-400"}`} title={t.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.domain.replace(/_/g, " ")}</span>
                <Badge variant={PRIORITY_VARIANT[t.priority] ?? "outline"} className="text-[10px] capitalize">{t.priority}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize">{t.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                <span>{t.domain}</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
