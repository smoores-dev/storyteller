"use client"

import { type PublicProvider } from "@auth/core/types"
import { Button, Divider, PasswordInput, Stack, TextInput } from "@mantine/core"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { type Providers } from "@/auth/providers"
import { FallbackIcon, ProviderIcons } from "@/components/icons/ProviderIcons"
import { api } from "@/store/api"
import { useAppDispatch } from "@/store/appState"

type Props = {
  credentialsLoginAction: (
    formData: FormData,
    callbackUrl?: string,
  ) => Promise<"bad-creds" | "failed" | undefined>
  oauthLoginAction: (id: string, callbackUrl?: string) => Promise<void>
  providers: PublicProvider[]
}

export function LoginForm({
  credentialsLoginAction,
  oauthLoginAction,
  providers,
}: Props) {
  const searchParams = useSearchParams()
  const dispatch = useAppDispatch()

  const [errorState, setErrorState] = useState<"bad-creds" | "failed" | null>(
    null,
  )

  return (
    <>
      {errorState === "bad-creds" && (
        <p className="rounded border-2 border-red-800 bg-red-800 bg-opacity-10 p-4 text-red-800">
          Invalid username or password
        </p>
      )}
      {errorState === "failed" && (
        <p className="rounded border-2 border-red-800 bg-red-800 bg-opacity-10 p-4 text-red-800">
          Failed to login. Check server logs for details.
        </p>
      )}

      <Stack className="items-stretch justify-center">
        {providers.length > 0 && (
          <Stack>
            {providers.map((provider) => {
              const Icon =
                ProviderIcons[provider.id as keyof typeof Providers] ||
                FallbackIcon

              return (
                <form
                  key={provider.id}
                  action={async () => {
                    // We don't have to worry about the cache invalidation
                    // shenanigans below for oauth login, because we get
                    // redirected to another domain entirely, triggering
                    // a full load of the layout when we redirect back
                    await oauthLoginAction(
                      provider.id,
                      searchParams.get("callbackUrl") ?? undefined,
                    )
                  }}
                >
                  <Button
                    variant="default"
                    type="submit"
                    className="w-full rounded-full"
                    leftSection={<Icon size={20} />}
                  >
                    <span>Continue with {provider.name}</span>
                  </Button>
                </form>
              )
            })}

            <Divider label="Or" labelPosition="center" className="my-2.5" />
          </Stack>
        )}

        <form
          action={async (formData) => {
            setErrorState(null)
            try {
              const error = await credentialsLoginAction(
                formData,
                searchParams.get("callbackUrl") ?? undefined,
              )
              if (error) {
                setErrorState(error)
              }
            } catch (e) {
              // Next.js uses thrown errors to trigger redirects.
              // We want to follow the redirect, but _first_ (after
              // successfully logging in), we want to invalidate
              // the current user cache, so that we retrieve the
              // new current user and update the sidebar.
              dispatch(api.util.invalidateTags(["CurrentUser"]))
              throw e
            }
          }}
        >
          <Stack className="gap-6">
            <TextInput
              required
              name="usernameOrEmail"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Email or username"
              className="my-0"
            />
            <PasswordInput
              required
              name="password"
              placeholder="Password"
              className="my-0"
            />
            <Button type="submit" className="mt-3 w-full self-end">
              Login
            </Button>
          </Stack>
        </form>
      </Stack>
    </>
  )
}
