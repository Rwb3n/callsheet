// ISR revalidation utilities — SI §7, S0 §8.2
// Wraps Next.js revalidatePath/revalidateTag for event-driven cache invalidation.

type RevalidateFn = (path: string) => Promise<void>

// Default no-op for tests; production injects Next.js revalidatePath
let revalidate: RevalidateFn = async () => {}

export function setRevalidateFn(fn: RevalidateFn): void {
  revalidate = fn
}

export async function revalidateListingProfile(listingSlug: string): Promise<void> {
  await revalidate(`/listing/${listingSlug}`)
}

export async function revalidateSectorLanding(sector: string, location?: string): Promise<void> {
  if (location) {
    await revalidate(`/${sector}/${location}`)
  }
  await revalidate(`/${sector}`)
}

export async function revalidateHomepage(): Promise<void> {
  await revalidate("/")
}
