import { Inter, Young_Serif } from "next/font/google"

import { AppShell } from "@/components/AppShell"
import { ColorSchemeScript } from "@mantine/core"

import "./globals.css"
import { getCurrentVersion } from "@/versions"
import StoreProvider from "@/components/StoreProvider"
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const youngSerif = Young_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-young-serif",
})

export const metadata = {
  title: "Storyteller",
  description: "A simple tool for syncing audiobooks and ebooks",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const version = getCurrentVersion()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={inter.variable + " " + youngSerif.variable}
    >
      <head>
        <ColorSchemeScript />
      </head>
      <body suppressHydrationWarning>
        <StoreProvider>
          <AppShell version={version}>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  )
}
