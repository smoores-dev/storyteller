import { User } from "@/apiModels"
import { useDeleteUserMutation, useGetCurrentUserQuery } from "@/store/api"
import { ActionIcon, Stack, Tooltip } from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"

type Props = {
  user: User
  onEdit: () => void
}

export function UserActions({ user, onEdit }: Props) {
  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })

  const [deleteUser] = useDeleteUserMutation()

  return (
    <Stack>
      {permissions?.userUpdate && (
        <ActionIcon variant="subtle" color="black" onClick={onEdit}>
          <Tooltip position="right" label="Edit">
            <IconPencil aria-label="Edit" />
          </Tooltip>
        </ActionIcon>
      )}
      {permissions?.userDelete && (
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={async () => {
            await deleteUser({ uuid: user.id })
          }}
        >
          <Tooltip position="right" label="Delete user">
            <IconTrash aria-label="Delete user" />
          </Tooltip>{" "}
        </ActionIcon>
      )}
    </Stack>
  )
}
