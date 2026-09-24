import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { redirect, unauthorized } from "next/navigation"

import { type Invite, type InviteAccept } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { createUserToken, hashPassword, nextAuth } from "@/auth/auth"
import { type PublicProvider } from "@/auth/providers"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import {
  acceptInvite,
  createCredentialsAccount,
  verifyInvite,
} from "@/database/users"

import { AcceptInviteForm, type AcceptInviteFormData } from "./AcceptInviteForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AcceptInvitePage")
  return {
    title: t("title"),
  }
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

export default async function InvitePage(props: {
  params: Promise<{ inviteKey: string }>
}) {
  const { inviteKey } = await props.params
  const invite = await fetchApiRoute<Invite>(`/invites/${inviteKey}`)

  async function acceptCredentialsInvite(data: AcceptInviteFormData) {
    "use server"

    const { name, username, password } = data
    if (!name || !username || !password) return

    const reqHeaders = await headers()
    const cookieOrigin = reqHeaders.get("Origin")
    const domain = getCookieDomain(cookieOrigin)
    const secure = getCookieSecure(cookieOrigin)

    const token = await verifyAndAcceptInvite({
      email: invite.email,
      name,
      username,
      password,
      inviteKey,
    })

    const cookieStore = await cookies()
    cookieStore.set("st_token", token.access_token, {
      secure,
      domain,
      sameSite: "lax",
      expires: token.expires_in,
    })

    const basePath = reqHeaders.get("x-v3-rewritten") === "1" ? "" : "/v3"
    redirect(basePath || "/")
  }

  async function acceptOauthInvite(providerId: string) {
    "use server"

    if (!providerId) return

    const cookieJar = await cookies()
    cookieJar.set("st_invite", inviteKey)

    const basePath =
      (await headers()).get("x-v3-rewritten") === "1" ? "" : "/v3"
    await nextAuth.signIn(providerId, { redirectTo: basePath || "/" })
  }

  const { credentials: _, ...providers } =
    await fetchApiRoute<Record<string, PublicProvider>>("/auth/providers")

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <AcceptInviteForm
          invite={invite}
          providers={Object.values(providers)}
          credentialsAction={acceptCredentialsInvite}
          oauthAction={acceptOauthInvite}
        />
      </div>
    </div>
  )
}
