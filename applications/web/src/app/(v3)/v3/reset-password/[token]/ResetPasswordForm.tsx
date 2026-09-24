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
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@v3/_/components/ui/input-group"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

const resetPasswordSchema = z
  .object({
    password: z.string().min(1, "Password is required"),
    confirm: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  })

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm({
  className,
  resetPasswordAction,
  ...props
}: React.ComponentProps<"div"> & {
  resetPasswordAction: (data: ResetPasswordFormData) => Promise<void>
}) {
  const t = useTranslation("ResetPasswordPage")

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })
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
          <form className="p-2" onSubmit={handleSubmit(resetPasswordAction)}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-heading text-3xl font-bold">
                  {t("chooseANewPassword")}
                </h1>
                <p className="text-muted-foreground text-balance">
                  {t("enterANewPassword")}
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="password">{t("newPassword")}</FieldLabel>
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
                <FieldLabel htmlFor="confirm">
                  {t("confirmNewPassword")}
                </FieldLabel>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  {...register("confirm")}
                />
                {errors.confirm && (
                  <FieldError>{errors.confirm.message}</FieldError>
                )}
              </Field>
              <Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? t("saving") : t("setNewPassword")}
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
        </CardContent>
      </Card>
    </div>
  )
}
