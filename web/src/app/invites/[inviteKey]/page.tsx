import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../../apiHost"
import { ApiClient } from "@/apiClient"
import { cookies, headers } from "next/headers"
import { getCookieDomain } from "@/cookies"
import { Button, PasswordInput, TextInput, Title } from "@mantine/core"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    inviteKey: string
  }>
}

export default async function InvitePage(props: Props) {
  const client = new ApiClient(apiHost, proxyRootPath)
  const invite = await client.getInvite((await props.params).inviteKey)

  async function acceptInvite(data: FormData) {
    "use server"

    const fullName = data.get("full_name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!fullName || !username || !password) return

    const cookieOrigin = (await headers()).get("Origin")
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    const token = await client.acceptInvite({
      email: invite.email,
      full_name: fullName,
      username,
      password,
      invite_key: (await props.params).inviteKey,
    })

    const cookieStore = await cookies()
    cookieStore.set("st_token", token.access_token, {
      secure: true,
      domain,
      sameSite: "lax",
    })

    redirect("/")
  }

  return (
    <>
      <header>
        <Title order={2}>Accept Invite</Title>
      </header>
      <form action={acceptInvite}>
        <TextInput
          label="email"
          name="email"
          type="email"
          defaultValue={invite.email}
          disabled
          withAsterisk
          required
        />
        <TextInput label="Full name" name="full_name" type="text" />
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
    </>
  )
}
