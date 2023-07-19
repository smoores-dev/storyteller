import { ApiClient } from "@/apiClient"
import styles from "@/app/page.module.css"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

function getCookieDomain(origin: string | null) {
  if (origin === null) {
    return undefined
  }
  const url = new URL(origin)
  console.log(url.host, url.hostname)
  return url.hostname
}

export default function Login() {
  async function login(data: FormData) {
    "use server"

    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!username || !password) return

    const apiHost = process.env["STORYTELLER_API_HOST"] ?? ""
    const client = new ApiClient({
      BASE: apiHost,
    })

    const origin = headers().get("Origin")
    const domain = getCookieDomain(origin)

    const token = await client.default.loginTokenPost({ username, password })

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
      <form action={login}>
        <div>
          <label htmlFor="username">username</label>
          <input id="username" name="username" type="text" />
        </div>
        <div>
          <label htmlFor="password">password</label>
          <input id="password" name="password" type="password" />
        </div>
        <div>
          <button type="submit">Login</button>
        </div>
      </form>
    </main>
  )
}
