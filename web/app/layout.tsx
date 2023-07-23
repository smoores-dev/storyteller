import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import "./globals.css"
import { Inter } from "next/font/google"
import { apiHost } from "./apiHost"

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
  return (
    <html lang="en">
      <body className={inter.className}>
        <header>
          <h1>Storyteller</h1>
        </header>
        <ApiHostContextProvider value={apiHost}>
          {children}
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
