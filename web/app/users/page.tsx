import { ApiClientError } from "@/apiClient"
import { Invite, User } from "@/apiModels"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import { createAuthedApiClient } from "@/authedApiClient"
import { UsersList } from "@/components/users/UsersList"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const client = await createAuthedApiClient()

  let users: User[] = []
  let invites: Invite[] = []

  try {
    users = await client.listUsers()
    invites = await client.listInvites()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main className={styles["content"]}>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    console.error(e)

    return (
      <main className={styles["content"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main>
      <h2 className={styles["heading"]}>Users &amp; Invites</h2>
      <section className={styles["content"]}>
        <UsersList users={users} invites={invites} />
      </section>
    </main>
  )
}
