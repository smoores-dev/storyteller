import { usePermission } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { useCallback, useState, MouseEvent } from "react"
import { UserPermissions } from "@/apiModels"
import { useForm } from "@mantine/form"
import {
  Stack,
  TextInput,
  Button,
  MultiSelect,
  Box,
  Text,
  Group,
} from "@mantine/core"

export const ADMIN_PERMISSIONS: Array<keyof UserPermissions> = [
  "book_create",
  "book_read",
  "book_process",
  "book_download",
  "book_list",
  "book_delete",
  "book_update",
  "invite_list",
  "invite_delete",
  "user_create",
  "user_list",
  "user_read",
  "user_delete",
  "user_update",
  "settings_update",
]

export const BASIC_PERMISSIONS: Array<keyof UserPermissions> = [
  "book_read",
  "book_download",
  "book_list",
]

export const PERMISSIONS_VALUES: Array<{
  value: keyof UserPermissions
  label: string
}> = [
  { value: "book_create", label: "Upload new books" },
  { value: "book_read", label: "See book info" },
  { value: "book_process", label: "Manage book syncing" },
  { value: "book_download", label: "Download synced books" },
  { value: "book_list", label: "List all books" },
  { value: "book_delete", label: "Delete books" },
  { value: "book_update", label: "Change book info" },
  { value: "invite_list", label: "See user invites" },
  { value: "invite_delete", label: "Delete user invites" },
  { value: "user_create", label: "Invite new users" },
  { value: "user_list", label: "List all users" },
  { value: "user_read", label: "See other users' info" },
  { value: "user_delete", label: "Delete users" },
  { value: "user_update", label: "Update other users' permissions" },
  { value: "settings_update", label: "Change server settings" },
]

enum State {
  CLEAN = "CLEAN",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

type Props = {
  onUpdate: () => void
}

export function CreateInviteForm({ onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false)

  const form = useForm({
    initialValues: {
      email: "",
      permissions: BASIC_PERMISSIONS,
    },
  })

  const [state, setState] = useState(State.CLEAN)

  const resetState = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      setShowForm(true)
      form.reset()
    },
    [form],
  )

  const client = useApiClient()
  const canAddUser = usePermission("user_create")

  if (!canAddUser) return null

  return (
    <Stack className="mt-8 max-w-[600px] rounded-md bg-gray-200 p-8">
      {showForm ? (
        <form
          onSubmit={form.onSubmit(async ({ email, permissions }) => {
            setState(State.LOADING)
            const permissionsObject = Object.fromEntries(
              permissions.map((permission) => [permission, true]),
            ) as UserPermissions
            try {
              await client.createInvite({ email, ...permissionsObject })
            } catch (e) {
              console.error(e)
              setState(State.ERROR)
              onUpdate()
              return
            }

            setState(State.SUCCESS)
            onUpdate()
          })}
        >
          <Stack gap={0}>
            <TextInput label="Email" {...form.getInputProps("email")} />
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
            {state === State.SUCCESS ? (
              <Group justify="space-between">
                <Text>Done!</Text>
                <Button type="reset" onClick={resetState}>
                  Invite another user
                </Button>
              </Group>
            ) : state === State.ERROR ? (
              <Group justify="space-between">
                <Text>Failed - check your server logs for more details</Text>
                <Button type="reset" onClick={resetState}>
                  Try again
                </Button>
              </Group>
            ) : (
              <Button
                type="submit"
                className="self-end"
                disabled={
                  form.getValues().email === "" || state !== State.CLEAN
                }
              >
                Create
              </Button>
            )}
          </Stack>
        </form>
      ) : (
        <Button
          className="self-center"
          variant="white"
          onClick={() => {
            setShowForm(true)
          }}
        >
          + Invite user
        </Button>
      )}
    </Stack>
  )
}
