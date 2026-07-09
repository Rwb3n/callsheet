import type { Metadata } from "next"
import { TRPCProvider } from "./providers"
import { SiteHeader } from "@/components/layout/header"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Callsheet — UK Production Services Directory",
    template: "%s | Callsheet",
  },
  description: "Find and connect with verified broadcast, film and TV production service providers across the UK.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://callsheet.co.uk"),
  openGraph: {
    type: "website",
    siteName: "Callsheet",
    title: "Callsheet — UK Production Services Directory",
    description: "Find and connect with verified broadcast, film and TV production service providers across the UK.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <SiteHeader />
          <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
        </TRPCProvider>
      </body>
    </html>
  )
}
