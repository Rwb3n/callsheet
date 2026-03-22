// Orchestrated flow types — SI §3, S0 §4

type UUID = string
type ISO8601 = string

export type FlowType = "erasure" | "closure"

export type FlowStatus = "initiated" | "in_progress" | "completed" | "failed" | "escalated"

export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped"

export interface FlowStepDefinition<TContext = Record<string, unknown>> {
  name: string
  domain: string
  execute: (context: TContext) => Promise<void>
  skippable: boolean
}

export interface OrchestratedFlowStep {
  name: string
  domain: string
  status: StepStatus
  attempt: number
  completedAt?: ISO8601
  error?: string
  retryable: boolean
  skippable: boolean
  skipReason?: string
  skippedBy?: string
}

export interface OrchestratedFlowProgress<TContext = Record<string, unknown>> {
  flowId: UUID
  flowType: FlowType
  triggeredBy: UUID
  status: FlowStatus
  steps: OrchestratedFlowStep[]
  currentStep: number
  context: TContext
  startedAt: ISO8601
  completedAt?: ISO8601
  deadline?: ISO8601
  escalatedAt?: ISO8601
  escalationReason?: string
}

// DB row shape — matches Drizzle select result
export interface FlowRow {
  id: string
  flowType: FlowType
  triggeredBy: string
  status: FlowStatus
  steps: OrchestratedFlowStep[]
  currentStep: number
  context: Record<string, unknown>
  startedAt: Date
  completedAt: Date | null
  deadline: Date | null
  escalatedAt: Date | null
  escalationReason: string | null
  createdAt: Date
  updatedAt: Date | null // S7 §6.5 — null for pre-migration rows
}

// Auto-escalation constants [SI §3.4]
export const CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD = 3
