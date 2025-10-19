import { ColorSchemeScript } from "@mantine/core"
import { type Metadata, type Viewport } from "next"
import { Inter, Young_Serif } from "next/font/google"

import { type User } from "@/apiModels"
import { AppShell } from "@/components/AppShell"
import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { MiniPlayer } from "@/components/reader/MiniPlayer"
import { PiPProvider } from "@/components/reader/PipProvider"
import { type CollectionWithRelations } from "@/database/collections"
import { getCurrentVersion } from "@/versions"

import { fetchApiRoute } from "./fetchApiRoute"
import "./globals.css"

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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

  const hideReader = !process.env["ENABLE_WEB_READER"]

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${youngSerif.variable}`}
    >
      <head>
        <ColorSchemeScript />
        {process.env.NODE_ENV === "development" &&
          process.env["ENABLE_REACT_SCAN"] === "true" && (
            <script
              crossOrigin="anonymous"
              src="//unpkg.com/react-scan/dist/auto.global.js"
            />
          )}
      </head>
      <body className="h-dvh" suppressHydrationWarning>
        <StoreProvider>
          <AudioProviderRedux>
            <PiPProvider>
              <AppShell
                version={version}
                currentUser={currentUser}
                collections={collections}
                demoMode={!!process.env["STORYTELLER_DEMO_MODE"]}
              >
                {children}
                {!hideReader && <MiniPlayer />}
              </AppShell>
            </PiPProvider>
          </AudioProviderRedux>
        </StoreProvider>
      </body>
    </html>
  )
}
