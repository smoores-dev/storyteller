"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
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
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type Providers, type PublicProvider } from "@/auth/providers"
import { FallbackIcon, ProviderIcons } from "@/components/icons/ProviderIcons"
import * as icon from "@/icons"
import { api } from "@/store/api"
import { useAppDispatch } from "@/store/appState"

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
})

export type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm({
  disablePasswordLogin,
  showPasswordReset,
  className,
  credentialsLoginAction,
  oauthLoginAction,
  providers,
  ...props
}: React.ComponentProps<"div"> & {
  disablePasswordLogin: boolean
  showPasswordReset: boolean
  credentialsLoginAction: (
    data: LoginFormData,
    callbackUrl?: string,
  ) => Promise<string>
  oauthLoginAction: (providerId: string, callbackUrl?: string) => Promise<void>
  providers: PublicProvider[]
}) {
  const t = useTranslation("LoginPage")
  const dispatch = useAppDispatch()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })
  const [isLoading, setIsLoading] = useState(false)
  const searchParams = useSearchParams()

  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  async function onSubmit(data: LoginFormData) {
    try {
      setIsLoading(true)
      const error = await credentialsLoginAction(
        data,
        searchParams.get("callbackUrl") ?? undefined,
      )
      if (error) {
        setError("root", { message: error })
        setIsLoading(false)
        return
      }
    } catch (e) {
      setIsLoading(false)
      dispatch(api.util.invalidateTags(["CurrentUser"]))
      throw e
    }
  }

  const hasError =
    !!errors.usernameOrEmail || !!errors.password || !!errors.root

  const [showPassword, setShowPassword] = useState(false)

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
          {!disablePasswordLogin && (
            <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="font-heading text-3xl font-bold">
                    {t("welcomeBack")}
                  </h1>
                  <p className="text-muted-foreground text-balance">
                    {t("loginToYourStorytellerAccount")}
                  </p>
                </div>
                {searchParams.get("reset") === "success" && !hasError && (
                  <p className="text-center text-sm">
                    {t("passwordResetSuccess")}
                  </p>
                )}
                {searchParams.get("error") === "reset-invalid" && !hasError && (
                  <p className="text-destructive text-center text-sm">
                    {t("passwordResetInvalid")}
                  </p>
                )}
                {hasError && (
                  <p className="text-destructive text-center text-sm">
                    {errors.root?.message !== "bad-creds"
                      ? t("somethingWentWrongPleaseTryAgain")
                      : t("invalidUsernameOrPassword")}
                  </p>
                )}
                <Field>
                  <FieldLabel htmlFor="usernameOrEmail">
                    {t("usernameOrEmail")}
                  </FieldLabel>
                  <Input
                    id="usernameOrEmail"
                    type="text"
                    placeholder={t("usernameOrEmail")}
                    autoComplete="username"
                    {...register("usernameOrEmail")}
                  />
                  {errors.usernameOrEmail && (
                    <FieldError>{errors.usernameOrEmail.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
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
                  <Button type="submit" disabled={isLoading || !isHydrated}>
                    {isLoading ? t("loggingIn") : t("login")}
                  </Button>
                </Field>
                {showPasswordReset && (
                  <V3Link
                    href="/forgot-password"
                    className="text-muted-foreground hover:text-foreground text-center text-sm underline-offset-4 hover:underline"
                  >
                    {t("forgotPassword")}
                  </V3Link>
                )}
                {providers.length > 0 && (
                  <>
                    <FieldSeparator className="*:data-[slot=field-separator-content]:bg-transparent" />
                    {t("continueWith")}
                  </>
                )}
              </FieldGroup>
            </form>
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
                    await oauthLoginAction(
                      provider.id,
                      searchParams.get("callbackUrl") ?? undefined,
                    )
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
