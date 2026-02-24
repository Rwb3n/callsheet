// Deterministic image variant naming — S2 §4.3, AC-40
// Variant URLs are derived from the original key. No DB columns needed.

export const VARIANT_SIZES = {
  thumbnail: 150,
  card: 400,
  full: 1200,
} as const

export type Variant = keyof typeof VARIANT_SIZES

export type ImageVariants = {
  thumbnailUrl: string
  cardUrl: string
  fullUrl: string
}

const VARIANTS: Variant[] = ["thumbnail", "card", "full"]

export { VARIANTS }

export function variantKey(
  listingId: string,
  imageId: string,
  variant: Variant,
): string {
  return `listings/${listingId}/images/${imageId}_${variant}.webp`
}

export function parseOriginalKey(key: string): {
  listingId: string
  imageId: string
  ext: string
} {
  // Format: listings/{listingId}/images/{imageId}.{ext}
  const match = key.match(
    /^listings\/([^/]+)\/images\/([^._]+)\.(\w+)$/,
  )
  if (!match) throw new Error(`Invalid original key format: ${key}`)
  return { listingId: match[1], imageId: match[2], ext: match[3] }
}
