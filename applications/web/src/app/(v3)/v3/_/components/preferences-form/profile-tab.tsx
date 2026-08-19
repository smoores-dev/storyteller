"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Field, FieldLabel } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type User } from "@/apiModels"
import * as icon from "@/icons"

import { unlinkAccountAction, updateProfileAction } from "./profile-actions"

export function ProfileTab({
  user,
  linkedAccounts,
  providers,
  disablePasswordLogin,
}: {
  user: User
  linkedAccounts: Array<{ provider: string; providerAccountId: string }>
  providers: Array<{ id: string; name: string }>
  disablePasswordLogin: boolean
}) {
  const t = useTranslation("PreferencesPage.profile")
  const c = useCommon()
  const router = useRouter()

  const [isSaving, setIsSaving] = useState(false)
  const [username, setUsername] = useState(user.username ?? "")
  const [email, setEmail] = useState(user.email)
  const [name, setName] = useState(user.name ?? "")
  const [password, setPassword] = useState("")

  const hasPassword = linkedAccounts.some((a) => a.provider === "credentials")
  const oauthAccounts = linkedAccounts.filter(
    (a) => a.provider !== "credentials",
  )

  const canUnlink = disablePasswordLogin
    ? oauthAccounts.length > 1
    : hasPassword || oauthAccounts.length > 1

  const unlinkedProviders = providers.filter((p) =>
    linkedAccounts.every((a) => a.provider !== p.id),
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)

    try {
      await updateProfileAction({
        username,
        email,
        name,
        password: password || undefined,
      })

      toast.success(t("savedSuccessfully"))
      setPassword("")
      router.refresh()
    } catch {
      toast.error(t("failedToSave"))
    } finally {
      setIsSaving(false)
    }
  }, [username, email, name, password, t, router])

  const handleUnlink = useCallback(
    async (provider: string, providerAccountId: string) => {
      try {
        await unlinkAccountAction({ provider, providerAccountId })
        router.refresh()
        toast.success(t("accountUnlinked"))
      } catch {
        toast.error(t("failedToUnlink"))
      }
    },
    [router, t],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>{t("username")}</FieldLabel>
            <Input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
              }}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>

          <Field>
            <FieldLabel>{t("email")}</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>

          <Field>
            <FieldLabel>{t("name")}</FieldLabel>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
            />
          </Field>

          {!disablePasswordLogin && (
            <Field>
              <FieldLabel>
                {hasPassword ? t("changePassword") : t("addPassword")}
              </FieldLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                }}
                placeholder="********"
              />
            </Field>
          )}

          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={() => {
              void handleSave()
            }}
          >
            {isSaving && <Spinner />}
            {isSaving ? c("states.saving") : t("saveProfile")}
          </Button>
        </CardContent>
      </Card>

      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("linkedAccounts")}</CardTitle>
            <CardDescription>{t("linkedAccountsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {oauthAccounts.map((account) => {
              const provider = providers.find((p) => p.id === account.provider)

              return (
                <div
                  key={account.provider}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-2">
                    <icon.Link className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-medium">
                      {provider?.name ?? account.provider}
                    </span>
                  </div>

                  {canUnlink && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        void handleUnlink(
                          account.provider,
                          account.providerAccountId,
                        )
                      }}
                    >
                      <icon.LinkOff className="mr-1 h-4 w-4" />
                      {t("unlink")}
                    </Button>
                  )}
                </div>
              )
            })}

            {unlinkedProviders.map((provider) => (
              <form
                key={provider.id}
                action={`/api/v2/auth/signin/${provider.id}?callbackUrl=${encodeURIComponent("/v3/preferences")}`}
                method="POST"
              >
                <Button type="submit" variant="outline" size="sm">
                  <icon.Link className="mr-1 h-4 w-4" />
                  {t("linkWith", { provider: provider.name })}
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
