import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import localFont from "next/font/local"
import { cookies, headers } from "next/headers"
import Script from "next/script"
import { NuqsAdapter } from "nuqs/adapters/next"

import { TauriTitlebarSync } from "@v3/_/components/tauri-titlebar-sync"
import { ThemeProvider } from "@v3/_/components/theme-provider"
import { Toaster } from "@v3/_/components/ui/sonner"
import { VersionProvider } from "@v3/_/components/version-context"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { getSetting } from "@/database/settings"
import { env } from "@/env"
import {
  type UISettings,
  UI_SETTINGS_COOKIE_NAME,
} from "@/store/slices/uiSettingsSlice"

import "./globals.css"

const literata = localFont({
  src: [
    {
      path: "../../../fonts/Literata.woff2",
      weight: "200 900",
      style: "normal",
    },
    {
      path: "../../../fonts/Literata-Italic.woff2",
      weight: "200 900",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-literata",
  fallback: ["Georgia", "serif"],
})

const ibmPlexSans = localFont({
  src: [
    {
      path: "../../../fonts/IBMPlexSans.woff2",
      weight: "100 700",
      style: "normal",
    },
    {
      path: "../../../fonts/IBMPlexSans-Italic.woff2",
      weight: "100 700",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-ibm-plex-sans",
  fallback: ["system-ui", "sans-serif"],
})

export async function generateMetadata(): Promise<Metadata> {
  const [t, libraryName] = await Promise.all([
    getTranslations("Layout"),
    getSetting("libraryName"),
  ])
  const title = libraryName || t("title")
  return {
    title: {
      template: `%s • ${title}`,
      default: title,
    },
    description: t("description"),
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export const dynamic = "force-dynamic"

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [reqHeaders, cookieStore] = await Promise.all([headers(), cookies()])
  const isRewritten = reqHeaders.get("x-v3-rewritten") === "1"
  const basePath = isRewritten ? "" : "/v3"

  let initialUISettings: Partial<UISettings> | undefined
  try {
    const raw = cookieStore.get(UI_SETTINGS_COOKIE_NAME)?.value
    if (raw) {
      initialUISettings = JSON.parse(
        decodeURIComponent(raw),
      ) as Partial<UISettings>
    }
  } catch {}

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${literata.variable} ${ibmPlexSans.variable} antialiased`}
    >
      <head>
        {env.NODE_ENV === "development" && env.ENABLE_REACT_SCAN && (
          <Script
            src="//unpkg.com/react-scan/dist/auto.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body suppressHydrationWarning>
        {/* <TweaksPanel /> */}
        <VersionProvider basePath={basePath}>
          <NextIntlClientProvider>
            <StoreProvider initialUISettings={initialUISettings}>
              <AudioProviderRedux>
                <PiPProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    themes={["light", "dark", "system"]}
                  >
                    <NuqsAdapter>
                      {children}
                      <Toaster />
                      <TauriTitlebarSync />
                    </NuqsAdapter>
                  </ThemeProvider>
                </PiPProvider>
              </AudioProviderRedux>
            </StoreProvider>
          </NextIntlClientProvider>
        </VersionProvider>
      </body>
    </html>
  )
}
