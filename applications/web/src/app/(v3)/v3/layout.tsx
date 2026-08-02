import type { Metadata, Viewport } from "next"
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google"
import { cookies, headers } from "next/headers"
import Script from "next/script"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import { NuqsAdapter } from "nuqs/adapters/next"

import { TauriTitlebarSync } from "@v3/_/components/tauri-titlebar-sync"
import { ThemeProvider } from "@v3/_/components/theme-provider"
import { Toaster } from "@v3/_/components/ui/sonner"
import { VersionProvider } from "@v3/_/components/version-context"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { env } from "@/env"
import {
  type UISettings,
  UI_SETTINGS_COOKIE_NAME,
} from "@/store/slices/uiSettingsSlice"

import "./globals.css"

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  style: ["normal", "italic"],
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
})

const trySerif = IBM_Plex_Serif({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  weight: ["400", "500", "700"],
  variable: "--font-try-serif",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Layout")
  return {
    title: {
      template: `%s • ${t("title")}`,
      default: t("title"),
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
  } catch {
    // invalid cookie, fall through to defaults
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${ibmPlexSans.variable} ${trySerif.variable} antialiased`}
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
                    // forcedTheme={initialUISettings?.theme ?? "system"}
                    // disableTransitionOnChange
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
