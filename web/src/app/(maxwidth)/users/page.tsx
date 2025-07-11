import { UsersList } from "@/components/users/UsersList"
import { Stack, Title } from "@mantine/core"
import { ensurePermission } from "@/app/ensurePermission"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  await ensurePermission("or", "userList", "inviteList")

  return (
    <>
      <Title order={2}>Users &amp; Invites</Title>
      <Stack className="mt-4">
        <UsersList />
      </Stack>
    </>
  )
}
