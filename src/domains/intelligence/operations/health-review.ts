// OperationalHealthReport type — S9 §4.2, §5.6
// Exported for use by operational_health_review ceremony handler and admin routes.

export type OperationalHealthReport = {
  hypotheses: { id: string; trend: string; confoundWarning: string | null }[]
  supportTicketTrends: {
    openCount: number
    closedCount: number
    avgResolutionDays: number
    topCategories: { category: string; count: number }[]
  }
  taskCompletionRates: {
    totalTasks: number
    completedTasks: number
    completionRate: number
    avgCompletionDays: number
  }
  signalSummary: {
    decisionLogsThisPeriod: number
    escalationsThisPeriod: number
    ceremonyRunsThisPeriod: number
  }
}
