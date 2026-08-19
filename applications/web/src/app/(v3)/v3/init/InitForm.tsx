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
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

const initSchema = z.object({
  email: z.email("A valid email is required"),
  fullName: z.string().min(1, "Full name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
})

export type InitFormData = z.infer<typeof initSchema>

export function InitForm({
  className,
  initAction,
  ...props
}: React.ComponentProps<"div"> & {
  initAction: (data: InitFormData) => Promise<string>
}) {
  const t = useTranslation("InitPage")

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<InitFormData>({
    resolver: zodResolver(initSchema),
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function onSubmit(data: InitFormData) {
    try {
      setIsLoading(true)
      const error = await initAction(data)
      if (error) {
        setError("root", { message: error })
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }

  return (
    <div
      className={cn("flex flex-col items-center gap-6", className)}
      {...props}
    >
      <Card className="w-md overflow-hidden bg-transparent p-0 ring-0">
        <CardContent className="grid p-0">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-heading text-3xl font-bold">
                  {t("welcomeToStoryteller")}
                </h1>
                <p className="text-muted-foreground text-balance">
                  {t("createYourAdminAccount")}
                </p>
              </div>
              {!!errors.root && (
                <p className="text-destructive text-center text-sm">
                  {t("somethingWentWrongPleaseTryAgain")}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="reader@example.com"
                  autoComplete="email"
                  {...register("email")}
                />
                {errors.email && (
                  <FieldError>{errors.email.message}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="fullName">{t("fullName")}</FieldLabel>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="N. K. Jemisin"
                  autoComplete="name"
                  {...register("fullName")}
                />
                {errors.fullName && (
                  <FieldError>{errors.fullName.message}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="username">{t("username")}</FieldLabel>
                <Input
                  id="username"
                  type="text"
                  placeholder="booklover84"
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
                  {isLoading ? t("creatingAdminUser") : t("createAdminUser")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
