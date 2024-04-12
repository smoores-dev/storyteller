import { ApiClient } from "@/apiClient"
import { getCookieDomain } from "@/cookies"
import { headers, cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../apiHost"
import styles from "./page.module.css"

export default function InitPage() {
  async function init(data: FormData) {
    "use server"

    const email = data.get("email")?.valueOf() as string | undefined
    const fullName = data.get("full_name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!fullName || !username || !password || !email) return

    const cookieOrigin = headers().get("Origin")
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    const token = await client.createAdminUser({
      email: email,
      full_name: fullName,
      username,
      password,
    })

    const cookieStore = cookies()
    cookieStore.set(
      "st_token",
      Buffer.from(JSON.stringify(token)).toString("base64"),
      { secure: true, domain, sameSite: "lax" },
    )

    redirect("/")
  }

  return (
    <main className={styles["main"]}>
      <header>
        <h2>Set up the admin user</h2>
      </header>
      <form className={styles["init-form"]} action={init}>
        <label htmlFor="email">email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="full_name">full name</label>
        <input id="full_name" name="full_name" type="text" required />
        <label htmlFor="username">username</label>
        <input
          id="username"
          name="username"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <label htmlFor="password">password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Accept</button>
      </form>
    </main>
  )
}
