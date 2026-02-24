// Image variant generation — S2 §4.3, AC-39/AC-41/AC-50
// Best-effort: returns null on failure, original preserved.

import sharp from "sharp"
import type { ObjectStorageService } from "@/lib/storage/types"
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/storage/types"
import {
  VARIANT_SIZES,
  VARIANTS,
  variantKey,
  parseOriginalKey,
} from "./naming"
import type { ImageVariants } from "./naming"

export type { ImageVariants }

export type ImageProcessor = (
  originalKey: string,
  storage: ObjectStorageService,
) => Promise<ImageVariants | null>

export const processListingImage: ImageProcessor = async (
  originalKey,
  storage,
) => {
  try {
    const { listingId, imageId } = parseOriginalKey(originalKey)
    const original = await storage.download(originalKey)
    const urls: Record<string, string> = {}

    for (const variant of VARIANTS) {
      const width = VARIANT_SIZES[variant]
      const buf = await sharp(original)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()

      const key = variantKey(listingId, imageId, variant)
      const { url } = await storage.upload({
        key,
        data: buf,
        contentType: "image/webp",
        maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
        access: "public",
      })
      urls[variant] = url!
    }

    return {
      thumbnailUrl: urls.thumbnail,
      cardUrl: urls.card,
      fullUrl: urls.full,
    }
  } catch (err) {
    // AC-50: best-effort — original preserved, error logged
    console.warn(`[image-processing] Variant generation failed for ${originalKey}:`, err)
    return null
  }
}
