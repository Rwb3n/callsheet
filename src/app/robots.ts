// Robots.txt — CS-WORK-120 AC-2

import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://callsheet.co.uk"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/admin/", "/login", "/signup"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
