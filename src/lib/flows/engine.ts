// Orchestrated flow engine — SI §3.3, S0 §4
// executeOrchestratedFlow(), resumeFlow(), skipStep()

import type {
  FlowType,
  FlowStepDefinition,
  OrchestratedFlowProgress,
  OrchestratedFlowStep,
  FlowRow,
} from "./types"
import { CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD } from "./types"

// DB adapter — injected for testability. Production wires Drizzle queries.
export interface FlowDb {
  insert(row: Omit<FlowRow, "id" | "createdAt" | "updatedAt">): Promise<string>
  update(id: string, fields: Partial<Omit<FlowRow, "id" | "createdAt">>): Promise<void>
  findById(id: string): Promise<FlowRow | null>
}

export interface ExecuteFlowParams<TContext = Record<string, unknown>> {
  flowType: FlowType
  triggeredBy: string
  steps: FlowStepDefinition<TContext>[]
  initialContext: TContext
  deadline?: Date
}

export async function executeOrchestratedFlow<TContext = Record<string, unknown>>(
  db: FlowDb,
  params: ExecuteFlowParams<TContext>,
): Promise<OrchestratedFlowProgress<TContext>> {
  const now = new Date().toISOString()

  const steps: OrchestratedFlowStep[] = params.steps.map((def) => ({
    name: def.name,
    domain: def.domain,
    status: "pending" as const,
    attempt: 0,
    retryable: true, // always true at V1 [SI §3.2]
    skippable: def.skippable,
  }))

  const flowId = await db.insert({
    flowType: params.flowType,
    triggeredBy: params.triggeredBy,
    status: "initiated",
    steps,
    currentStep: 0,
    context: params.initialContext as Record<string, unknown>,
    startedAt: new Date(),
    completedAt: null,
    deadline: params.deadline ?? null,
    escalatedAt: null,
    escalationReason: null,
  })

  return runSteps(db, flowId, params.steps, params.initialContext as Record<string, unknown> & TContext, 0)
}

export async function resumeFlow<TContext = Record<string, unknown>>(
  db: FlowDb,
  flowId: string,
  steps: FlowStepDefinition<TContext>[],
): Promise<OrchestratedFlowProgress<TContext>> {
  const row = await db.findById(flowId)
  if (!row) throw new Error(`Flow not found: ${flowId}`)
  if (row.status !== "failed") throw new Error(`Cannot resume flow in status: ${row.status}`)

  const restoredContext = row.context as TContext
  return runSteps(db, flowId, steps, restoredContext, row.currentStep)
}

// Skips a step and advances currentStep. Caller must call resumeFlow() afterward
// to continue execution — skip alone does not trigger the next step. [SI §3.5]
export async function skipStep(
  db: FlowDb,
  flowId: string,
  stepIndex: number,
  skipReason: string,
  skippedBy: string,
): Promise<void> {
  const row = await db.findById(flowId)
  if (!row) throw new Error(`Flow not found: ${flowId}`)

  const step = row.steps[stepIndex]
  if (!step) throw new Error(`Step index out of bounds: ${stepIndex}`)

  // AC-18: non-skippable step skip attempt throws
  if (!step.skippable) {
    throw new Error(`Step "${step.name}" is not skippable`)
  }

  // AC-19: log reason + admin ID
  const updatedSteps = [...row.steps]
  updatedSteps[stepIndex] = {
    ...step,
    status: "skipped",
    skipReason,
    skippedBy,
  }

  // Advance currentStep past the skipped step
  const nextStep = stepIndex + 1
  await db.update(flowId, {
    steps: updatedSteps,
    currentStep: nextStep,
    status: nextStep >= updatedSteps.length ? "completed" : row.status,
    completedAt: nextStep >= updatedSteps.length ? new Date() : null,
    updatedAt: new Date(),
  })
}

// --- Internal ---

async function runSteps<TContext>(
  db: FlowDb,
  flowId: string,
  stepDefs: FlowStepDefinition<TContext>[],
  context: TContext,
  startFrom: number,
): Promise<OrchestratedFlowProgress<TContext>> {
  let row = (await db.findById(flowId))!

  for (let i = startFrom; i < stepDefs.length; i++) {
    const def = stepDefs[i]
    const updatedSteps = [...row.steps]

    // AC-13: pending → in_progress
    updatedSteps[i] = { ...updatedSteps[i], status: "in_progress", attempt: updatedSteps[i].attempt + 1 }
    await db.update(flowId, { steps: updatedSteps, currentStep: i, status: "in_progress", updatedAt: new Date() })

    try {
      await def.execute(context)

      // AC-13: in_progress → completed
      updatedSteps[i] = { ...updatedSteps[i], status: "completed", completedAt: new Date().toISOString() }
      // AC-16/17: persist context after each step
      await db.update(flowId, { steps: updatedSteps, context: context as Record<string, unknown>, updatedAt: new Date() })
    } catch (err) {
      // AC-14: step failure halts flow; status = failed
      const errorMsg = err instanceof Error ? err.message : String(err)
      updatedSteps[i] = { ...updatedSteps[i], status: "failed", error: errorMsg }

      const consecutiveFailures = updatedSteps[i].attempt
      const shouldEscalate = consecutiveFailures >= CONSECUTIVE_FAILURE_ESCALATION_THRESHOLD

      // AC-20: 3 consecutive failures → auto-escalation
      await db.update(flowId, {
        steps: updatedSteps,
        status: shouldEscalate ? "escalated" : "failed",
        context: context as Record<string, unknown>,
        updatedAt: new Date(),
        ...(shouldEscalate ? {
          escalatedAt: new Date(),
          escalationReason: `Step "${def.name}" failed ${consecutiveFailures} consecutive times: ${errorMsg}`,
        } : {}),
      })

      row = (await db.findById(flowId))!
      return toProgress(row, context)
    }

    row = (await db.findById(flowId))!
  }

  // All steps completed
  await db.update(flowId, { status: "completed", completedAt: new Date(), updatedAt: new Date() })
  row = (await db.findById(flowId))!
  return toProgress(row, context)
}

function toProgress<TContext>(row: FlowRow, context: TContext): OrchestratedFlowProgress<TContext> {
  return {
    flowId: row.id,
    flowType: row.flowType,
    triggeredBy: row.triggeredBy,
    status: row.status,
    steps: row.steps,
    currentStep: row.currentStep,
    context,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    deadline: row.deadline?.toISOString(),
    escalatedAt: row.escalatedAt?.toISOString(),
    escalationReason: row.escalationReason ?? undefined,
  }
}
