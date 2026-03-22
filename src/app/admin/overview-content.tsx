// Admin overview client content — S7 §1.4, CS-WORK-057 AC-1.5, AC-1.6, AC-1.8
// 7-panel card layout. Badge counts sourced from AdminOverview (AC-1.5).

"use client"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

function PanelSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  )
}

export function AdminOverviewContent() {
  const overview = trpc.admin.dashboard.getOverview.useQuery()

  if (overview.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <PanelSkeleton key={i} />
        ))}
      </div>
    )
  }

  const data = overview.data
  if (!data) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Support */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Open tickets</span>
            <span className="font-semibold">{data.tickets.open}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Critical</span>
            <Badge variant={data.tickets.critical > 0 ? "destructive" : "secondary"}>
              {data.tickets.critical}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Approaching SLA</span>
            <span className="font-semibold">{data.tickets.approachingSLA}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-semibold">{data.tasks.pending}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Overdue</span>
            <Badge variant={data.tasks.overdue > 0 ? "destructive" : "secondary"}>
              {data.tasks.overdue}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Flows */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Flows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active</span>
            <span className="font-semibold">{data.flows.active}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Failed</span>
            <Badge variant={data.flows.failed > 0 ? "destructive" : "secondary"}>
              {data.flows.failed}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Escalated</span>
            <span className="font-semibold">{data.flows.escalated}</span>
          </div>
        </CardContent>
      </Card>

      {/* Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge
              variant={
                data.health.status === "unhealthy" ? "destructive"
                  : data.health.status === "degraded" ? "outline"
                  : "secondary"
              }
            >
              {data.health.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {data.health.signals.filter(s => s.status !== "healthy").length} signal(s) need attention
          </div>
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Open DSARs</span>
            <span className="font-semibold">{data.compliance.openDSARs}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Approaching deadlines</span>
            <Badge variant={data.compliance.approachingDeadlines > 0 ? "destructive" : "secondary"}>
              {data.compliance.approachingDeadlines}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge
              variant={
                data.billing.status === "failed" ? "destructive"
                  : data.billing.status === "anomaly_detected" ? "outline"
                  : "secondary"
              }
            >
              {data.billing.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active holds</span>
            <span className="font-semibold">{data.billing.activeHolds}</span>
          </div>
        </CardContent>
      </Card>

      {/* Notifications — AC-1.8 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Unread</span>
            <Badge variant={data.notifications.unread > 0 ? "default" : "secondary"}>
              {data.notifications.unread}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
