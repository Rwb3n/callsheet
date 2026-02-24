// Claim evaluation types — S3 §1.2, local to D&L claim domain

type UUID = string

export type ClaimDecision =
  | { action: "auto_approve"; confidence: number; tier: "claimed"; verificationPoints: number }
  | { action: "auto_reject"; confidence: number; reasons: string[] }
  | { action: "queue_manual_review"; confidence: number; reasons: string[] }
  | { action: "queue_dispute_resolution"; confidence: 0; reasons: string[] }
  | { action: "retry"; reasons: string[] }

export type ClaimRequest = {
  listingId: UUID
  accountId: UUID
  companiesHouseNumber?: string
  claimEmail: string
  evidenceUrls: string[]
}
