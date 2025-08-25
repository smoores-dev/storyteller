import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost } from "../../apiHost"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { LoginForm } from "@/components/login/LoginForm"
import { Title } from "@mantine/core"
import { nextAuth } from "@/auth/auth"
import { AuthError } from "next-auth"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { PublicProvider } from "@auth/core/types"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Login",
}

export default async function Login() {
  async function credentialsLogin(data: FormData) {
    "use server"

    try {
      const usernameOrEmail = data.get("usernameOrEmail")?.valueOf() as
        | string
        | undefined
      const password = data.get("password")?.valueOf() as string | undefined
      if (!usernameOrEmail || !password) return

      const cookieOrigin = (await headers()).get("Origin")

      const secure = getCookieSecure(cookieOrigin)
      const domain = getCookieDomain(cookieOrigin)

      const formData = new FormData()
      formData.set("usernameOrEmail", usernameOrEmail)
      formData.set("password", password)

      const url = new URL(`/api/v2/token`, apiHost)

      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 401) {
          return "bad-creds"
        }
        return "failed"
      }

      const token = (await response.json()) as {
        access_token: string
        expires_in: number
        token_type: string
      }

      const cookieStore = await cookies()
      cookieStore.set("st_token", token.access_token, {
        secure,
        domain: domain,
        sameSite: "lax",
        httpOnly: true,
        expires: token.expires_in,
      })
    } catch {
      return "failed"
    }

    redirect("/")
  }

  async function oauthLogin(providerId: string) {
    "use server"
    try {
      await nextAuth.signIn(providerId)
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(error)
        return
      }
      throw error
    }
  }

  const { credentials: _, ...providers } =
    await fetchApiRoute<Record<string, PublicProvider>>("/auth/providers")

  return (
    <>
      <header>
        <Title order={2}>Login</Title>
      </header>
      <LoginForm
        credentialsLoginAction={credentialsLogin}
        oauthLoginAction={oauthLogin}
        providers={Object.values(providers)}
      />
    </>
  )
}
