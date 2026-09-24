"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

import { Button } from "@v3/_/components/ui/button"
import { Card, CardContent } from "@v3/_/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@v3/_/components/ui/input-group"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type Invite } from "@/apiModels"
import { type Providers, type PublicProvider } from "@/auth/providers"
import { FallbackIcon, ProviderIcons } from "@/components/icons/ProviderIcons"
import * as icon from "@/icons"
import { api } from "@/store/api"
import { useAppDispatch } from "@/store/appState"

const acceptInviteSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
})

export type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>

export function AcceptInviteForm({
  className,
  invite,
  providers,
  credentialsAction,
  oauthAction,
  ...props
}: React.ComponentProps<"div"> & {
  invite: Invite
  providers: PublicProvider[]
  credentialsAction: (data: AcceptInviteFormData) => Promise<void>
  oauthAction: (providerId: string) => Promise<void>
}) {
  const t = useTranslation("AcceptInvitePage")
  const dispatch = useAppDispatch()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showCredentials, setShowCredentials] = useState(!providers.length)

  async function onSubmit(data: AcceptInviteFormData) {
    try {
      setIsLoading(true)
      await credentialsAction(data)
    } catch (e) {
      setIsLoading(false)
      dispatch(api.util.invalidateTags(["CurrentUser"]))
      throw e
    }
  }

  return (
    <div
      className={cn("flex flex-col items-center gap-0", className)}
      {...props}
    >
      <img
        src="/Storyteller_Logo.png"
        alt="Storyteller Logo"
        width={100}
        height={100}
      />
      <Card className="w-md max-w-sm overflow-hidden bg-transparent p-0 ring-0">
        <CardContent className="grid p-0">
          <div className="flex flex-col items-center gap-2 p-2 pb-6 text-center">
            <h1 className="font-heading text-3xl font-bold">
              {t("youAreInvited")}
            </h1>
            <p className="text-muted-foreground text-balance">
              {t("setUpYourAccount")}
            </p>
          </div>
          {showCredentials ? (
            <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    defaultValue={invite.email}
                    disabled
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="name">{t("fullName")}</FieldLabel>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    {...register("name")}
                  />
                  {errors.name && (
                    <FieldError>{errors.name.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="username">{t("username")}</FieldLabel>
                  <Input
                    id="username"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    {...register("username")}
                  />
                  {errors.username && (
                    <FieldError>{errors.username.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      {...register("password")}
                    />
                    <InputGroupButton
                      variant="ghost"
                      onClick={() => {
                        setShowPassword(!showPassword)
                      }}
                    >
                      {showPassword ? <icon.EyeOff /> : <icon.Eye />}
                    </InputGroupButton>
                  </InputGroup>
                  {errors.password && (
                    <FieldError>{errors.password.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? t("creatingAccount") : t("createAccount")}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <Field className="px-8">
              <Button
                type="button"
                onClick={() => {
                  setShowCredentials(true)
                }}
              >
                {t("signUpWithPassword")}
              </Button>
            </Field>
          )}

          {providers.length > 0 && (
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-muted my-4">
              {t("continueWith")}
            </FieldSeparator>
          )}

          <Field className="grid gap-4 px-8 pb-8">
            {providers.map((provider) => {
              const Icon =
                ProviderIcons[provider.id as keyof typeof Providers] ||
                FallbackIcon

              return (
                <form
                  key={provider.id}
                  action={async () => {
                    await oauthAction(provider.id)
                  }}
                >
                  <Button
                    variant="outline"
                    type="submit"
                    className="w-full rounded-full"
                  >
                    <Icon size={20} />
                    <span>{provider.name}</span>
                  </Button>
                </form>
              )
            })}
          </Field>
        </CardContent>
      </Card>
    </div>
  )
}
