import { ColorSchemeScript, MantineProvider } from "@mantine/core"
import { type Metadata, type Viewport } from "next"
import { Inter, Young_Serif } from "next/font/google"

import StoreProvider from "@/components/StoreProvider"
import { AudioProviderRedux } from "@/components/reader/AudioProviderRedux"
import { PiPProvider } from "@/components/reader/PipProvider"
import { theme } from "@/theme/theme"

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
              <MantineProvider theme={theme} defaultColorScheme="light">
                {children}
              </MantineProvider>
            </PiPProvider>
          </AudioProviderRedux>
        </StoreProvider>
      </body>
    </html>
  )
}
