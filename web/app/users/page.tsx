import { ApiClient, ApiClientError } from "@/apiClient"
import { Token, User } from "@/apiModels"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost } from "../apiHost"
import styles from "./page.module.css"
import { InviteUserModal } from "@/components/users/InviteUserModal"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const cookieStore = cookies()

  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const client = new ApiClient(apiHost, token.access_token)

  let users: User[] = []

  try {
    users = await client.listUsers()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main className={styles["main"]}>
          <h2>Forbidden</h2>
          <p>You don't have permission to see this page</p>
        </main>
      )
    }

    console.error(e)

    return (
      <main className={styles["main"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main className={styles["main"]}>
      <h2>Your users</h2>
      {users.map((user) => (
        <p key={user.username}>{user.full_name}</p>
      ))}
      <InviteUserModal />
    </main>
  )
}
