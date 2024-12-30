"use client"

import { useState } from "react"
import { Button, PasswordInput, Stack, TextInput } from "@mantine/core"

type Props = {
  action: (formData: FormData) => Promise<"bad-creds" | "failed" | undefined>
}

export function LoginForm({ action }: Props) {
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
      <form
        action={async (formData) => {
          setErrorState(null)
          const error = await action(formData)
          if (error) {
            setErrorState(error)
          }
        }}
      >
        <Stack>
          <TextInput
            label="Username or email address"
            name="username"
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
