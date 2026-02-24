// Integrity rule types — S1 §6.2

export type IntegrityResult =
  | { action: "allow"; warnings?: string[] }
  | { action: "flag_for_review"; reasons: string[] }
  | { action: "reject"; reasons: string[] }
  | { action: "flag_duplicate"; reasons: string[]; existingListingId: string }
  | { action: "flag_co_director"; reasons: string[]; existingListingId: string; existingAccountId: string | null }

export type TaxonomyTag = {
  sectorId: number
  serviceAreaId: number
  specialisationId?: number | null
}
