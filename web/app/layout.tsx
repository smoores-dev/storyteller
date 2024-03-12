import { ApiHostContextProvider } from "@/contexts/ApiHostContext"
import "./globals.css"
import { proxyRootPath } from "./apiHost"
// import { Header } from "@/components/layout/Header"
import styles from "./layout.module.css"
import { Sidebar } from "@/components/layout/Sidebar"
import {
  EMPTY_PERMISSIONS as EMPTY_PERMISSIONS,
  UserPermissionsProvider,
} from "@/contexts/UserPermissions"
import { createAuthedApiClient } from "@/authedApiClient"
import { User } from "@/apiModels"
import { Header } from "@/components/layout/Header"

export const metadata = {
  title: "Storyteller",
  description: "A simple tool for syncing audiobooks and ebooks",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let currentUser: User | undefined = undefined
  try {
    const client = createAuthedApiClient()
    currentUser = await client.getCurrentUser()
  } catch (e) {
    console.error(e)
  }

  return (
    <html lang="en">
      <body>
        <ApiHostContextProvider value={{ rootPath: proxyRootPath }}>
          <UserPermissionsProvider
            value={currentUser?.permissions ?? EMPTY_PERMISSIONS}
          >
            <Header />
            <div className={styles["container"]}>
              <Sidebar className={styles["sidebar"]} />
              {children}
            </div>
          </UserPermissionsProvider>
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
