"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { useFormatRelativeTime } from "@v3/_/lib/formatters"
import { cn } from "@v3/_/lib/utils"

import {
  API_TOKEN_ACCESS,
  API_TOKEN_EXPIRATIONS,
  type ApiTokenCreate,
  ApiTokenCreateSchema,
} from "@/database/apiTokenTypes"
import { type ApiTokenSummary } from "@/database/apiTokens"
import * as icon from "@/icons"
import {
  useCreateApiTokenMutation,
  useDeleteApiTokenMutation,
  useListApiTokensQuery,
} from "@/store/api"

const DEFAULT_VALUES: ApiTokenCreate = {
  name: "",
  access: "reading",
  expiration: "90d",
}

const MESSAGES = "PreferencesPage.tabs.devices.sections.apiTokens"

function expiryKey(token: ApiTokenSummary, expired: boolean) {
  if (expired) {
    return "expired"
  }

  return token.idleTimeoutDays === null ? "expires" : "expiresUnlessUsed"
}

export function ApiTokensCard({
  initialTokens,
}: {
  initialTokens: ApiTokenSummary[]
}) {
  const t = useTranslation(MESSAGES)
  const { data: tokens = initialTokens } = useListApiTokensQuery()

  const [createOpen, setCreateOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tokens.map((token) => (
          <ApiTokenRow key={token.uuid} token={token} />
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setCreateOpen(true)
          }}
        >
          <icon.Plus className="mr-1 h-4 w-4" />
          {t("create")}
        </Button>

        <CreateApiTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
      </CardContent>
    </Card>
  )
}

function ApiTokenRow({ token }: { token: ApiTokenSummary }) {
  const t = useTranslation(MESSAGES)
  const formatRelativeTime = useFormatRelativeTime()
  const [deleteApiToken] = useDeleteApiTokenMutation()

  const now = new Date()
  const expired = !!token.expiresAt && new Date(token.expiresAt) <= now

  const { confirm, dialogProps } = useConfirmAction({
    title: t("revokeTitle", { name: token.name }),
    description: t("revokeDescription"),
    confirmLabel: t("revoke"),
    variant: "destructive",
    onConfirm: async () => {
      try {
        await deleteApiToken({ uuid: token.uuid }).unwrap()
        toast.success(t("revoked"))
      } catch {
        toast.error(t("failedToRevoke"))
      }
    },
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <icon.Key className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">{token.name}</span>
          <Badge variant="secondary">
            {token.scope ? t("access.reading.title") : t("access.full.title")}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          <code>{token.tokenStart}…</code>
          {" · "}
          {token.lastUsedAt
            ? t("lastUsed", {
                when: formatRelativeTime(token.lastUsedAt, { now }),
              })
            : t("neverUsed")}
          {" · "}
          <span className={cn(expired && "text-destructive")}>
            {token.expiresAt
              ? t(expiryKey(token, expired), {
                  when: formatRelativeTime(token.expiresAt, { now }),
                })
              : t("neverExpires")}
          </span>
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={confirm}
      >
        <icon.Trash className="mr-1 h-4 w-4" />
        {t("revoke")}
      </Button>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

function CreateApiTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation(MESSAGES)
  const c = useCommon()
  const [createApiToken, { isLoading: isCreating }] =
    useCreateApiTokenMutation()

  const [token, setToken] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApiTokenCreate>({
    resolver: zodResolver(ApiTokenCreateSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset(DEFAULT_VALUES)
      setToken(null)
    }

    onOpenChange(next)
  }

  const onSubmit = async (data: ApiTokenCreate) => {
    try {
      const created = await createApiToken(data).unwrap()
      setToken(created.token)
    } catch {
      toast.error(t("failedToCreate"))
    }
  }

  const handleCopy = async () => {
    if (!token) {
      return
    }

    await navigator.clipboard.writeText(token)
    toast.success(t("copied"))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {token ? t("createdTitle") : t("createTitle")}
          </DialogTitle>
          {token && (
            <DialogDescription>{t("createdDescription")}</DialogDescription>
          )}
        </DialogHeader>

        {token ? (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={token} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleCopy()
                }}
              >
                <icon.Copy className="mr-1 h-4 w-4" />
                {t("copy")}
              </Button>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  handleOpenChange(false)
                }}
              >
                {t("done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="pb-4">
              <Field>
                <FieldLabel htmlFor="api-token-name">{t("name")}</FieldLabel>
                <Input
                  id="api-token-name"
                  placeholder={t("namePlaceholder")}
                  maxLength={100}
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                {errors.name && <FieldError>{t("nameRequired")}</FieldError>}
              </Field>

              <Controller
                name="access"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    {API_TOKEN_ACCESS.map((option) => (
                      <FieldLabel
                        key={option}
                        htmlFor={`api-token-access-${option}`}
                        className="has-data-checked:border-primary"
                      >
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>
                              {t(`access.${option}.title`)}
                            </FieldTitle>
                            <FieldDescription>
                              {t(`access.${option}.description`)}
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem
                            value={option}
                            id={`api-token-access-${option}`}
                          />
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                )}
              />

              <Controller
                name="expiration"
                control={control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>{t("expiration.label")}</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={API_TOKEN_EXPIRATIONS.map((option) => ({
                        value: option,
                        label: t(`expiration.${option}`),
                      }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {API_TOKEN_EXPIRATIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`expiration.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={isCreating}>
                {isCreating && <Spinner />}
                {isCreating ? c("states.saving") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
