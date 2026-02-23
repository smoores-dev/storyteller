"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

import { type Providers, type PublicProvider } from "@/auth/providers"
import { FallbackIcon, ProviderIcons } from "@/components/icons/ProviderIcons"

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
import { cn } from "@v3/_/lib/utils"

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
})

export type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm({
  className,
  credentialsLoginAction,
  oauthLoginAction,
  providers,
  ...props
}: React.ComponentProps<"div"> & {
  credentialsLoginAction: (
    data: LoginFormData,
    callbackUrl?: string,
  ) => Promise<string>
  oauthLoginAction: (providerId: string, callbackUrl?: string) => Promise<void>
  providers: PublicProvider[]
}) {
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
    } catch {
      setIsLoading(false)
      // error is handled via the error state from useLoginMutation
    }
  }

  const hasError =
    !!errors.usernameOrEmail || !!errors.password || !!errors.root

  const [showPassword, setShowPassword] = useState(false)

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
                  Welcome back!
                </h1>
                <p className="text-muted-foreground text-balance">
                  Login to your Storyteller account
                </p>
              </div>
              {hasError && (
                <p className="text-destructive text-center text-sm">
                  {errors.root?.message !== "bad-creds"
                    ? "Something went wrong. Please try again."
                    : "Invalid username or password"}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="usernameOrEmail">
                  Username or email
                </FieldLabel>
                <Input
                  id="usernameOrEmail"
                  type="text"
                  placeholder="username or email"
                  autoComplete="username"
                  {...register("usernameOrEmail")}
                />
                {errors.usernameOrEmail && (
                  <FieldError>{errors.usernameOrEmail.message}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
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
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </InputGroupButton>
                </InputGroup>
                {errors.password && (
                  <FieldError>{errors.password.message}</FieldError>
                )}
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Logging in..." : "Login"}
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-transparent">
                Or continue with
              </FieldSeparator>
            </FieldGroup>
          </form>

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
