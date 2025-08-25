import { getCookieDomain, getCookieSecure } from "@/cookies"
import { headers, cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Button, PasswordInput, TextInput, Title } from "@mantine/core"
import { createAdminUser } from "@/database/users"
import { createUserToken, hashPassword } from "@/auth/auth"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Setup",
}

export default function InitPage() {
  async function init(data: FormData) {
    "use server"

    const email = data.get("email")?.valueOf() as string | undefined
    const fullName = data.get("fullName")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!fullName || !username || !password || !email) return

    const cookieOrigin = (await headers()).get("Origin")
    const secure = getCookieSecure(cookieOrigin)
    const domain = getCookieDomain(cookieOrigin)

    const hashedPassword = await hashPassword(password)

    try {
      await createAdminUser(username, fullName, email, hashedPassword)
    } catch {
      redirect("/")
    }

    const token = await createUserToken(username, password)

    const cookieStore = await cookies()
    cookieStore.set("st_token", token.access_token, {
      secure,
      domain: domain,
      sameSite: "lax",
      httpOnly: true,
      expires: token.expires_in,
    })

    redirect("/")
  }

  return (
    <>
      <header>
        <Title order={2}>Set up the admin user</Title>
      </header>
      <form action={init}>
        <TextInput
          label="email"
          name="email"
          type="email"
          withAsterisk
          required
        />
        <TextInput
          label="Full name"
          name="fullName"
          type="text"
          withAsterisk
          required
        />
        <TextInput
          label="Username"
          name="username"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          withAsterisk
          required
        />
        <PasswordInput label="Password" name="password" withAsterisk required />
        <Button type="submit">Create admin user</Button>
      </form>
    </>
  )
}
