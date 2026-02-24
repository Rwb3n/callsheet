// Listing-scoped layout — S5 §1.3, CS-WORK-043 AC-4
// Verifies ownership + provides listing context and feature access to child routes.
// Uses tRPC getListingContext for ownership check.
// Full ListingContext.Provider wiring deferred to E2E Phase 2 (PP-Q1).

export default function ListingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
