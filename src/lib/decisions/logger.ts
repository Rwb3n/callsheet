// Decision logging — SI §9, S0 §10
// logDecision() persists structured decision records; queryable by domain + type.

type UUID = string
type Domain = "data-and-listings" | "operations" | "platform" | "commercial"

export interface LogDecisionParams {
  domain: Domain
  decisionType: string
  inputs: Record<string, unknown>
  output: Record<string, unknown>
  confidence?: number // 0–1
  listingId?: UUID
  accountId?: UUID
  additionalContext?: Record<string, string>
}

// DB adapter — injected for testability
export interface DecisionLogDb {
  insert(row: {
    domain: Domain
    decisionType: string
    inputs: Record<string, unknown>
    output: Record<string, unknown>
    confidence: number | null
    listingId: string | null
    accountId: string | null
    additionalContext: Record<string, string> | null
  }): Promise<string>
  findByDomainAndType(domain: Domain, decisionType: string): Promise<Array<{ id: string; domain: Domain; decisionType: string }>>
}

// Confidence stored as 0–100 integer in DB; API accepts 0–1 float [SI §9.1]
export async function logDecision(
  db: DecisionLogDb,
  params: LogDecisionParams,
): Promise<string> {
  return db.insert({
    domain: params.domain,
    decisionType: params.decisionType,
    inputs: params.inputs,
    output: params.output,
    confidence: params.confidence != null ? Math.round(params.confidence * 100) : null,
    listingId: params.listingId ?? null,
    accountId: params.accountId ?? null,
    additionalContext: params.additionalContext ?? null,
  })
}
