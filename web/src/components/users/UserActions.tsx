import { User } from "@/apiModels"
import { usePermissions } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { ActionIcon, Stack, Tooltip } from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"

type Props = {
  user: User
  onEdit: () => void
  onUpdate: () => void
}

export function UserActions({ user, onEdit, onUpdate }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <Stack>
      {permissions.user_update && (
        <ActionIcon variant="subtle" color="black" onClick={onEdit}>
          <Tooltip position="right" label="Edit">
            <IconPencil aria-label="Edit" />
          </Tooltip>
        </ActionIcon>
      )}
      {permissions.user_delete && (
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={async () => {
            await client.deleteUser(user.uuid)
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
