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
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

const forgotPasswordSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or email is required"),
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm({
  className,
  requestResetAction,
  ...props
}: React.ComponentProps<"div"> & {
  requestResetAction: (data: ForgotPasswordFormData) => Promise<void>
}) {
  const t = useTranslation("ForgotPasswordPage")

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })
  const [submitted, setSubmitted] = useState(false)

  async function onSubmit(data: ForgotPasswordFormData) {
    await requestResetAction(data)
    setSubmitted(true)
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
          {submitted ? (
            <FieldGroup className="p-2">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-heading text-3xl font-bold">
                  {t("checkYourEmail")}
                </h1>
                <p className="text-muted-foreground text-balance">
                  {t("resetLinkSent")}
                </p>
              </div>
              <Button
                variant="outline"
                nativeButton={false}
                render={<V3Link href="/login">{t("backToLogin")}</V3Link>}
              />
            </FieldGroup>
          ) : (
            <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="font-heading text-3xl font-bold">
                    {t("resetYourPassword")}
                  </h1>
                  <p className="text-muted-foreground text-balance">
                    {t("enterYourUsernameOrEmail")}
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="usernameOrEmail">
                    {t("usernameOrEmail")}
                  </FieldLabel>
                  <Input
                    id="usernameOrEmail"
                    type="text"
                    placeholder={t("usernameOrEmail")}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    {...register("usernameOrEmail")}
                  />
                  {errors.usernameOrEmail && (
                    <FieldError>{errors.usernameOrEmail.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("sending") : t("sendResetLink")}
                  </Button>
                </Field>
                <V3Link
                  href="/login"
                  className="text-muted-foreground hover:text-foreground text-center text-sm underline-offset-4 hover:underline"
                >
                  {t("backToLogin")}
                </V3Link>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
