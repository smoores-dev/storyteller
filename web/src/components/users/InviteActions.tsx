import { Invite } from "@/apiModels"
import { usePermissions } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { ActionIcon, Stack, Tooltip } from "@mantine/core"
import { IconReload, IconTrash } from "@tabler/icons-react"

type Props = {
  invite: Invite
  onUpdate: () => void
}

export function InviteActions({ invite, onUpdate }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <Stack>
      {permissions.userCreate && (
        <ActionIcon
          variant="subtle"
          color="black"
          onClick={() => {
            void client.resendInvite(invite.inviteKey)
          }}
        >
          <Tooltip position="right" label="Re-send">
            <IconReload aria-label="Re-send" />
          </Tooltip>
        </ActionIcon>
      )}
      {permissions.inviteDelete && (
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={async () => {
            await client.deleteInvite(invite.inviteKey)
            onUpdate()
          }}
        >
          <Tooltip position="right" label="Delete invite">
            <IconTrash aria-label="Delete invite" />
          </Tooltip>{" "}
        </ActionIcon>
      )}
    </Stack>
  )
}
