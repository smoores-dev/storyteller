import {
  ActionIcon,
  Stack,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"

import { type User } from "@/apiModels"
import { useDeleteUserMutation, useGetCurrentUserQuery } from "@/store/api"

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

  const theme = useComputedColorScheme()
  const color = theme === "dark" ? "white" : "black"

  return (
    <Stack>
      {permissions?.userUpdate && (
        <ActionIcon variant="subtle" color={color} onClick={onEdit}>
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
