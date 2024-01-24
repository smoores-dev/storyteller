import Image from "next/image"
import styles from "./header.module.css"
import { ApiClient, ApiClientError } from "@/apiClient"
import { apiHost, rootPath } from "@/app/apiHost"
import { cookies } from "next/headers"
import { Token } from "@/apiModels"

export const dynamice = "force-dynamic"

export async function Header() {
  let canListBooks = false
  let canListUsers = false
  let canUpdateSettings = false

  const cookieStore = cookies()

  const authTokenCookie = cookieStore.get("st_token")
  if (authTokenCookie) {
    const token = JSON.parse(atob(authTokenCookie.value)) as Token
    const client = new ApiClient(apiHost, rootPath, token.access_token)

    try {
      const user = await client.getCurrentUser()
      if (user.permissions.book_list) {
        canListBooks = true
      }
      if (user.permissions.user_list) {
        canListUsers = true
      }
      if (user.permissions.settings_update) {
        canUpdateSettings = true
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.statusCode === 401) {
        // pass
      } else {
        console.error(e)
      }
    }
  }

  return (
    <header className={styles["header"]}>
      <h1 className={styles["heading"]}>
        <Image
          height={80}
          width={80}
          src="/Storyteller_Logo.png"
          alt=""
          aria-hidden={true}
        />
        Storyteller
      </h1>
      <nav>
        <ol className={styles["nav-list"]}>
          {canListBooks && (
            <li>
              <a href="/">Books</a>
            </li>
          )}
          {canListUsers && (
            <li>
              <a href="/users">Users</a>
            </li>
          )}
          {canUpdateSettings && (
            <li>
              <a href="/settings">Settings</a>
            </li>
          )}
        </ol>
      </nav>
    </header>
  )
}
