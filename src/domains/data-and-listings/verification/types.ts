// Verification upgrade types — S3 §7.1

import type { TaskSpec } from "@/domains/operations/types"

export type UpgradeDecision =
  | { eligible: true; newTier: "verified"; score: number }
  | { eligible: "pending_human_review"; taskSpec: TaskSpec }
  | { eligible: false; score: number; threshold: number; guidance: string[] }
