// Admin flows — S7 §6, wired to admin.flows.list

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_COLOR: Record<string, string> = {
  initiated: "bg-gray-400",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  escalated: "bg-amber-500",
}

export default function AdminFlowsPage() {
  const result = trpc.admin.flows.list.useQuery({})

  if (result.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Orchestrated Flows</h1>
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="py-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    )
  }

  const flows = result.data?.flows ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Orchestrated Flows</h1>
      {flows.length === 0 && <p className="text-muted-foreground">No flows</p>}
      {flows.map((f) => (
        <Card key={f.flowId} className="transition-shadow hover:shadow-md">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_COLOR[f.status] ?? "bg-gray-400"}`} />
              <span className="font-medium capitalize">{f.flowType} flow</span>
              <Badge variant="outline" className="text-[10px] capitalize">{f.status.replace("_", " ")}</Badge>
              {f.daysRemaining != null && (
                <Badge variant={f.daysRemaining < 7 ? "destructive" : "secondary"} className="text-[10px]">
                  {f.daysRemaining}d remaining
                </Badge>
              )}
            </div>

            {/* Step progress bar */}
            <div className="flex gap-1 mt-3">
              {Array.from({ length: f.totalSteps }).map((_, i) => (
                <div key={i} className="flex-1">
                  <div className={`h-2 rounded-full ${
                    i < f.currentStep ? "bg-green-500" :
                    i === f.currentStep ? (f.status === "failed" ? "bg-red-500" : "bg-blue-500") :
                    "bg-muted"
                  }`} />
                </div>
              ))}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Step {f.currentStep + 1} of {f.totalSteps} — started {formatDate(f.startedAt)}
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
