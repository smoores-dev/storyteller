import { Invite } from "@/apiModels"
import { InviteActions } from "./InviteActions"
import { useContext, useLayoutEffect, useState } from "react"
import { ApiHostContext } from "@/contexts/ApiHostContext"
import { Box, Group, Paper, Stack, Title } from "@mantine/core"
import Link from "next/link"

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
    <Paper className="max-w-[600px]">
      <Group justify="space-between">
        <Stack>
          <Title order={4}>{invite.email}</Title>
          {inviteUrl !== null && (
            <Box>
              Invite link:{" "}
              <Link href={inviteUrl} className="text-st-orange-600 underline">
                {inviteUrl}
              </Link>
            </Box>
          )}
        </Stack>
        <InviteActions invite={invite} onUpdate={onUpdate} />
      </Group>
    </Paper>
  )
}
