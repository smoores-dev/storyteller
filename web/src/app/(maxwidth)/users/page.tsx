import { UsersList } from "@/components/users/UsersList"
import { Stack, Title } from "@mantine/core"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { Invite, User } from "@/apiModels"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const users = await fetchApiRoute<User[]>("/users")
  const invites = await fetchApiRoute<Invite[]>("/invites")

  return (
    <>
      <Title order={2}>Users &amp; Invites</Title>
      <Stack className="mt-4">
        <UsersList users={users} invites={invites} />
      </Stack>
    </>
  )
}
