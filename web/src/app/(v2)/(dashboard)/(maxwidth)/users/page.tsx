import { Stack, Title } from "@mantine/core"
import { type Metadata } from "next"

import { type Invite, type User } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { UsersList } from "@/components/users/UsersList"
import { getSettings } from "@/database/settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Users & Invites",
}

export default async function UsersPage() {
  const users = await fetchApiRoute<User[]>("/users")
  const invites = await fetchApiRoute<Invite[]>("/invites")
  const settings = await getSettings()

  return (
    <>
      <Title order={2}>Users &amp; Invites</Title>
      <Stack className="mt-4">
        <UsersList
          users={users}
          invites={invites}
          disablePasswordLogin={settings.disablePasswordLogin}
        />
      </Stack>
    </>
  )
}
