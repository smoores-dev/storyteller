import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import "./globals.css"
import { Inter } from "next/font/google"
import { rootPath } from "./apiHost"
import { Header } from "@/components/layout/Header"
import { headers } from "next/headers"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Storyteller",
  description: "A simple tool for syncing audiobooks and ebooks",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const origin = headers().get("x-storyteller-origin")!

  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <ApiHostContextProvider value={{ origin, rootPath }}>
          {children}
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
