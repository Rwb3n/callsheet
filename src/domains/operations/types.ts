// Operations domain shared types — Ops §4.1
// TaskSpec: interface between entity decision engine and human resource layer.
// Consumed by D&L (claim review, verification review) and PP (admin queue display).

type DataAccessScope = {
  entities: string[]
  fields: string[]
  excludeFields: string[]
  personalDataAccess: boolean
  justification: string
}

type LearningCapture = {
  outcomeCategories: string[]
  hypothesisToTest?: string
  feedbackFields: Record<string, string>
}

export type TaskSpec = {
  id: string
  domain: "verification" | "support" | "moderation" | "compliance" | "data_maintenance" | "outreach"
  priority: "critical" | "high" | "normal" | "low"
  task: string
  context: Record<string, unknown>
  checklist: string[]
  acceptanceCriteria: string
  estimatedTime: string
  deadline?: string
  timeout: number
  escalation: string
  requiredSkills: string[]
  dataAccessScope: DataAccessScope
  learningCapture: LearningCapture
}

type TaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "timed_out" | "re_routed"
