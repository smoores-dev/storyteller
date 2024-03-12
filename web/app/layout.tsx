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

export const metadata = {
  title: "Storyteller",
  description: "A simple tool for syncing audiobooks and ebooks",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const client = createAuthedApiClient()
  let currentUser: User | undefined = undefined
  try {
    currentUser = await client.getCurrentUser()
  } catch (e) {
    console.error(e)
  }

  console.log(currentUser?.permissions)

  return (
    <html lang="en">
      <body>
        <ApiHostContextProvider value={{ rootPath: proxyRootPath }}>
          <UserPermissionsProvider
            value={currentUser?.permissions ?? EMPTY_PERMISSIONS}
          >
            <div className={styles["container"]}>
              {/* <Header /> */}
              <Sidebar />
              {children}
            </div>
          </UserPermissionsProvider>
        </ApiHostContextProvider>
      </body>
    </html>
  )
}
