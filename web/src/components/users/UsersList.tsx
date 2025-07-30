"use client"

import { UserStatus } from "./UserStatus"
import { InviteStatus } from "./InviteStatus"
import { CreateInviteForm } from "./CreateInviteForm"
import { List, Title } from "@mantine/core"
import {
  api,
  useGetCurrentUserQuery,
  useListInvitesQuery,
  useListUsersQuery,
} from "@/store/api"
import { Invite, User } from "@/apiModels"
import { useInitialData } from "@/hooks/useInitialData"

interface Props {
  users: User[]
  invites: Invite[]
}

export function UsersList({
  users: initialUsers,
  invites: initialInvites,
}: Props) {
  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })

  useInitialData(
    api.util.upsertQueryData("listInvites", undefined, initialInvites),
  )
  useInitialData(api.util.upsertQueryData("listUsers", undefined, initialUsers))

  const { data: invites } = useListInvitesQuery()
  const { data: users } = useListUsersQuery()

  return (
    <>
      {permissions?.inviteList && (
        <>
          <Title order={3}>Invites</Title>
          <CreateInviteForm />
          <List type="ordered" listStyleType="none">
            {invites?.map((invite) => (
              <List.Item
                key={invite.inviteKey}
                classNames={{ itemWrapper: "block" }}
              >
                <InviteStatus invite={invite} />
              </List.Item>
            ))}
          </List>
        </>
      )}
      {permissions?.userList && (
        <>
          <Title order={3}>Users</Title>
          <List type="ordered" listStyleType="none">
            {users?.map((user) => (
              <List.Item key={user.id} classNames={{ itemWrapper: "block" }}>
                <UserStatus user={user} />
              </List.Item>
            ))}
          </List>
        </>
      )}
    </>
  )
}
