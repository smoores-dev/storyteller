import { ApiClientError } from "@/apiClient"
import { Invite, User } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { UsersList } from "@/components/users/UsersList"
import { logger } from "@/logging"
import { Stack, Title } from "@mantine/core"

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
        <>
          <Title order={2}>Forbidden</Title>
          <p>You don&apos;t have permission to see this page</p>
        </>
      )
    }

    logger.error(e)

    return (
      <>
        <Title order={2}>API is down</Title>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </>
    )
  }

  return (
    <>
      <Title order={2}>Users &amp; Invites</Title>
      <Stack className="mt-4">
        <UsersList users={users} invites={invites} />
      </Stack>
    </>
  )
}
