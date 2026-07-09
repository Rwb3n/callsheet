// Listings index — redirects to dashboard overview (listings are shown there)

import { redirect } from "next/navigation"

export default function ListingsIndex() {
  redirect("/dashboard")
}
