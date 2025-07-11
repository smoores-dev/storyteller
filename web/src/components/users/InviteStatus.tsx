import { Invite } from "@/apiModels"
import { InviteActions } from "./InviteActions"
import { useLayoutEffect, useState } from "react"
import { Box, Group, Paper, Stack, Title } from "@mantine/core"
import Link from "next/link"

type Props = {
  invite: Invite
}

export function InviteStatus({ invite }: Props) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  useLayoutEffect(() => {
    setInviteUrl(
      new URL(
        `/invites/${invite.inviteKey}`,
        window.location.toString(),
      ).toString(),
    )
  }, [invite.inviteKey])

  return (
    <Paper className="max-w-[600px]">
      <Group justify="space-between" wrap="nowrap">
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
        <InviteActions invite={invite} />
      </Group>
    </Paper>
  )
}
