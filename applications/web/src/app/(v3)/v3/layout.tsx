import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import localFont from "next/font/local"
import { cookies, headers } from "next/headers"
import Script from "next/script"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { PiPProvider } from "@v3/_/components/reader/PipProvider"
import { ReaderAudioProvider } from "@v3/_/components/reader/ReaderAudioProvider"
import { TauriTitlebarSync } from "@v3/_/components/tauri-titlebar-sync"
import { ThemeProvider } from "@v3/_/components/theme-provider"
import { Toaster } from "@v3/_/components/ui/sonner"
import {
  BASE_TOOLTIP_DELAY,
  TooltipProvider,
} from "@v3/_/components/ui/tooltip"
import { VersionProvider } from "@v3/_/components/version-context"
import { DocumentTitleProvider } from "@v3/_/hooks/use-document-title"

import { getSetting } from "@/database/settings"
import { env } from "@/env"
import StoreProvider from "@/store/StoreProvider"
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
  const [reqHeaders, cookieStore, t, libraryName] = await Promise.all([
    headers(),
    cookies(),
    getTranslations("Layout"),
    getSetting("libraryName"),
  ])
  const titleTemplate = `%s • ${libraryName || t("title")}`
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
            <ReaderAudioProvider>
              <StoreProvider initialUISettings={initialUISettings}>
                <PiPProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    themes={["light", "dark", "system"]}
                  >
                    <TooltipProvider delay={BASE_TOOLTIP_DELAY}>
                      <NuqsAdapter>
                        <DocumentTitleProvider template={titleTemplate}>
                          {children}
                        </DocumentTitleProvider>
                        <Toaster />
                        <TauriTitlebarSync />
                      </NuqsAdapter>
                    </TooltipProvider>
                  </ThemeProvider>
                </PiPProvider>
              </StoreProvider>
            </ReaderAudioProvider>
          </NextIntlClientProvider>
        </VersionProvider>
      </body>
    </html>
  )
}
