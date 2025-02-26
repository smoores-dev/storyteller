import { ApiClient } from "@/apiClient"
import { getCookieDomain } from "@/cookies"
import { headers, cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, proxyRootPath } from "../apiHost"
import { Button, PasswordInput, TextInput, Title } from "@mantine/core"

export default function InitPage() {
  async function init(data: FormData) {
    "use server"

    const email = data.get("email")?.valueOf() as string | undefined
    const fullName = data.get("full_name")?.valueOf() as string | undefined
    const username = data.get("username")?.valueOf() as string | undefined
    const password = data.get("password")?.valueOf() as string | undefined
    if (!fullName || !username || !password || !email) return

    const cookieOrigin = (await headers()).get("Origin")
    const domain = getCookieDomain(cookieOrigin)

    const client = new ApiClient(apiHost, proxyRootPath)
    const token = await client.createAdminUser({
      email: email,
      full_name: fullName,
      username,
      password,
    })

    const cookieStore = await cookies()
    cookieStore.set(
      "st_token",
      Buffer.from(JSON.stringify(token)).toString("base64"),
      { secure: true, domain, sameSite: "lax" },
    )

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
          name="full_name"
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
