import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { createUserToken, hashPassword } from "@/auth/auth"
import { getCookieDomain, getCookieSecure } from "@/cookies"
import { createAdminUser, getUsers } from "@/database/users"

import { InitForm, type InitFormData } from "./InitForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("InitPage")
  return {
    title: t("title"),
  }
}

export default async function InitPage() {
  const users = await getUsers()
  if (users.length > 0) {
    redirect("/v3/login")
  }

  async function init(data: InitFormData): Promise<string> {
    "use server"

    const { email, fullName, username, password } = data
    if (!email || !fullName || !username || !password) return "failed"

    const cookieOrigin = (await headers()).get("Origin")
    const secure = getCookieSecure(cookieOrigin)
    const domain = getCookieDomain(cookieOrigin)

    const hashedPassword = await hashPassword(password)

    try {
      await createAdminUser(username, fullName, email, hashedPassword)

      const token = await createUserToken(username, password)

      const cookieStore = await cookies()
      cookieStore.set("st_token", token.access_token, {
        secure,
        domain,
        sameSite: "lax",
        httpOnly: true,
        expires: token.expires_in,
      })
    } catch {
      return "failed"
    }

    const reqHeaders = await headers()
    const basePath = reqHeaders.get("x-v3-rewritten") === "1" ? "" : "/v3"
    redirect(basePath || "/")
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <InitForm initAction={init} />
      </div>
    </div>
  )
}
