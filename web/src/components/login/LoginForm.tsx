"use client"

import { useState } from "react"
import { Button, PasswordInput, Stack, TextInput } from "@mantine/core"
import type { PublicProvider } from "@auth/core/types"
import { IconArrowLeft } from "@tabler/icons-react"

type Props = {
  credentialsLoginAction: (
    formData: FormData,
  ) => Promise<"bad-creds" | "failed" | undefined>
  oauthLoginAction: (id: string) => Promise<void>
  providers: PublicProvider[]
}

export function LoginForm({
  credentialsLoginAction,
  oauthLoginAction,
  providers,
}: Props) {
  const [showCredentials, setShowCredentials] = useState(!providers.length)

  const [errorState, setErrorState] = useState<"bad-creds" | "failed" | null>(
    null,
  )

  if (!showCredentials) {
    return (
      <Stack gap={4}>
        <Button
          className="self-start"
          onClick={() => {
            setShowCredentials(true)
          }}
        >
          Sign in with password
        </Button>
        {providers.map((provider) => (
          <form key={provider.id} action={() => oauthLoginAction(provider.id)}>
            <Button variant="outline" type="submit">
              <span>Sign in with {provider.name}</span>
            </Button>
          </form>
        ))}
      </Stack>
    )
  }

  return (
    <>
      <Button
        variant="subtle"
        onClick={() => {
          setShowCredentials(false)
        }}
        leftSection={<IconArrowLeft />}
      >
        Sign in another way
      </Button>
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
      <form
        action={async (formData) => {
          setErrorState(null)
          const error = await credentialsLoginAction(formData)
          if (error) {
            setErrorState(error)
          }
        }}
      >
        <Stack>
          <TextInput
            label="Username or email address"
            name="usernameOrEmail"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <PasswordInput label="Password" name="password" />
          <Button className="self-end" type="submit">
            Login
          </Button>
        </Stack>
      </form>
    </>
  )
}
