"use client"

import styles from "./userslist.module.css"
import { Invite, User } from "@/apiModels"
import { UserStatus } from "./UserStatus"
import { useApiClient } from "@/hooks/useApiClient"
import { usePermissions } from "@/contexts/UserPermissions"
import { useCallback, useState } from "react"
import { InviteStatus } from "./InviteStatus"
import { CreateInviteForm } from "./CreateInviteForm"

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
    client.listUsers().then((users) => setUsers(users))
  }, [client])

  const refreshInvites = useCallback(() => {
    client.listInvites().then((invites) => setInvites(invites))
  }, [client])

  return (
    <>
      {permissions.invite_list && (
        <>
          <h3>Invites</h3>
          <CreateInviteForm onUpdate={refreshInvites} />
          <ol className={styles["list"]}>
            {invites.map((invite) => (
              <li key={invite.key}>
                <InviteStatus invite={invite} onUpdate={refreshInvites} />
              </li>
            ))}
          </ol>
        </>
      )}
      {permissions.user_list && (
        <>
          <h3>Users</h3>
          <ol className={styles["list"]}>
            {users.map((user) => (
              <li key={user.uuid}>
                <UserStatus user={user} onUpdate={refreshUsers} />
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
