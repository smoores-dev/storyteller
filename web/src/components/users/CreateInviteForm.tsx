import { usePermission } from "@/contexts/UserPermissions"
import { useApiClient } from "@/hooks/useApiClient"
import { useCallback, useState, MouseEvent } from "react"
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
import { UserPermissionSet } from "@/database/users"

export const ADMIN_PERMISSIONS: Array<keyof UserPermissionSet> = [
  "bookCreate",
  "bookRead",
  "bookProcess",
  "bookDownload",
  "bookList",
  "bookDelete",
  "bookUpdate",
  "inviteList",
  "inviteDelete",
  "userCreate",
  "userList",
  "userRead",
  "userDelete",
  "userUpdate",
  "settingsUpdate",
]

export const BASIC_PERMISSIONS: Array<keyof UserPermissionSet> = [
  "bookRead",
  "bookDownload",
  "bookList",
]

export const PERMISSIONS_VALUES: Array<{
  value: keyof UserPermissionSet
  label: string
}> = [
  { value: "bookCreate", label: "Upload new books" },
  { value: "bookRead", label: "See book info" },
  { value: "bookProcess", label: "Manage book syncing" },
  { value: "bookDownload", label: "Download synced books" },
  { value: "bookList", label: "List all books" },
  { value: "bookDelete", label: "Delete books" },
  { value: "bookUpdate", label: "Change book info" },
  { value: "inviteList", label: "See user invites" },
  { value: "inviteDelete", label: "Delete user invites" },
  { value: "userCreate", label: "Invite new users" },
  { value: "userList", label: "List all users" },
  { value: "userRead", label: "See other users' info" },
  { value: "userDelete", label: "Delete users" },
  { value: "userUpdate", label: "Update other users' permissions" },
  { value: "settingsUpdate", label: "Change server settings" },
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
  const canAddUser = usePermission("userCreate")

  if (!canAddUser) return null

  return (
    <Stack className="mt-8 max-w-[600px] rounded-md bg-gray-200 p-8">
      {showForm ? (
        <form
          onSubmit={form.onSubmit(async ({ email, permissions }) => {
            setState(State.LOADING)
            const permissionsObject = Object.fromEntries(
              permissions.map((permission) => [permission, true]),
            ) as UserPermissionSet
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
