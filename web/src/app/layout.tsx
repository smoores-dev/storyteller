import { Inter, Young_Serif } from "next/font/google"

import { AppShell } from "@/components/AppShell"
import { ColorSchemeScript } from "@mantine/core"

import "./globals.css"
import { getCurrentVersion } from "@/versions"
import StoreProvider from "@/components/StoreProvider"
import { fetchApiRoute } from "./fetchApiRoute"
import { User } from "@/apiModels"
import { Metadata } from "next"
import { CollectionWithRelations } from "@/database/collections"
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

export const metadata: Metadata = {
  title: {
    template: "%s | Storyteller",
    default: "Storyteller",
  },
  description: "A simple tool for syncing audiobooks and ebooks",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const version = getCurrentVersion()
  let currentUser: User | undefined = undefined
  try {
    currentUser = await fetchApiRoute<User | undefined>("/user")
  } catch {
    // pass
  }

  let collections: CollectionWithRelations[] = []
  try {
    collections = await fetchApiRoute<CollectionWithRelations[]>("/collections")
  } catch {
    // pass
  }

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
          <AppShell
            version={version}
            currentUser={currentUser}
            collections={collections}
          >
            {children}
          </AppShell>
        </StoreProvider>
      </body>
    </html>
  )
}
