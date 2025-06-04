import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../../../apiHost"
import { ApiClient } from "@/apiClient"
import { cookies, headers } from "next/headers"
import { getCookieDomain } from "@/cookies"
import { Title } from "@mantine/core"
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm"
import { nextAuth } from "@/auth/auth"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    inviteKey: string
  }>
}

export default async function InvitePage(props: Props) {
  const { inviteKey } = await props.params
  const client = new ApiClient(apiHost, proxyRootPath)
  const invite = await client.getInvite(inviteKey)

  async function acceptCredentialsInvite(data: FormData) {
    "use server"

    const name = data.get("name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!name || !username || !password) return

    const cookieOrigin = (await headers()).get("Origin")
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = (await client.acceptInvite({
      email: invite.email,
      name,
      username,
      password,
      inviteKey: inviteKey,
    }))!

    const cookieStore = await cookies()
    cookieStore.set("st_token", token.access_token, {
      secure: true,
      domain,
      sameSite: "lax",
    })

    redirect("/")
  }

  async function acceptOauthInvite(data: FormData) {
    "use server"

    const providerId = data.get("provider")?.valueOf() as string | undefined
    if (!providerId) return

    const cookieJar = await cookies()
    cookieJar.set("st_invite", inviteKey)

    await nextAuth.signIn(providerId, { redirectTo: "/" })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials: _, ...providers } = await client.listProviders()

  return (
    <>
      <header>
        <Title order={2}>Accept Invite</Title>
      </header>
      <AcceptInviteForm
        credentialsAction={acceptCredentialsInvite}
        oauthAction={acceptOauthInvite}
        invite={invite}
        providers={Object.values(providers)}
      />
    </>
  )
}
