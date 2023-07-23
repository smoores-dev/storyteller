import { ApiClient } from "@/apiClient"
import styles from "./login.module.css"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost } from "../apiHost"

function getCookieDomain(origin: string | null) {
  if (origin === null) {
    return undefined
  }

  const url = new URL(origin)
  return url.hostname
}

export default function Login() {
  async function login(data: FormData) {
    "use server"

    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!username || !password) return

    const origin = headers().get("Origin")
    const domain = getCookieDomain(origin)

    const client = new ApiClient(apiHost)
    const token = await client.login({ username, password })

    const cookieStore = cookies()
    cookieStore.set(
      "st_token",
      Buffer.from(JSON.stringify(token)).toString("base64"),
      { secure: true, domain: domain, sameSite: "lax" }
    )

    redirect("/")
  }

  return (
    <main className={styles["main"]}>
      <header>
        <h2>Login</h2>
      </header>
      <form className={styles["form"]} action={login}>
        <label htmlFor="username">username</label>
        <input id="username" name="username" type="text" />
        <label htmlFor="password">password</label>
        <input id="password" name="password" type="password" />
        <button type="submit">Login</button>
      </form>
    </main>
  )
}
