import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import "./globals.css"
import { Inter } from "next/font/google"
import { publicApiHost } from "./apiHost"
import { Header } from "@/components/layout/Header"

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
        <Header />
        <ApiHostContextProvider value={publicApiHost}>
          {children}
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
