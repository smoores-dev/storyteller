"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Field, FieldLabel } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import {
  type KindleAddress,
  KindleAddressSchema,
} from "@/database/userPreferencesTypes"
import { usePermission } from "@/hooks/usePermission"
import {
  KINDLE_MAX_BOOKS,
  KINDLE_MAX_BYTES,
  type KindleRefusal,
  defaultKindleAddress,
  kindleRefusal,
} from "@/kindle"
import {
  useSendToKindleMutation,
  useUpdateUserSettingsMutation,
} from "@/store/api"
import { formatBytes } from "@/strings"
import { type UUID } from "@/uuid"

type KindleError = {
  code?: KindleRefusal | "smtp-not-configured" | "no-kindle-address"
  message?: string
  sender?: string
}

export function KindleSenderNote({ sender }: { sender: string }) {
  const t = useTranslation("Sharing.kindle")

  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">{t("approveSender")}</p>
      <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{sender}</code>
    </div>
  )
}

function KindleAddressDialog({
  sender,
  onSaved,
  onOpenChange,
}: {
  sender: string
  onSaved: (email: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("Sharing.kindle")
  const c = useCommon()
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [updateSettings, { isLoading }] = useUpdateUserSettingsMutation()

  const trimmedEmail = address.trim()
  const valid = KindleAddressSchema.safeParse({
    name: name.trim(),
    email: trimmedEmail,
    default: true,
  }).success

  async function save() {
    try {
      await updateSettings({
        kindleAddresses: [
          { name: name.trim(), email: trimmedEmail, default: true },
        ],
      }).unwrap()

      onSaved(trimmedEmail)
    } catch {
      toast.error(t("saveFailed"))
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addressTitle")}</DialogTitle>
          <DialogDescription>{t("addressDescription")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) {
              void save()
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor="kindle-name">{t("nameLabel")}</FieldLabel>
            <Input
              id="kindle-name"
              placeholder={t.plain("namePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="kindle-email">{t("addressLabel")}</FieldLabel>
            <Input
              id="kindle-email"
              type="email"
              autoFocus
              placeholder="name@kindle.com"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value)
              }}
            />
          </Field>

          {sender && <KindleSenderNote sender={sender} />}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {c("actions.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || isLoading}>
              {t("saveAndSend")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function KindlePickerDialog({
  addresses,
  onSend,
  onOpenChange,
}: {
  addresses: KindleAddress[]
  onSend: (emails: string[]) => void
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("Sharing.kindle")
  const c = useCommon()
  const defaultAddress = defaultKindleAddress(addresses)

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultAddress ? [defaultAddress.email] : []),
  )

  const toggleAddress = (email: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(email)
      } else {
        next.delete(email)
      }

      return next
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pickTitle")}</DialogTitle>
          <DialogDescription>{t("pickDescription")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (selected.size === 0) {
              return
            }

            onSend(Array.from(selected))
          }}
        >
          <div className="flex flex-col gap-2">
            {addresses.map((address, index) => {
              const isDefault = address.email === defaultAddress?.email
              const hasName = address.name.trim().length > 0

              return (
                <label
                  key={`${address.email}-${index}`}
                  className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Checkbox
                    checked={selected.has(address.email)}
                    onCheckedChange={(checked) => {
                      toggleAddress(address.email, checked)
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {hasName ? address.name : address.email}
                      </span>
                      {isDefault && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("defaultBadge")}
                        </Badge>
                      )}
                    </div>

                    {hasName && (
                      <div className="text-muted-foreground truncate text-xs">
                        {address.email}
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          <DialogFooter>
            <p className="text-muted-foreground mr-auto hidden self-center text-[0.625rem] md:block">
              {t("shiftHint")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {c("actions.cancel")}
            </Button>

            <Button type="submit" disabled={selected.size === 0}>
              {t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function useSendToKindle() {
  const t = useTranslation("Sharing.kindle")
  const router = useRouter()
  const basePath = useVersionBasePath()
  const canManageSettings = usePermission("settingsUpdate")
  const { kindleAddresses } = useUserPreferences()
  const [sendToKindle] = useSendToKindleMutation()
  const [pending, setPending] = useState<{
    books: UUID[]
    sender: string
  } | null>(null)
  const [picking, setPicking] = useState<{
    books: UUID[]
  } | null>(null)

  const refusalMessage = useCallback(
    (code: KindleRefusal) => {
      return t.plain(`refusal.${code}`, {
        max:
          code === "too-large"
            ? formatBytes(KINDLE_MAX_BYTES)
            : KINDLE_MAX_BOOKS,
      })
    },
    [t],
  )

  const sendUuids = useCallback(
    async (books: UUID[], to?: string[]) => {
      const toastId = toast.loading(t.plain("sending"))

      try {
        const result = await sendToKindle({ books, to }).unwrap()
        toast.success(t.plain("sent", { count: result.sent }), {
          id: toastId,
          description:
            result.skipped > 0
              ? t.plain("skipped", { count: result.skipped })
              : undefined,
        })
      } catch (error) {
        const data = (error as { data?: KindleError }).data

        switch (data?.code) {
          case "no-kindle-address": {
            toast.dismiss(toastId)
            setPending({ books, sender: data.sender ?? "" })
            return
          }

          case "smtp-not-configured": {
            toast.error(t.plain("smtpNotConfigured"), {
              id: toastId,
              description: canManageSettings
                ? undefined
                : t.plain("smtpNotConfiguredHint"),
              action: canManageSettings
                ? {
                    label: t.plain("openEmailSettings"),
                    onClick: () => {
                      router.push(
                        `${basePath}/settings?tab=server&section=email`,
                      )
                    },
                  }
                : undefined,
            })
            return
          }

          case "no-ebook":
          case "too-many":
          case "too-large": {
            toast.error(refusalMessage(data.code), { id: toastId })
            return
          }

          default: {
            toast.error(t.plain("failed"), {
              id: toastId,
              description: data?.message,
            })
          }
        }
      }
    },
    [t, sendToKindle, canManageSettings, router, basePath, refusalMessage],
  )

  const send = useCallback(
    (
      books: Pick<BookWithRelations, "uuid" | "ebook">[],
      modifiers?: { shiftKey?: boolean },
    ) => {
      const refusal = kindleRefusal(books)
      if (refusal) {
        toast.error(refusalMessage(refusal))
        return
      }

      const uuids = books.map((book) => book.uuid)

      if (kindleAddresses.length === 0) {
        void sendUuids(uuids)
        return
      }

      if (kindleAddresses.length === 1 || modifiers?.shiftKey) {
        const target = defaultKindleAddress(kindleAddresses)
        void sendUuids(uuids, target ? [target.email] : undefined)
        return
      }

      setPicking({ books: uuids })
    },
    [refusalMessage, kindleAddresses, sendUuids],
  )

  const dialog = (
    <>
      {pending && (
        <KindleAddressDialog
          sender={pending.sender}
          onOpenChange={(open) => {
            if (!open) {
              setPending(null)
            }
          }}
          onSaved={(email) => {
            setPending(null)
            void sendUuids(pending.books, [email])
          }}
        />
      )}

      {picking && (
        <KindlePickerDialog
          addresses={kindleAddresses}
          onOpenChange={(open) => {
            if (!open) {
              setPicking(null)
            }
          }}
          onSend={(emails) => {
            setPicking(null)
            void sendUuids(picking.books, emails)
          }}
        />
      )}
    </>
  )

  return { send, dialog, refusalMessage }
}
