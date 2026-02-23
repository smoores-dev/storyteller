import {
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { type Metadata } from "next"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { createUserToken, hashPassword } from "@/auth/auth"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { createAdminUser } from "@/database/users"

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
    <Center className="min-h-screen pb-36">
      <Paper className="w-[450px] p-8">
        <Stack className="items-stretch justify-start gap-0">
          <Stack className="items-center gap-0 pb-6">
            <Title order={2} className="text-center">
              Welcome to Storyteller!
            </Title>
            <Text className="text-center">
              Please create your admin account to get started.
            </Text>
          </Stack>
          <form action={init}>
            <Stack className="gap-3">
              <TextInput
                label="Email"
                name="email"
                type="email"
                withAsterisk
                required
                className="my-0"
                placeholder="reader@example.com"
              />
              <TextInput
                label="Full name"
                name="fullName"
                type="text"
                withAsterisk
                required
                className="my-0"
                placeholder="N. K. Jemisin"
              />
              <TextInput
                label="Username"
                name="username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                withAsterisk
                required
                className="my-0"
                placeholder="booklover84"
              />
              <PasswordInput
                label="Password"
                name="password"
                withAsterisk
                required
                className="my-0"
                placeholder="••••••••••••"
              />
            </Stack>
            <Button type="submit" className="mt-8 w-full">
              Create admin user
            </Button>
          </form>
        </Stack>
      </Paper>
    </Center>
  )
}
