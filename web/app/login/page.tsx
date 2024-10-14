import { ApiClient } from "@/apiClient"
import styles from "./page.module.css"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../apiHost"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { LoginForm } from "@/components/login/LoginForm"
import { Token } from "@/apiModels"

export default function Login() {
  async function login(data: FormData) {
    "use server"

    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!username || !password) return

    const cookieOrigin = headers().get("Origin")

    const secure = getCookieSecure(cookieOrigin)
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    let token: Token
    try {
      token = await client.login({ username, password })
    } catch (e) {
      return "bad-creds"
    }

    const cookieStore = cookies()
    cookieStore.set("st_token", token.access_token, {
      secure,
      domain: domain,
      sameSite: "lax",
      httpOnly: true,
    })

    redirect("/")
  }

  return (
    <main className={styles["main"]}>
      <header>
        <h2>Login</h2>
      </header>
      <LoginForm action={login} />
    </main>
  )
}
