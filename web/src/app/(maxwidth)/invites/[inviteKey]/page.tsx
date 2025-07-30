import { redirect, unauthorized } from "next/navigation"
import { cookies, headers } from "next/headers"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { Title } from "@mantine/core"
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm"
import { createUserToken, hashPassword, nextAuth } from "@/auth/auth"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { Invite, InviteAccept } from "@/apiModels"
import { PublicProvider } from "@auth/core/types"
import {
  verifyInvite,
  createCredentialsAccount,
  acceptInvite,
} from "@/database/users"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    inviteKey: string
  }>
}

export default async function InvitePage(props: Props) {
  const { inviteKey } = await props.params
  const invite = await fetchApiRoute<Invite>(`/invites/${inviteKey}`)

  async function acceptCredentialsInvite(data: FormData) {
    "use server"

    const name = data.get("name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!name || !username || !password) return

    const cookieOrigin = (await headers()).get("Origin")
    const domain = getCookieDomain(cookieOrigin)
    const secure = getCookieSecure(cookieOrigin)

    const token = await verifyAndAcceptInvite({
      email: invite.email,
      name,
      username,
      password,
      inviteKey: inviteKey,
    })

    const cookieStore = await cookies()
    cookieStore.set("st_token", token.access_token, {
      secure,
      domain,
      sameSite: "lax",
      expires: token.expires_in,
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
  const { credentials: _, ...providers } =
    await fetchApiRoute<Record<string, PublicProvider>>("/auth/providers")

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

async function verifyAndAcceptInvite(invite: InviteAccept) {
  const verified = await verifyInvite(invite.email, invite.inviteKey)
  if (!verified) {
    unauthorized()
  }

  const hashedPassword = await hashPassword(invite.password)

  await acceptInvite(invite.email, invite.inviteKey)

  await createCredentialsAccount(
    invite.username,
    invite.name,
    invite.email,
    hashedPassword,
  )

  return await createUserToken(invite.username, invite.password)
}
