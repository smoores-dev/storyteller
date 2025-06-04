"use client"

import { Invite } from "@/apiModels"
import { TextInput, PasswordInput, Button, Stack } from "@mantine/core"
import { useState } from "react"
import type { PublicProvider } from "@auth/core/types"

interface Props {
  credentialsAction: (formData: FormData) => Promise<void>
  oauthAction: (formData: FormData) => Promise<void>
  invite: Invite
  providers: PublicProvider[]
}

export function AcceptInviteForm({
  credentialsAction,
  oauthAction,
  invite,
  providers,
}: Props) {
  const [showCredentials, setShowCredentials] = useState(!providers.length)

  if (!showCredentials) {
    return (
      <Stack gap={4}>
        <Button
          type="button"
          className="self-start"
          onClick={() => {
            setShowCredentials(true)
          }}
        >
          Sign in with password
        </Button>
        {providers.map((provider) => (
          <form key={provider.id} action={oauthAction}>
            <input
              id="provider"
              name="provider"
              hidden
              readOnly
              value={provider.id}
            />
            <Button variant="outline" type="submit">
              <span>Sign in with {provider.name}</span>
            </Button>
          </form>
        ))}
      </Stack>
    )
  }

  return (
    <form action={credentialsAction}>
      <TextInput
        label="email"
        name="email"
        type="email"
        defaultValue={invite.email}
        disabled
        withAsterisk
        required
      />
      <TextInput
        label="Full name"
        name="name"
        type="text"
        withAsterisk
        required
      />
      <TextInput
        label="Username"
        name="username"
        type="text"
        autoCapitalize="none"
        autoCorrect="off"
        withAsterisk
        required
      />
      <PasswordInput label="Password" name="password" withAsterisk required />
      <Button mt={16} type="submit">
        Accept
      </Button>
    </form>
  )
}
