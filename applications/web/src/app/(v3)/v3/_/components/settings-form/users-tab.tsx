"use client"

import Link from "next/link"
import { useCallback, useLayoutEffect, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Invite, type User } from "@/apiModels"
import { type UserPermissionSet } from "@/database/users"
import { useInitialData } from "@/hooks/useInitialData"
import * as icon from "@/icons"
import {
  api,
  useCreateInviteMutation,
  useDeleteInviteMutation,
  useDeleteUserMutation,
  useGetCurrentUserQuery,
  useListInvitesQuery,
  useListUsersQuery,
  useResendInviteMutation,
  useUpdateUserMutation,
} from "@/store/api"

import { SettingsSection } from "./shared"

type Permission = keyof UserPermissionSet

const ADMIN_PERMISSIONS: Permission[] = [
  "bookCreate",
  "bookRead",
  "bookProcess",
  "bookDownload",
  "bookList",
  "bookDelete",
  "bookUpdate",
  "collectionCreate",
  "inviteList",
  "inviteDelete",
  "userCreate",
  "userList",
  "userRead",
  "userDelete",
  "userUpdate",
  "settingsUpdate",
]

const BASIC_PERMISSIONS: Permission[] = ["bookRead", "bookDownload", "bookList"]

export function UsersTab({
  initialUsers,
  initialInvites,
  disablePasswordLogin,
}: {
  initialUsers: User[]
  initialInvites: Invite[]
  disablePasswordLogin: boolean
}) {
  useInitialData(
    api.util.upsertQueryData("listInvites", undefined, initialInvites),
  )
  useInitialData(api.util.upsertQueryData("listUsers", undefined, initialUsers))

  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })

  const { data: invites } = useListInvitesQuery()
  const { data: users } = useListUsersQuery()

  const t = useTranslation("SettingsPage.tabs.users")

  return (
    <div className="space-y-6">
      <SettingsSection tab="users" section="users-invites">
        {permissions?.inviteList && (
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.users-invites.title")}</CardTitle>
              <CardDescription>
                {t("sections.users-invites.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CreateInviteSection
                disablePasswordLogin={disablePasswordLogin}
              />

              {invites?.map((invite) => (
                <InviteRow key={invite.inviteKey} invite={invite} />
              ))}
            </CardContent>
          </Card>
        )}
      </SettingsSection>
      <SettingsSection tab="users" section="users-list">
        {permissions?.userList && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <icon.Users className="h-5 w-5" />
                {t("sections.users-list.title")}
              </CardTitle>
              <CardDescription>
                {t("sections.users-list.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {users?.map((user) => <UserRow key={user.id} user={user} />)}
            </CardContent>
          </Card>
        )}
      </SettingsSection>
    </div>
  )
}

function InviteRow({ invite }: { invite: Invite }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [resendInvite, { isLoading: isResending }] = useResendInviteMutation()
  const [deleteInvite, { isLoading: isDeleting }] = useDeleteInviteMutation()

  const { permissions } = useGetCurrentUserQuery(undefined, {
    selectFromResult: (result) => ({
      permissions: result.data?.permissions,
    }),
  })

  useLayoutEffect(() => {
    setInviteUrl(
      new URL(
        `/invites/${invite.inviteKey}`,
        window.location.toString(),
      ).toString(),
    )
  }, [invite.inviteKey])

  return (
    <div className="bg-muted/30 flex items-center justify-between gap-4 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{invite.email}</p>
        {inviteUrl && (
          <Link
            href={inviteUrl}
            className="text-muted-foreground truncate text-xs hover:underline"
          >
            {inviteUrl}
          </Link>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {permissions?.userCreate && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isResending}
            onClick={() => {
              void resendInvite({ inviteKey: invite.inviteKey })
            }}
          >
            {isResending ? <Spinner /> : <icon.Refresh className="h-4 w-4" />}
          </Button>
        )}

        {permissions?.inviteDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            disabled={isDeleting}
            onClick={() => {
              void deleteInvite({ inviteKey: invite.inviteKey })
            }}
          >
            {isDeleting ? <Spinner /> : <icon.Trash className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}

function UserRow({ user }: { user: User }) {
  const [showPermissions, setShowPermissions] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>(() =>
    Object.entries(user.permissions ?? {})
      .filter(([, value]) => value)
      .map(([perm]) => perm as Permission),
  )

  const [updateUser, { isLoading }] = useUpdateUserMutation()
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation()

  const { permissions: currentUserPermissions } = useGetCurrentUserQuery(
    undefined,
    {
      selectFromResult: (result) => ({
        permissions: result.data?.permissions,
      }),
    },
  )

  const handleSave = useCallback(async () => {
    const permissionsObject = Object.fromEntries(
      permissions.map((permission) => [permission, true]),
    ) as UserPermissionSet

    await updateUser({ uuid: user.id, permissions: permissionsObject })
    setShowPermissions(false)
  }, [permissions, updateUser, user.id])

  const tPermissions = useTranslation("SettingsPage.tabs.users.permissions")

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {user.username}
            {user.email && ` — ${user.email}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {currentUserPermissions?.userUpdate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowPermissions(!showPermissions)
              }}
            >
              {showPermissions ? "Cancel" : "Edit"}
            </Button>
          )}

          {currentUserPermissions?.userDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              disabled={isDeleting}
              onClick={() => {
                void deleteUser({ uuid: user.id })
              }}
            >
              {isDeleting ? <Spinner /> : <icon.Trash className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {showPermissions && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setPermissions([...ADMIN_PERMISSIONS])
              }}
            >
              {tPermissions("admin")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setPermissions([...BASIC_PERMISSIONS])
              }}
            >
              {tPermissions("basic")}
            </Button>
          </div>

          <FieldSet>
            <div className="grid gap-2 sm:grid-cols-2">
              {ADMIN_PERMISSIONS.map((option) => {
                const checked = permissions.includes(option)
                return (
                  <Field
                    key={option}
                    orientation="horizontal"
                    className="items-center"
                  >
                    <Checkbox
                      id={`user-${user.id}-${option}`}
                      checked={checked}
                      onCheckedChange={() => {
                        setPermissions((prev) =>
                          checked
                            ? prev.filter((p) => p !== option)
                            : [...prev, option],
                        )
                      }}
                    />
                    <FieldLabel htmlFor={`user-${user.id}-${option}`}>
                      {tPermissions(option)}
                    </FieldLabel>
                  </Field>
                )
              })}
            </div>
          </FieldSet>

          <Button
            type="button"
            size="sm"
            disabled={isLoading}
            onClick={() => {
              void handleSave()
            }}
          >
            {isLoading && <Spinner />}
            {tPermissions("save")}
          </Button>
        </div>
      )}
    </div>
  )
}

function CreateInviteSection({
  disablePasswordLogin,
}: {
  disablePasswordLogin: boolean
}) {
  const t = useTranslation("SettingsPage.tabs.users.sections.users-invites")
  const tPermissions = useTranslation("SettingsPage.tabs.users.permissions")
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState("")
  const [permissions, setPermissions] = useState<Permission[]>([
    ...BASIC_PERMISSIONS,
  ])

  const { permissions: currentUserPermissions } = useGetCurrentUserQuery(
    undefined,
    {
      selectFromResult: (result) => ({
        permissions: result.data?.permissions,
      }),
    },
  )

  const [createInvite, { isLoading, isSuccess, isError, reset }] =
    useCreateInviteMutation()

  const handleSubmit = useCallback(async () => {
    const permissionsObject = Object.fromEntries(
      permissions.map((permission) => [permission, true]),
    ) as UserPermissionSet

    await createInvite({ email, ...permissionsObject })
  }, [createInvite, email, permissions])

  const handleReset = useCallback(() => {
    setEmail("")
    setPermissions([...BASIC_PERMISSIONS])
    reset()
  }, [reset])

  if (!currentUserPermissions?.userCreate) {
    return null
  }

  if (disablePasswordLogin && !showForm) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("enablePasswordLogin")}
      </p>
    )
  }

  if (!showForm) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setShowForm(true)
        }}
      >
        <icon.Add className="mr-2 h-4 w-4" />
        {t("inviteUser")}
      </Button>
    )
  }

  if (isSuccess) {
    return (
      <div className="bg-muted/30 flex items-center justify-between rounded-md border p-3">
        <p className="text-sm">{t("inviteSent")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            handleReset()
          }}
        >
          {t("inviteAnother")}
        </Button>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-destructive/10 flex items-center justify-between rounded-md border p-3">
        <p className="text-destructive text-sm">
          {t("inviteFailedDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            handleReset()
          }}
        >
          {t("inviteFailedButton")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <Field>
        <FieldLabel>{t("email")}</FieldLabel>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          placeholder="user@example.com"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            setPermissions([...ADMIN_PERMISSIONS])
          }}
        >
          {tPermissions("admin")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            setPermissions([...BASIC_PERMISSIONS])
          }}
        >
          {tPermissions("basic")}
        </Button>
      </div>

      <FieldSet>
        <FieldLabel>Permissions</FieldLabel>
        <FieldGroup>
          <div className="grid gap-2 sm:grid-cols-2">
            {ADMIN_PERMISSIONS.map((option) => {
              const checked = permissions.includes(option)
              return (
                <Field
                  key={option}
                  orientation="horizontal"
                  className="items-center"
                >
                  <Checkbox
                    id={`invite-${option}`}
                    checked={checked}
                    onCheckedChange={() => {
                      setPermissions((prev) =>
                        checked
                          ? prev.filter((p) => p !== option)
                          : [...prev, option],
                      )
                    }}
                  />
                  <FieldLabel htmlFor={`invite-${option}`}>
                    {tPermissions(option)}
                  </FieldLabel>
                </Field>
              )
            })}
          </div>
        </FieldGroup>
      </FieldSet>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!email || isLoading}
          onClick={() => {
            void handleSubmit()
          }}
        >
          {isLoading && <Spinner />}
          {t("createInvite")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowForm(false)
            handleReset()
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
