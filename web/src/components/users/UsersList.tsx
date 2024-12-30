"use client"

import { Invite, User } from "@/apiModels"
import { UserStatus } from "./UserStatus"
import { useApiClient } from "@/hooks/useApiClient"
import { usePermissions } from "@/contexts/UserPermissions"
import { useCallback, useState } from "react"
import { InviteStatus } from "./InviteStatus"
import { CreateInviteForm } from "./CreateInviteForm"
import { List, Title } from "@mantine/core"

type Props = {
  users: User[]
  invites: Invite[]
}

export function UsersList({
  users: initialUsers,
  invites: initialInvites,
}: Props) {
  const client = useApiClient()
  const permissions = usePermissions()
  const [users, setUsers] = useState(initialUsers)
  const [invites, setInvites] = useState(initialInvites)

  const refreshUsers = useCallback(() => {
    void client.listUsers().then((users) => {
      setUsers(users)
    })
  }, [client])

  const refreshInvites = useCallback(() => {
    void client.listInvites().then((invites) => {
      setInvites(invites)
    })
  }, [client])

  return (
    <>
      {permissions.invite_list && (
        <>
          <Title order={3}>Invites</Title>
          <CreateInviteForm onUpdate={refreshInvites} />
          <List type="ordered" listStyleType="none">
            {invites.map((invite) => (
              <List.Item key={invite.key} classNames={{ itemWrapper: "block" }}>
                <InviteStatus invite={invite} onUpdate={refreshInvites} />
              </List.Item>
            ))}
          </List>
        </>
      )}
      {permissions.user_list && (
        <>
          <Title order={3}>Users</Title>
          <List type="ordered" listStyleType="none">
            {users.map((user) => (
              <List.Item key={user.uuid} classNames={{ itemWrapper: "block" }}>
                <UserStatus user={user} onUpdate={refreshUsers} />
              </List.Item>
            ))}
          </List>
        </>
      )}
    </>
  )
}
