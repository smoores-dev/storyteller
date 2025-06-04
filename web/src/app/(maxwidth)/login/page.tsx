import { ApiClient } from "@/apiClient"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../../apiHost"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { LoginForm } from "@/components/login/LoginForm"
import { Token } from "@/apiModels"
import { Title } from "@mantine/core"
import { createAuthedApiClient } from "@/authedApiClient"
import { nextAuth } from "@/auth/auth"
import { AuthError } from "next-auth"

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

      const client = new ApiClient(apiHost, proxyRootPath)
      let token: Token
      try {
        token = await client.login({ usernameOrEmail, password })
      } catch (e) {
        return "bad-creds"
      }

      const cookieStore = await cookies()
      cookieStore.set("st_token", token.access_token, {
        secure,
        domain: domain,
        sameSite: "lax",
        httpOnly: true,
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

  const client = await createAuthedApiClient()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials: _, ...providers } = await client.listProviders()

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
