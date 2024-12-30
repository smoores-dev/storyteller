import { ApiClient } from "@/apiClient"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../apiHost"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { LoginForm } from "@/components/login/LoginForm"
import { Token } from "@/apiModels"
import { Title } from "@mantine/core"

export default function Login() {
  async function login(data: FormData) {
    "use server"

    try {
      const username = data.get("username")?.valueOf() as string | undefined
      const password = data.get("password")?.valueOf() as string | undefined
      if (!username || !password) return

      const cookieOrigin = (await headers()).get("Origin")

      const secure = getCookieSecure(cookieOrigin)
      const domain = getCookieDomain(cookieOrigin)

      const client = new ApiClient(apiHost, proxyRootPath)
      let token: Token
      try {
        token = await client.login({ username, password })
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

  return (
    <>
      <header>
        <Title order={2}>Login</Title>
      </header>
      <LoginForm action={login} />
    </>
  )
}
