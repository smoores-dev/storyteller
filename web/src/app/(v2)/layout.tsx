import { ColorSchemeScript, MantineProvider } from "@mantine/core"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import Script from "next/script"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { env } from "@/env"
import { theme } from "@/theme/theme"

import "./globals.css"

const inter = localFont({
  src: "../../../public/fonts/Inter-VariableFont_slnt,wght.ttf",
  display: "swap",
  variable: "--font-inter",
})

const youngSerif = localFont({
  src: "../../../public/fonts/YoungSerif.ttf",
  display: "swap",
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
        <ColorSchemeScript defaultColorScheme="auto" />
        {env.NODE_ENV === "development" && env.ENABLE_REACT_SCAN && (
          <Script
            src="//unpkg.com/react-scan/dist/auto.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="h-dvh" suppressHydrationWarning>
        <StoreProvider>
          <AudioProviderRedux>
            <PiPProvider>
              <MantineProvider theme={theme} defaultColorScheme="auto">
                {children}
              </MantineProvider>
            </PiPProvider>
          </AudioProviderRedux>
        </StoreProvider>
      </body>
    </html>
  )
}
