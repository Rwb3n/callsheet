// Admin health page — S7 §8, CS-WORK-062 AC-8.9/AC-8.10, CS-WORK-064 AC-12.5/AC-12.6
// Point-in-time health status with 5 signal panels + friction summary.

"use client"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const STATUS_COLORS = {
  healthy: "bg-green-500/10 text-green-700 dark:text-green-400",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
} as const

const OVERALL_COLORS = {
  healthy: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
  degraded: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400",
  unhealthy: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400",
} as const

const SIGNAL_LABELS: Record<string, string> = {
  billing_reconciliation: "Billing Reconciliation",
  event_consumer_errors: "Event Consumer Errors",
  deferred_action_failures: "Deferred Action Failures",
  orchestrated_flows: "Orchestrated Flows",
  paddle_webhook_silence: "Paddle Webhook Silence",
}

export default function AdminHealthPage() {
  const { data, isLoading } = trpc.admin.health.getStatus.useQuery()

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Platform Health</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Platform Health</h1>
        <Badge className={OVERALL_COLORS[data.overall]} variant="outline">
          {data.overall}
        </Badge>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.signals.map((signal) => (
          <Card key={signal.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                {SIGNAL_LABELS[signal.name] ?? signal.name}
                <Badge className={STATUS_COLORS[signal.status]} variant="outline">
                  {signal.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{signal.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AC-12.5, AC-12.6: Feature gate friction summary — CS-WORK-064 */}
      <FrictionSummary />
    </div>
  )
}

// AC-12.5: friction summary as sub-section, AC-12.6: red highlight on threshold breach
const ESCALATION_THRESHOLD = 0.2 // 5:1 ratio approximated as 20% — spec §12 note

function FrictionSummary() {
  const { data, isLoading } = trpc.admin.friction.getSummary.useQuery({ period: "30d" })

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Feature Gate Friction</h2>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.gates.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No feature gating confusion tickets in the last 30 days.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gate Name</TableHead>
                  <TableHead className="text-right">Ticket Count</TableHead>
                  <TableHead className="text-right">Total Tickets</TableHead>
                  <TableHead className="text-right">Friction Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.gates.map((gate) => {
                  const exceeds = gate.frictionRatio > ESCALATION_THRESHOLD
                  return (
                    <TableRow key={gate.gateName} className={exceeds ? "bg-red-500/10" : undefined}>
                      <TableCell className={exceeds ? "font-medium text-red-700 dark:text-red-400" : undefined}>
                        {gate.gateName}
                      </TableCell>
                      <TableCell className={`text-right ${exceeds ? "text-red-700 dark:text-red-400" : ""}`}>
                        {gate.ticketCount}
                      </TableCell>
                      <TableCell className="text-right">{gate.totalTickets}</TableCell>
                      <TableCell className={`text-right ${exceeds ? "font-medium text-red-700 dark:text-red-400" : ""}`}>
                        {(gate.frictionRatio * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
