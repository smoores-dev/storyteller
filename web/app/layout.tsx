import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import "./globals.css"
import { proxyRootPath } from "./apiHost"
// import { Header } from "@/components/layout/Header"
import styles from "./layout.module.css"
import { Sidebar } from "@/components/layout/Sidebar"

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
      <body>
        <ApiHostContextProvider value={{ rootPath: proxyRootPath }}>
          <div className={styles.container}>
            {/* <Header /> */}
            <Sidebar />
            {children}
          </div>
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
