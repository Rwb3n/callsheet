import type { Metadata } from "next"
import { TRPCProvider } from "./providers"
import { SiteHeader } from "@/components/layout/header"
import "./globals.css"

export const metadata: Metadata = {
  title: "Callsheet",
  description: "B2B discovery platform for UK broadcast/film/TV production services",
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
