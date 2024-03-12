"use client"

import { Invite } from "@/apiModels"
import styles from "./invitestatus.module.css"
import { InviteActions } from "./InviteActions"
import { useContext, useLayoutEffect, useState } from "react"
import { ApiHostContext } from "@/contexts/ApiHostContext"

type Props = {
  invite: Invite
  onUpdate: () => void
}

export function InviteStatus({ invite, onUpdate }: Props) {
  const { rootPath } = useContext(ApiHostContext)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  useLayoutEffect(() => {
    const nextInviteUrl = new URL(
      `${rootPath.replace("/api", "")}/invites/${invite.key}`,
      window.location.toString(),
    )
    setInviteUrl(nextInviteUrl.toString())
  }, [invite.key, rootPath])

  return (
    <div className={styles["container"]}>
      <div className={styles["content"]}>
        <h4>{invite.email}</h4>
        {inviteUrl !== null && (
          <>
            Invite link: <a href={inviteUrl}>{inviteUrl}</a>
          </>
        )}
      </div>
      <div className={styles["actions"]}>
        <InviteActions invite={invite} onUpdate={onUpdate} />
      </div>
    </div>
  )
}
