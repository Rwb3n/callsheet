// Shortlist summary — S6 §6.3, CS-WORK-055 AC-39

import { ShortlistsContent } from "./shortlists-content"

export default function ShortlistsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Your Shortlists</h1>
      <ShortlistsContent />
    </div>
  )
}
