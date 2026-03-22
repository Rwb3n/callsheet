// Search page — CH-CS-014 W6 AC-20 through AC-25
// Client component: search input, facets, results, autocomplete.
// Consumes search.query, search.suggest tRPC procedures.

import { SearchPageContent } from "./search-content"

export const metadata = {
  title: "Search | CALLSHEET",
  description: "Find UK broadcast, film, and TV production service providers",
}

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-7xl px-page py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Find Production Services</h1>
      <SearchPageContent />
    </main>
  )
}
