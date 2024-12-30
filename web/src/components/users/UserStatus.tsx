import { User, UserPermissions } from "@/apiModels"
import { UserActions } from "./UserActions"
import {
  Box,
  Button,
  Group,
  MultiSelect,
  Paper,
  Stack,
  Title,
} from "@mantine/core"
import { useState } from "react"
import {
  ADMIN_PERMISSIONS,
  BASIC_PERMISSIONS,
  PERMISSIONS_VALUES,
} from "./CreateInviteForm"
import { useForm } from "@mantine/form"
import { useApiClient } from "@/hooks/useApiClient"

type Props = {
  user: User
  onUpdate: () => void
}

export function UserStatus({ user, onUpdate }: Props) {
  const client = useApiClient()
  const [showPermissions, setShowPermissions] = useState(false)

  const form = useForm({
    initialValues: {
      permissions: Object.entries(user.permissions)
        .filter(([, value]) => value)
        .map(([perm]) => perm),
    },
  })

  return (
    <Paper className="max-w-[600px]">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Title order={4}>{user.full_name}</Title>
          <div>{user.username}</div>
          <div>{user.email}</div>
        </Stack>
        <UserActions
          user={user}
          onEdit={() => {
            setShowPermissions(true)
          }}
          onUpdate={onUpdate}
        />
      </Group>
      {showPermissions && (
        <form
          onSubmit={form.onSubmit(async (values) => {
            setShowPermissions(false)
            const permissionsObject = Object.fromEntries(
              values.permissions.map((permission) => [permission, true]),
            ) as UserPermissions
            await client.updateUser(user.uuid, permissionsObject)
          })}
        >
          <Box className="self-end">
            <Button
              variant="subtle"
              onClick={() => {
                form.setFieldValue("permissions", ADMIN_PERMISSIONS)
              }}
            >
              Admin
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                form.setFieldValue("permissions", BASIC_PERMISSIONS)
              }}
            >
              Basic
            </Button>
          </Box>
          <MultiSelect
            label="Permissions"
            className="mb-4"
            data={PERMISSIONS_VALUES}
            {...form.getInputProps("permissions")}
          />
          <Button type="submit">Save</Button>
        </form>
      )}
    </Paper>
  )
}
