import { Invite } from "@/apiModels"
import {
  useDeleteInviteMutation,
  useGetCurrentUserQuery,
  useResendInviteMutation,
} from "@/store/api"
import { ActionIcon, Stack, Tooltip } from "@mantine/core"
import { IconReload, IconTrash } from "@tabler/icons-react"

type Props = {
  invite: Invite
}

export function InviteActions({ invite }: Props) {
  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })

  const [resendInvite] = useResendInviteMutation()
  const [deleteInvite] = useDeleteInviteMutation()

  return (
    <Stack>
      {permissions?.userCreate && (
        <ActionIcon
          variant="subtle"
          color="black"
          onClick={() => {
            void resendInvite({ inviteKey: invite.inviteKey })
          }}
        >
          <Tooltip position="right" label="Re-send">
            <IconReload aria-label="Re-send" />
          </Tooltip>
        </ActionIcon>
      )}
      {permissions?.inviteDelete && (
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={async () => {
            await deleteInvite({ inviteKey: invite.inviteKey })
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
