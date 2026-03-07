// Funnel friction ratio computation — S9 §4.3, AC-77/78
// Extracted pure logic for testability. Used by conversion_funnel_analysis ceremony handler.

export type GateConversionAttribution = {
  gate: string
  conversions: number
  complaints: number
  frictionRatio: number
}

export const FUNNEL_SPEC = {
  FRICTION_RATIO_ESCALATION: 5.0,
}

export function computeFrictionRatios(
  frictionGates: { gateName: string; ticketCount: number }[],
  triggerStats: { triggerType: string; fired: number }[],
): GateConversionAttribution[] {
  const ratios: GateConversionAttribution[] = []

  for (const gate of frictionGates) {
    const triggerMatch = triggerStats.find(t => t.triggerType === gate.gateName)
    const conversions = triggerMatch?.fired ?? 0
    const complaints = gate.ticketCount

    const frictionRatio = conversions > 0
      ? complaints / conversions
      : complaints > 0 ? Infinity : 0

    ratios.push({ gate: gate.gateName, conversions, complaints, frictionRatio })
  }

  return ratios
}

export function findEscalationGates(ratios: GateConversionAttribution[]): GateConversionAttribution[] {
  return ratios.filter(r => r.frictionRatio > FUNNEL_SPEC.FRICTION_RATIO_ESCALATION)
}
