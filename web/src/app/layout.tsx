import { Inter, Young_Serif } from "next/font/google"

import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import { proxyRootPath } from "./apiHost"
// import { Header } from "@/components/layout/Header"
import {
  EMPTY_PERMISSIONS as EMPTY_PERMISSIONS,
  UserPermissionsProvider,
} from "@/contexts/UserPermissions"
import { createAuthedApiClient, getCurrentUser } from "@/authedApiClient"
import { AppShell } from "@/components/AppShell"
import { ColorSchemeScript } from "@mantine/core"

import "./globals.css"
import { BookDetail } from "@/apiModels"
import { getCurrentVersion } from "@/versions"
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const version = getCurrentVersion()

  const currentUser = await getCurrentUser()
  const client = await createAuthedApiClient()

  let books: BookDetail[] = []

  try {
    books = await client.listBooks()
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
        <ApiHostContextProvider value={{ rootPath: proxyRootPath }}>
          <UserPermissionsProvider
            value={currentUser?.permissions ?? EMPTY_PERMISSIONS}
          >
            <AppShell version={version} books={books}>
              {children}
            </AppShell>
          </UserPermissionsProvider>
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
