import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import Script from "next/script"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import { NuqsAdapter } from "nuqs/adapters/next"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { env } from "@/env"

import { ThemeProvider } from "@v3/_/components/theme-provider"
import { Toaster } from "@v3/_/components/ui/sonner"

import "./globals.css"

const inter = localFont({
  src: "../../../../public/fonts/Inter-VariableFont_slnt,wght.ttf",
  display: "swap",
  variable: "--font-inter",
})

const youngSerif = localFont({
  src: "../../../../public/fonts/YoungSerif.ttf",
  display: "swap",
  variable: "--font-young-serif",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Layout")
  return {
    title: {
      template: `%s | ${t("title")}`,
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${youngSerif.variable}`}
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
        {!env.ENABLE_V3_FRONTEND ? (
          <div>V3 frontend is not enabled</div>
        ) : (
          <NextIntlClientProvider>
            <StoreProvider>
              <AudioProviderRedux>
                <PiPProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                  >
                    <NuqsAdapter>
                      {children}
                      <Toaster />
                    </NuqsAdapter>
                  </ThemeProvider>
                </PiPProvider>
              </AudioProviderRedux>
            </StoreProvider>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  )
}
