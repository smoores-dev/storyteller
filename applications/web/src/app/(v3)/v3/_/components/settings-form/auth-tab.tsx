"use client"

import {
  Controller,
  type FieldError as FormFieldError,
  useFieldArray,
  useWatch,
} from "react-hook-form"

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { Providers } from "@/auth/providers"
import { cn } from "@/cn"
import { FallbackIcon, ProviderIcons } from "@/components/icons/ProviderIcons"
import type { UserPermissionSet } from "@/database/users"
import * as icon from "@/icons"

import { LockTooltip, useSettingsForm } from "./SettingsFormProvider"
import { type SettingsFormForm, SettingsSection, safeUrl } from "./shared"

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

const PERMISSION_OPTIONS: Array<{ value: Permission; label: string }> = [
  { value: "bookCreate", label: "Upload new books" },
  { value: "bookRead", label: "See book info" },
  { value: "bookProcess", label: "Manage book syncing" },
  { value: "bookDownload", label: "Download synced books" },
  { value: "bookList", label: "List all books" },
  { value: "bookDelete", label: "Delete books" },
  { value: "bookUpdate", label: "Change book info" },
  { value: "collectionCreate", label: "Create collections" },
  { value: "inviteList", label: "See user invites" },
  { value: "inviteDelete", label: "Delete user invites" },
  { value: "userCreate", label: "Invite new users" },
  { value: "userList", label: "List all users" },
  { value: "userRead", label: "See other users' info" },
  { value: "userDelete", label: "Delete users" },
  { value: "userUpdate", label: "Update other users' permissions" },
  { value: "settingsUpdate", label: "Change server settings" },
]

export function AuthTab() {
  const { form, lockedSettings } = useSettingsForm()

  const webUrl = useWatch({ control: form.control, name: "webUrl" })
  const authProvidersValue = useWatch({
    control: form.control,
    name: "authProviders",
  })
  const t = useTranslation("SettingsPage.tabs.auth.sections.sso")

  const {
    fields: authProviders,
    append: appendProvider,
    remove: removeProvider,
    update: updateProvider,
  } = useFieldArray({
    control: form.control,
    name: "authProviders",
  })

  const authUrl = safeUrl(webUrl, "/api/v2/auth")

  const providerTypeOptions = [
    { value: "built-in", label: t("providerTypeBuiltIn") },
    { value: "custom", label: t("providerTypeCustom") },
  ]

  const canDisablePasswordLogin = authProvidersValue.some((provider) => {
    if (provider.kind !== "custom" || !provider.allowRegistration) {
      return false
    }

    return Object.values(provider.groupPermissions ?? {}).some((permissions) =>
      permissions.includes("settingsUpdate"),
    )
  })

  const isAuthProvidersLocked = lockedSettings.has(`authProviders`)

  return (
    <div className="space-y-6">
      <SettingsSection tab="auth" section="sso">
        <Card>
          <CardHeader>
            <CardTitle
              className={cn(
                "flex items-center gap-2",
                isAuthProvidersLocked && "opacity-50",
              )}
            >
              {t("title")} {isAuthProvidersLocked && <LockTooltip />}
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authProviders.map((provider, index) => (
              <Card key={provider.id} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isAuthProvidersLocked}
                  className="text-destructive hover:text-destructive absolute top-3 right-3"
                  onClick={() => {
                    removeProvider(index)
                  }}
                >
                  <icon.Trash className="h-4 w-4" />
                </Button>
                <CardContent className="space-y-4">
                  <Controller
                    name={`authProviders.${index}.kind`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        data-disabled={isAuthProvidersLocked}
                      >
                        <FieldLabel>{t("providerType")}</FieldLabel>
                        <Select
                          items={providerTypeOptions}
                          disabled={isAuthProvidersLocked}
                          value={field.value}
                          onValueChange={(value) => {
                            if (!value) {
                              return
                            }

                            if (value === "built-in") {
                              updateProvider(index, {
                                kind: "built-in",
                                id: "keycloak",
                                issuer: "",
                                clientId: "",
                                clientSecret: "",
                              })
                            } else {
                              updateProvider(index, {
                                kind: "custom",
                                name: "",
                                issuer: "",
                                clientId: "",
                                clientSecret: "",
                                type: "oidc",
                              })
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {providerTypeOptions.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {provider.kind === "built-in" ? (
                    <BuiltInProviderFields
                      form={form}
                      index={index}
                      t={t}
                      isAuthProvidersLocked={isAuthProvidersLocked}
                    />
                  ) : (
                    <CustomProviderFields
                      form={form}
                      index={index}
                      t={t}
                      isAuthProvidersLocked={isAuthProvidersLocked}
                    />
                  )}

                  <CallbackUrlHint
                    authUrl={authUrl}
                    form={form}
                    index={index}
                    t={t}
                  />

                  <Controller
                    name={`authProviders.${index}.issuer`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        data-disabled={isAuthProvidersLocked}
                      >
                        <FieldLabel>
                          {t("issuer")}{" "}
                          {provider.kind === "custom"
                            ? t("issuerCustomRequired")
                            : t("issuerRequired")}
                        </FieldLabel>
                        <Input
                          disabled={isAuthProvidersLocked}
                          placeholder={t("issuerPlaceholder")}
                          {...field}
                          value={field.value ?? ""}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name={`authProviders.${index}.clientId`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        data-disabled={isAuthProvidersLocked}
                      >
                        <FieldLabel>{t("clientId")}</FieldLabel>
                        <Input
                          disabled={isAuthProvidersLocked}
                          {...field}
                          value={field.value}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name={`authProviders.${index}.clientSecret`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        data-disabled={isAuthProvidersLocked}
                      >
                        <FieldLabel>{t("clientSecret")}</FieldLabel>
                        <Input
                          type="password"
                          disabled={isAuthProvidersLocked}
                          {...field}
                          value={field.value}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                appendProvider({
                  kind: "built-in",
                  id: "keycloak",
                  clientId: "",
                  clientSecret: "",
                  issuer: "",
                })
              }}
            >
              <icon.Add className="size-4" />
              {t("addProvider")}
            </Button>

            <Controller
              name="disablePasswordLogin"
              control={form.control}
              render={({ field, fieldState }) => {
                const isDisablePasswordLoginDisabled =
                  !canDisablePasswordLogin && !field.value

                return (
                  <Field
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                    data-disabled={
                      isDisablePasswordLoginDisabled || isAuthProvidersLocked
                    }
                  >
                    <Switch
                      id="disablePasswordLogin"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={
                        isDisablePasswordLoginDisabled || isAuthProvidersLocked
                      }
                    />
                    <div>
                      <FieldLabel htmlFor="disablePasswordLogin">
                        {t("disablePasswordLogin")}
                        {isAuthProvidersLocked ? <LockTooltip /> : null}
                      </FieldLabel>
                      <FieldDescription>
                        {canDisablePasswordLogin
                          ? t("disablePasswordLoginDescriptionEnabled")
                          : t("disablePasswordLoginDescriptionDisabled")}
                      </FieldDescription>
                    </div>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )
              }}
            />
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}

type TranslationFn = ReturnType<
  typeof useTranslation<"SettingsPage.tabs.auth.sections.sso">
>

type GroupPermissionsValue = Record<string, Permission[]>

function CallbackUrlHint({
  authUrl,
  form,
  index,
  t,
}: {
  authUrl: string
  form: SettingsFormForm
  index: number
  t: TranslationFn
}) {
  const provider = useWatch({
    control: form.control,
    name: `authProviders.${index}`,
  })

  const providerId =
    provider.kind === "custom"
      ? customProviderId(provider.name)
      : customProviderId(provider.id)

  return (
    <p className="text-muted-foreground bg-muted rounded-md p-3 text-xs">
      {t("callbackUrl")}{" "}
      <code className="font-semibold underline">
        {authUrl}
        /callback/{providerId}
      </code>
    </p>
  )
}

function BuiltInProviderFields({
  form,
  index,
  t,
  isAuthProvidersLocked,
}: {
  form: SettingsFormForm
  index: number
  t: TranslationFn
  isAuthProvidersLocked: boolean
}) {
  const providerOptions = Object.entries(Providers).map(([key, label]) => {
    const Icon = ProviderIcons[key as keyof typeof Providers] || FallbackIcon
    const name = (
      label as (options: unknown) => {
        name: string
      }
    )({}).name

    return {
      value: key,
      label: (
        <>
          <Icon className="h-4 w-4" /> {name}
        </>
      ),
    }
  })

  return (
    <Controller
      name={`authProviders.${index}.id`}
      control={form.control}
      render={({ field, fieldState }) => {
        const selectedProvider = field.value as
          | keyof typeof Providers
          | undefined
        const Icon =
          (selectedProvider && ProviderIcons[selectedProvider]) || FallbackIcon
        const providerFactory =
          selectedProvider &&
          (Providers[selectedProvider] as
            | ((options: unknown) => { name: string })
            | undefined)
        const providerName = providerFactory ? providerFactory({}).name : ""

        return (
          <Field
            data-invalid={fieldState.invalid}
            data-disabled={isAuthProvidersLocked}
          >
            <FieldLabel>{t("provider")}</FieldLabel>
            <Select
              items={
                providerOptions as unknown as {
                  value: string
                  label: string
                }[]
              }
              value={field.value as string}
              onValueChange={field.onChange}
              disabled={isAuthProvidersLocked}
            >
              <SelectTrigger className="w-full">
                <SelectValue className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {providerName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )
      }}
    />
  )
}

function CustomProviderFields({
  form,
  index,
  t,
  isAuthProvidersLocked,
}: {
  form: SettingsFormForm
  index: number
  t: TranslationFn
  isAuthProvidersLocked: boolean
}) {
  const providerTypeOptions = [
    { value: "oidc", label: t("typeOidc") },
    { value: "oauth", label: t("typeOauth") },
  ]

  const allowRegistration = useWatch({
    control: form.control,
    name: `authProviders.${index}.allowRegistration`,
  })

  return (
    <>
      <Controller
        name={`authProviders.${index}.name`}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field
            data-invalid={fieldState.invalid}
            data-disabled={isAuthProvidersLocked}
          >
            <FieldLabel>{t("name")}</FieldLabel>
            <Input
              {...field}
              value={field.value}
              disabled={isAuthProvidersLocked}
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name={`authProviders.${index}.type`}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field
            data-invalid={fieldState.invalid}
            data-disabled={isAuthProvidersLocked}
          >
            <FieldLabel>{t("type")}</FieldLabel>
            <Select
              items={providerTypeOptions}
              value={field.value as string}
              onValueChange={field.onChange}
              disabled={isAuthProvidersLocked}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerTypeOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name={`authProviders.${index}.allowRegistration`}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field
            orientation="horizontal"
            data-invalid={fieldState.invalid}
            data-disabled={isAuthProvidersLocked}
          >
            <Switch
              id={`authProviders.${index}.allowRegistration`}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={isAuthProvidersLocked}
            />
            <div className="space-y-1">
              <FieldLabel htmlFor={`authProviders.${index}.allowRegistration`}>
                {t("allowRegistration")}
              </FieldLabel>
              <FieldDescription>
                {t("allowRegistrationDescription")}
              </FieldDescription>
            </div>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {allowRegistration && (
        <Controller
          name={`authProviders.${index}.groupPermissions`}
          control={form.control}
          render={({ field, fieldState }) => {
            return (
              <GroupPermissionsField
                index={index}
                t={t}
                value={field.value as GroupPermissionsValue | undefined}
                onChange={field.onChange}
                error={fieldState.error}
              />
            )
          }}
        />
      )}
    </>
  )
}

function GroupPermissionsField({
  index,
  t,
  value,
  onChange,
  error,
}: {
  index: number
  t: TranslationFn
  value: GroupPermissionsValue | null | undefined
  onChange: (value: GroupPermissionsValue | null) => void
  error: FormFieldError | undefined
}) {
  const groupPermissions = value ?? {}
  const groupEntries = Object.entries(groupPermissions) as Array<
    [string, Permission[]]
  >

  const setGroupPermissionsPreset = (
    groupName: string,
    permissions: Permission[],
  ) => {
    onChange({
      ...groupPermissions,
      [groupName]: permissions,
    })
  }

  const renameGroup = (currentGroupName: string, nextGroupName: string) => {
    const isDuplicateGroupName = groupEntries.some(([existingGroupName]) => {
      return (
        existingGroupName !== currentGroupName &&
        existingGroupName === nextGroupName
      )
    })

    if (isDuplicateGroupName) {
      return
    }

    const nextEntries = groupEntries.map(([existingGroupName, permissions]) => {
      if (existingGroupName === currentGroupName) {
        return [nextGroupName, permissions] as [string, Permission[]]
      }

      return [existingGroupName, permissions] as [string, Permission[]]
    })

    onChange(Object.fromEntries(nextEntries))
  }

  const removeGroup = (groupName: string) => {
    const remainingEntries = groupEntries.filter(([existingGroupName]) => {
      return existingGroupName !== groupName
    })

    if (remainingEntries.length === 0) {
      onChange(null)
      return
    }

    onChange(Object.fromEntries(remainingEntries))
  }

  const addGroup = () => {
    const hasUnnamedGroup = groupEntries.some(([groupName]) => groupName === "")

    if (hasUnnamedGroup) {
      return
    }

    onChange({
      ...groupPermissions,
      "": [...BASIC_PERMISSIONS],
    })
  }

  const togglePermission = (groupName: string, permission: Permission) => {
    const currentPermissions = groupPermissions[groupName] ?? []
    const hasPermission = currentPermissions.includes(permission)

    const nextPermissions = hasPermission
      ? currentPermissions.filter((currentPermission) => {
          return currentPermission !== permission
        })
      : [...currentPermissions, permission]

    setGroupPermissionsPreset(groupName, nextPermissions)
  }

  return (
    <FieldSet className="flex flex-col gap-2 rounded-md border p-3">
      <FieldLabel>{t("groupPermissions")}</FieldLabel>
      <FieldDescription>{t("groupPermissionsDescription")}</FieldDescription>
      <FieldGroup>
        {groupEntries.map(([groupName, permissions], groupIndex) => (
          <div
            key={groupIndex}
            className="bg-muted/30 relative flex flex-col gap-3 rounded-md border p-3"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive absolute top-2 right-2"
              onClick={() => {
                removeGroup(groupName)
              }}
            >
              <icon.Trash className="h-3.5 w-3.5" />
            </Button>

            <Field>
              <FieldLabel>{t("groupName")}</FieldLabel>
              <Input
                value={groupName}
                onChange={(event) => {
                  renameGroup(groupName, event.target.value)
                }}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setGroupPermissionsPreset(groupName, [...ADMIN_PERMISSIONS])
                }}
              >
                {t("adminPreset")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setGroupPermissionsPreset(groupName, [...BASIC_PERMISSIONS])
                }}
              >
                {t("basicPreset")}
              </Button>
            </div>

            <FieldSet>
              <FieldLabel>{t("permissions")}</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERMISSION_OPTIONS.map((permission) => {
                  const permissionId = `authProviders.${index}.groupPermissions.${groupIndex}.${permission.value}`
                  const checked = permissions.includes(permission.value)

                  return (
                    <Field
                      key={permissionId}
                      orientation="horizontal"
                      className="items-center"
                    >
                      <Checkbox
                        id={permissionId}
                        checked={checked}
                        onCheckedChange={() => {
                          togglePermission(groupName, permission.value)
                        }}
                      />
                      <FieldLabel htmlFor={permissionId}>
                        {permission.label}
                      </FieldLabel>
                    </Field>
                  )
                })}
              </div>
            </FieldSet>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={addGroup}
        >
          <icon.Add className="size-4" />
          {t("addGroup")}
        </Button>

        {error && <FieldError errors={[error]} />}
      </FieldGroup>
    </FieldSet>
  )
}

function customProviderId(name: string) {
  return name
    .toLowerCase()
    .replaceAll(/ +/g, "-")
    .replaceAll(/[^a-zA-Z0-9-]/g, "")
}
