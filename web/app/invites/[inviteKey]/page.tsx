import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../../apiHost"
import { ApiClient } from "@/apiClient"
import styles from "../../login/page.module.css"
import { cookies, headers } from "next/headers"
import { getCookieDomain } from "@/cookies"

export const dynamic = "force-dynamic"

type Props = {
  params: {
    inviteKey: string
  }
}

export default async function InvitePage(props: Props) {
  const client = new ApiClient(apiHost, proxyRootPath)
  const invite = await client.getInvite(props.params.inviteKey)

  async function acceptInvite(data: FormData) {
    "use server"

    const fullName = data.get("full_name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!fullName || !username || !password) return

    const cookieOrigin = headers().get("Origin")
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    const token = await client.acceptInvite({
      email: invite.email,
      full_name: fullName,
      username,
      password,
      invite_key: props.params.inviteKey,
    })

    const cookieStore = cookies()
    cookieStore.set("st_token", token.access_token, {
      secure: true,
      domain,
      sameSite: "lax",
    })

    redirect("/")
  }

  return (
    <main className={styles["main"]}>
      <header>
        <h2>Accept Invite</h2>
      </header>
      <form className={styles["form"]} action={acceptInvite}>
        <label htmlFor="email">email</label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={invite.email}
          disabled
        />
        <label htmlFor="full_name">full name</label>
        <input id="full_name" name="full_name" type="text" />
        <label htmlFor="username">username</label>
        <input
          id="username"
          name="username"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <label htmlFor="password">password</label>
        <input id="password" name="password" type="password" />
        <button type="submit">Accept</button>
      </form>
    </main>
  )
}
