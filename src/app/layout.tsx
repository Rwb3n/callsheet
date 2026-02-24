import type { Metadata } from "next"
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
      <body>{children}</body>
    </html>
  )
}
