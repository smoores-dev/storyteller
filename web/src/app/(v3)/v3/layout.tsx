import type { Metadata, Viewport } from "next"
import { Inter, Young_Serif } from "next/font/google"
import Script from "next/script"
import { NuqsAdapter } from "nuqs/adapters/next"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { env } from "@/env"

import { ThemeProvider } from "@v3/_/components/theme-provider"

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
      <body className="h-dvh" suppressHydrationWarning>
        {!env.ENABLE_V3_FRONTEND ? (
          <div>V3 frontend is not enabled</div>
        ) : (
          <StoreProvider>
            <AudioProviderRedux>
              <PiPProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem
                  disableTransitionOnChange
                >
                  <NuqsAdapter>{children}</NuqsAdapter>
                </ThemeProvider>
              </PiPProvider>
            </AudioProviderRedux>
          </StoreProvider>
        )}
      </body>
    </html>
  )
}
